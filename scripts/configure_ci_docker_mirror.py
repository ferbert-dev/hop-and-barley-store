#!/usr/bin/env python3
"""Prefer mirror.gcr.io on ephemeral GitHub-hosted Linux runners only."""

from __future__ import annotations

import copy
import json
import os
import stat
import subprocess
import tempfile
from pathlib import Path
from typing import Mapping, NoReturn


MIRROR_URL = "https://mirror.gcr.io"
DAEMON_CONFIG_PATH = Path("/etc/docker/daemon.json")


class MirrorConfigurationError(RuntimeError):
    """Raised when changing the runner daemon would not be safe."""


def require_ephemeral_github_runner(environment: Mapping[str, str]) -> None:
    expected = {
        "CI": "true",
        "GITHUB_ACTIONS": "true",
        "RUNNER_ENVIRONMENT": "github-hosted",
        "RUNNER_OS": "Linux",
    }
    mismatches = [
        f"{name}={environment.get(name, '<unset>')!r}"
        for name, value in expected.items()
        if environment.get(name) != value
    ]
    if mismatches:
        raise MirrorConfigurationError(
            "refusing to configure Docker outside an ephemeral GitHub-hosted "
            f"Linux runner ({', '.join(mismatches)})"
        )


def merge_registry_mirror(config: object) -> tuple[dict[str, object], bool]:
    if not isinstance(config, dict):
        raise MirrorConfigurationError("Docker daemon config must be a JSON object")

    existing = config.get("registry-mirrors", [])
    if not isinstance(existing, list) or any(
        not isinstance(value, str) or not value for value in existing
    ):
        raise MirrorConfigurationError(
            "Docker daemon registry-mirrors must be an array of non-empty strings"
        )

    merged = copy.deepcopy(config)
    merged["registry-mirrors"] = [
        MIRROR_URL,
        *(value for value in existing if value != MIRROR_URL),
    ]
    return merged, merged != config


def read_daemon_config(
    path: Path,
) -> tuple[dict[str, object], bytes | None, os.stat_result | None]:
    if path.is_symlink():
        raise MirrorConfigurationError(f"refusing symlinked Docker config: {path}")
    if not path.exists():
        return {}, None, None
    if not path.is_file():
        raise MirrorConfigurationError(f"Docker config is not a regular file: {path}")

    try:
        original = path.read_bytes()
        parsed = json.loads(original)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise MirrorConfigurationError(
            f"cannot read valid JSON from Docker config: {path}"
        ) from error

    if not isinstance(parsed, dict):
        raise MirrorConfigurationError("Docker daemon config must be a JSON object")
    return parsed, original, path.stat()


def write_bytes_atomically(
    path: Path,
    content: bytes,
    original_stat: os.stat_result | None,
) -> None:
    if path.is_symlink():
        raise MirrorConfigurationError(f"refusing symlinked Docker config: {path}")
    if path.parent.is_symlink() or not path.parent.is_dir():
        raise MirrorConfigurationError(
            f"Docker config parent must be a real directory: {path.parent}"
        )

    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", dir=path.parent
    )
    temporary_path = Path(temporary_name)
    try:
        mode = stat.S_IMODE(original_stat.st_mode) if original_stat else 0o644
        os.fchmod(descriptor, mode)
        if original_stat is not None:
            os.fchown(descriptor, original_stat.st_uid, original_stat.st_gid)
        with os.fdopen(descriptor, "wb") as output:
            descriptor = -1
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary_path, path)
        directory_descriptor = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory_descriptor)
        finally:
            os.close(directory_descriptor)
    finally:
        if descriptor >= 0:
            os.close(descriptor)
        temporary_path.unlink(missing_ok=True)


def write_daemon_config(
    path: Path, config: dict[str, object], original_stat: os.stat_result | None
) -> None:
    rendered = (json.dumps(config, indent=2, sort_keys=True) + "\n").encode()
    write_bytes_atomically(path, rendered, original_stat)


def reject_running_containers(container_ids: str) -> None:
    if container_ids.strip():
        raise MirrorConfigurationError(
            "refusing to restart Docker while containers are already running"
        )


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        check=True,
        capture_output=True,
        text=True,
    )


def fail(message: str) -> NoReturn:
    raise MirrorConfigurationError(message)


def configure_runner_daemon(path: Path = DAEMON_CONFIG_PATH) -> None:
    require_ephemeral_github_runner(os.environ)
    if os.geteuid() != 0:
        fail("Docker daemon configuration requires root")

    try:
        run(["systemctl", "is-active", "--quiet", "docker"])
        reject_running_containers(run(["docker", "ps", "--quiet"]).stdout)
    except subprocess.CalledProcessError as error:
        raise MirrorConfigurationError(
            "Docker must be active and inspectable before mirror configuration"
        ) from error

    config, original, original_stat = read_daemon_config(path)
    merged, changed = merge_registry_mirror(config)
    if not changed:
        print(f"Docker already prefers {MIRROR_URL}; restart skipped.")
        return

    write_daemon_config(path, merged, original_stat)
    restart_attempted = False
    try:
        reject_running_containers(run(["docker", "ps", "--quiet"]).stdout)
        restart_attempted = True
        run(["systemctl", "restart", "docker"])
        run(["systemctl", "is-active", "--quiet", "docker"])
        effective_output = run(
            ["docker", "info", "--format", "{{json .RegistryConfig.Mirrors}}"]
        ).stdout
        effective_mirrors = json.loads(effective_output)
        if not isinstance(effective_mirrors, list) or not effective_mirrors:
            fail("Docker did not report an effective registry mirror")
        if (
            not isinstance(effective_mirrors[0], str)
            or effective_mirrors[0].rstrip("/") != MIRROR_URL
        ):
            fail(f"Docker does not prefer {MIRROR_URL} after restart")
    except (json.JSONDecodeError, MirrorConfigurationError, subprocess.CalledProcessError) as error:
        try:
            if original is None:
                path.unlink(missing_ok=True)
            else:
                write_bytes_atomically(path, original, original_stat)
            if restart_attempted:
                run(["systemctl", "restart", "docker"])
        except (OSError, MirrorConfigurationError, subprocess.CalledProcessError) as rollback_error:
            raise MirrorConfigurationError(
                "mirror configuration failed and the original daemon state could not be restored"
            ) from rollback_error
        raise MirrorConfigurationError(
            "mirror configuration failed; original daemon config restored"
        ) from error

    print(f"Docker now prefers {MIRROR_URL} on this ephemeral runner.")


if __name__ == "__main__":
    try:
        configure_runner_daemon()
    except MirrorConfigurationError as error:
        raise SystemExit(f"error: {error}") from error
