#!/usr/bin/env python3
"""Restricted SSH receiver for versioned Hop & Barley production releases."""

from dataclasses import dataclass
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.request

REPOSITORY = "ferbert-dev/hop-and-barley-store"
ROOT = Path("/opt/hopbarley")
BASE_ENV = Path("/etc/hopbarley/production.env")
MAX_COMPRESSED = 2 * 1024**3
MAX_EXPANDED = 6 * 1024**3
DEPLOY_FILES = ("compose.prod.yaml", "Caddyfile", "generate-env.sh", "deploy-release.sh")
VERSION_PATTERN = r"V(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)"
SHA_PATTERN = r"[0-9a-f]{40}"
HASH_PATTERN = r"[0-9a-f]{64}"
IMAGE_NAMES = ("web", "api", "migrate")
HEALTH_URLS = (
    "https://hopbarley.shop/api/v1/health/ready",
    "https://hopbarley.shop/",
)
HEALTH_ATTEMPTS = 12
HEALTH_DELAY_SECONDS = 5


@dataclass(frozen=True)
class Command:
    action: str
    version: str
    revision: str
    archive_hash: str | None = None


def parse_command(command):
    deploy = re.fullmatch(
        rf"(deploy|deploy-initial) ({VERSION_PATTERN}) ({SHA_PATTERN}) ({HASH_PATTERN})",
        command,
    )
    if deploy:
        return Command(deploy[1], deploy[2], deploy[3], deploy[4])
    rollback = re.fullmatch(rf"rollback ({VERSION_PATTERN}) ({SHA_PATTERN})", command)
    if rollback:
        return Command("rollback", rollback[1], rollback[2])
    raise ValueError("Expected deploy, deploy-initial, or rollback with exact release identifiers")


def fetch_json(url):
    request = urllib.request.Request(url, headers={"User-Agent": "hopbarley-deploy"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def resolve_tag(version):
    ref = fetch_json(f"https://api.github.com/repos/{REPOSITORY}/git/ref/tags/{version}")
    target = ref.get("object", {})
    if target.get("type") == "commit":
        return target.get("sha")
    if target.get("type") == "tag" and re.fullmatch(SHA_PATTERN, target.get("sha", "")):
        annotated = fetch_json(
            f"https://api.github.com/repos/{REPOSITORY}/git/tags/{target['sha']}"
        )
        annotated_target = annotated.get("object", {})
        if annotated_target.get("type") == "commit":
            return annotated_target.get("sha")
    raise ValueError("Release tag must resolve directly or through one annotated tag to a commit")


def validate_release_source(version, revision):
    if resolve_tag(version) != revision:
        raise ValueError("Release tag does not resolve to the requested commit")
    comparison = fetch_json(
        f"https://api.github.com/repos/{REPOSITORY}/compare/{revision}...main"
    )
    if comparison.get("status") not in {"ahead", "identical"}:
        raise ValueError("Release commit is not in main history")


def verify_archive(path, revision):
    expected = {f"hopbarley/{name}:{revision}" for name in IMAGE_NAMES}
    with tarfile.open(path, "r:gz") as archive:
        size = 0
        manifests = []
        for member in archive:
            size += member.size
            if size > MAX_EXPANDED:
                raise ValueError("Image archive exceeds the expanded size limit")
            if member.name == "manifest.json":
                if not member.isfile() or member.size > 64 * 1024:
                    raise ValueError("Invalid image manifest")
                manifests.append(json.load(archive.extractfile(member)))
        if len(manifests) != 1:
            raise ValueError("Expected one Docker image manifest")
        entries = manifests[0]
        tags = [tag for entry in entries for tag in entry.get("RepoTags", [])]
        if len(entries) != 3 or len(tags) != 3 or set(tags) != expected:
            raise ValueError("Archive must contain only the three requested release tags")


def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def inspect_release_images(revision, version):
    image_ids = {}
    output_format = (
        '{{.Id}}|{{.Os}}/{{.Architecture}}|'
        '{{index .Config.Labels "org.opencontainers.image.revision"}}|'
        '{{index .Config.Labels "org.opencontainers.image.version"}}'
    )
    for name in IMAGE_NAMES:
        ref = f"hopbarley/{name}:{revision}"
        result = run(
            "docker",
            "image",
            "inspect",
            "--format",
            output_format,
            ref,
            capture_output=True,
            text=True,
        )
        image_id, platform, image_revision, image_version = result.stdout.strip().split("|", 3)
        if (
            not re.fullmatch(r"sha256:[0-9a-f]{64}", image_id)
            or platform != "linux/amd64"
            or image_revision != revision
            or image_version != version
        ):
            raise ValueError("Image identity, platform, revision, or version label mismatch")
        image_ids[name] = image_id
    return image_ids


def database_query(release, sql):
    compose = release / "deploy" / "compose.prod.yaml"
    env = release / "release.env"
    return run(
        "docker",
        "compose",
        "--env-file",
        str(env),
        "-f",
        str(compose),
        "exec",
        "-T",
        "postgres",
        "psql",
        "--username",
        "hopbarley",
        "--dbname",
        "hopbarley",
        "--tuples-only",
        "--no-align",
        "--command",
        sql,
        capture_output=True,
    )


def migration_fingerprint(release):
    pending = database_query(
        release,
        'SELECT count(*) FROM "_prisma_migrations" '
        "WHERE finished_at IS NULL AND rolled_back_at IS NULL",
    ).stdout.decode().strip()
    if pending != "0":
        raise ValueError("Database contains an unresolved Prisma migration")
    applied = database_query(
        release,
        "SELECT migration_name || ':' || checksum "
        'FROM "_prisma_migrations" '
        "WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL "
        "ORDER BY migration_name",
    ).stdout
    if not applied:
        raise ValueError("Applied migration history is empty")
    return hashlib.sha256(applied).hexdigest()


def verify_public_health():
    last_error = None
    for attempt in range(HEALTH_ATTEMPTS):
        try:
            for url in HEALTH_URLS:
                request = urllib.request.Request(url, headers={"User-Agent": "hopbarley-deploy"})
                with urllib.request.urlopen(request, timeout=15) as response:
                    if response.status < 200 or response.status >= 300:
                        raise ValueError(f"Unexpected public health status for {url}")
                    response.read(1)
            return
        except (OSError, ValueError, urllib.error.URLError) as error:
            last_error = error
            if attempt + 1 < HEALTH_ATTEMPTS:
                time.sleep(HEALTH_DELAY_SECONDS)
    raise ValueError(f"Public HTTPS verification failed: {last_error}")


def persist_json(path, value, exclusive):
    descriptor, name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, "w") as output:
            json.dump(value, output, indent=2, sort_keys=True)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        if exclusive:
            # Publish the complete inode atomically without replacing any record.
            os.link(temporary, path)
        else:
            temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)
    directory = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def write_json_exclusive(path, value):
    persist_json(path, value, exclusive=True)


def write_json_atomic(path, value):
    persist_json(path, value, exclusive=False)


def image_reference_id(ref):
    result = subprocess.run(
        ("docker", "image", "inspect", "--format", "{{.Id}}", ref),
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    return result.stdout.strip() if result.returncode == 0 else None


def ensure_version_aliases_absent(version):
    for name in IMAGE_NAMES:
        if image_reference_id(f"hopbarley/{name}:{version}") is not None:
            raise ValueError("Version image alias already exists")


def tag_images(image_ids, tag):
    for name in IMAGE_NAMES:
        run("docker", "image", "tag", image_ids[name], f"hopbarley/{name}:{tag}")


def reconcile_version_aliases(manifest):
    for name in IMAGE_NAMES:
        ref = f"hopbarley/{name}:{manifest['version']}"
        existing = image_reference_id(ref)
        if existing is None:
            run("docker", "image", "tag", manifest["image_ids"][name], ref)
        elif existing != manifest["image_ids"][name]:
            raise ValueError("Version image alias has a different immutable image ID")


def reconcile_json(path, value):
    if path.exists():
        if not path.is_file() or json.loads(path.read_text()) != value:
            raise ValueError(f"Immutable release state differs: {path.name}")
        return
    write_json_exclusive(path, value)


def promote_links(release):
    current = ROOT / "current"
    if current.exists() and not current.is_symlink():
        raise ValueError("Current release pointer is not a symlink")
    if current.is_symlink():
        current_target = current.resolve()
        if current_target != release.resolve() and current_target.is_dir():
            previous = ROOT / "previous"
            previous.unlink(missing_ok=True)
            previous.symlink_to(current_target)
    temporary = ROOT / "current.next"
    temporary.unlink(missing_ok=True)
    temporary.symlink_to(release)
    temporary.replace(current)


def restart_release_apps(release):
    compose = release / "deploy" / "compose.prod.yaml"
    env = release / "release.env"
    prefix = ("docker", "compose", "--env-file", str(env), "-f", str(compose))
    run(*prefix, "up", "--detach", "--wait", "api", "web", "caddy")


def publish_new_success(release, manifest):
    # A prior failed release may have replaced the shared Compose services. Always
    # recreate the intended candidate before checking public health.
    restart_release_apps(release)
    verify_public_health()
    reconcile_version_aliases(manifest)
    reconcile_json(release / "success.json", manifest)
    tag_images(manifest["image_ids"], "latest")
    write_json_atomic(ROOT / "latest.json", manifest)
    promote_links(release)


def load_success(version, revision):
    release = ROOT / "releases" / version
    success = release / "success.json"
    if not success.is_file():
        raise ValueError("Rollback target has no successful deployment manifest")
    manifest = json.loads(success.read_text())
    if manifest.get("version") != version or manifest.get("revision") != revision:
        raise ValueError("Rollback target version mapping does not match")
    image_ids = manifest.get("image_ids")
    migration = manifest.get("migration_fingerprint")
    if (
        not isinstance(image_ids, dict)
        or set(image_ids) != set(IMAGE_NAMES)
        or any(
            not isinstance(image_ids[name], str)
            or not re.fullmatch(r"sha256:[0-9a-f]{64}", image_ids[name])
            for name in IMAGE_NAMES
        )
        or not isinstance(migration, str)
        or not re.fullmatch(HASH_PATTERN, migration)
    ):
        raise ValueError("Rollback target manifest is invalid")
    return release, manifest


def verify_retained_images(manifest):
    for name in IMAGE_NAMES:
        expected = manifest["image_ids"][name]
        by_id = run(
            "docker", "image", "inspect", "--format", "{{.Id}}", expected,
            capture_output=True, text=True,
        ).stdout.strip()
        by_version = run(
            "docker", "image", "inspect", "--format", "{{.Id}}",
            f"hopbarley/{name}:{manifest['version']}",
            capture_output=True, text=True,
        ).stdout.strip()
        if by_id != expected or by_version != expected:
            raise ValueError("Retained rollback image identity mismatch")


def verify_candidate_images(candidate):
    output_format = (
        '{{.Id}}|{{.Os}}/{{.Architecture}}|'
        '{{index .Config.Labels "org.opencontainers.image.revision"}}|'
        '{{index .Config.Labels "org.opencontainers.image.version"}}'
    )
    for name in IMAGE_NAMES:
        expected = candidate["image_ids"][name]
        result = run(
            "docker", "image", "inspect", "--format", output_format, expected,
            capture_output=True, text=True,
        )
        image_id, platform, revision, version = result.stdout.strip().split("|", 3)
        if (
            image_id != expected
            or platform != "linux/amd64"
            or revision != candidate["revision"]
            or version != candidate["version"]
        ):
            raise ValueError("Retained candidate image identity or labels mismatch")


def rollback_release(version, revision):
    release, manifest = load_success(version, revision)
    current = ROOT / "current"
    if not current.is_symlink():
        raise ValueError("There is no current successful release to roll back")
    verify_retained_images(manifest)
    if migration_fingerprint(release) != manifest["migration_fingerprint"]:
        raise ValueError("Database migration fingerprint differs from rollback target")
    compose = release / "deploy" / "compose.prod.yaml"
    env = release / "release.env"
    prefix = ("docker", "compose", "--env-file", str(env), "-f", str(compose))
    run(*prefix, "stop", "caddy", "web", "api")
    run(*prefix, "up", "--detach", "--wait", "api", "web", "caddy")
    verify_public_health()
    tag_images(manifest["image_ids"], "latest")
    write_json_atomic(ROOT / "latest.json", manifest)
    promote_links(release)
    (ROOT / "pending.json").unlink(missing_ok=True)
    print(f"Rolled back to {version} ({revision}); database was not changed", flush=True)


def receive_archive(release, revision, expected_hash, retain=True):
    incoming = release / "images.tar.gz.partial"
    archive_hash = hashlib.sha256()
    total = 0
    try:
        with incoming.open("wb") as output:
            while chunk := sys.stdin.buffer.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_COMPRESSED:
                    raise ValueError("Image archive exceeds the transfer size limit")
                archive_hash.update(chunk)
                output.write(chunk)
        if archive_hash.hexdigest() != expected_hash:
            raise ValueError("Image archive SHA256 mismatch")
        verify_archive(incoming, revision)
        if retain:
            image_archive = release / "images.tar.gz"
            incoming.replace(image_archive)
            (release / "images.sha256").write_text(expected_hash + "  images.tar.gz\n")
            return image_archive
        return None
    finally:
        incoming.unlink(missing_ok=True)


def fetch_deploy_files(release, revision):
    deploy = release / "deploy"
    deploy.mkdir(exist_ok=True)
    for name in DEPLOY_FILES:
        url = f"https://raw.githubusercontent.com/{REPOSITORY}/{revision}/deploy/{name}"
        with urllib.request.urlopen(url, timeout=30) as response:
            content = response.read(256 * 1024 + 1)
        if len(content) > 256 * 1024:
            raise ValueError("Deployment configuration exceeds size limit")
        (deploy / name).write_bytes(content)
    return deploy


def release_is_current(release):
    current = ROOT / "current"
    return current.is_symlink() and current.resolve() == release.resolve()


def validate_candidate(candidate, version, revision):
    image_ids = candidate.get("image_ids")
    if (
        candidate.get("version") != version
        or candidate.get("revision") != revision
        or not re.fullmatch(HASH_PATTERN, candidate.get("archive_sha256", ""))
        or not isinstance(image_ids, dict)
        or set(image_ids) != set(IMAGE_NAMES)
        or any(
            not isinstance(image_ids[name], str)
            or not re.fullmatch(r"sha256:[0-9a-f]{64}", image_ids[name])
            for name in IMAGE_NAMES
        )
    ):
        raise ValueError("Immutable release candidate mapping is invalid or different")
    return candidate


def candidate_identity(candidate):
    return {
        "image_ids": candidate["image_ids"],
        "revision": candidate["revision"],
        "version": candidate["version"],
    }


def initial_finalized(owner):
    complete = ROOT / "initial-complete.json"
    return complete.is_file() and json.loads(complete.read_text()) == owner


def reconcile_pending(candidate):
    pending = ROOT / "pending.json"
    expected = candidate_identity(candidate)
    if pending.exists():
        if json.loads(pending.read_text()) != expected:
            # A newly versioned forward fix may supersede a failed candidate.
            # The old candidate remains retained but can no longer self-promote.
            write_json_atomic(pending, expected)
    else:
        write_json_exclusive(pending, expected)


def clear_pending(candidate):
    pending = ROOT / "pending.json"
    if pending.exists() and json.loads(pending.read_text()) == candidate_identity(candidate):
        pending.unlink()


def build_release_env(release, candidate):
    overrides = {
        "RELEASE_ID": candidate["version"],
        **{f"{name.upper()}_IMAGE": candidate["image_ids"][name] for name in IMAGE_NAMES},
    }
    lines = [
        line for line in BASE_ENV.read_text().splitlines()
        if line.split("=", 1)[0] not in overrides
    ]
    env = release / "release.env"
    env.write_text(
        "\n".join(lines + [f"{key}={value}" for key, value in overrides.items()]) + "\n"
    )
    env.chmod(0o600)
    return env


def load_deployment(release, candidate):
    path = release / "deployment.json"
    if not path.is_file():
        return None
    manifest = json.loads(path.read_text())
    validate_candidate(manifest, candidate["version"], candidate["revision"])
    if candidate_identity(manifest) != candidate_identity(candidate):
        raise ValueError("Deployment state differs from the immutable candidate")
    fingerprint = manifest.get("migration_fingerprint", "")
    if not re.fullmatch(HASH_PATTERN, fingerprint):
        raise ValueError("Deployment migration fingerprint is invalid")
    return manifest


def deploy_release(command):
    release = ROOT / "releases" / command.version
    candidate_path = release / "candidate.json"
    success_path = release / "success.json"
    finalized_path = release / "finalized.json"
    initial = command.action == "deploy-initial"

    if finalized_path.is_file() and not release_is_current(release):
        finalized = json.loads(finalized_path.read_text())
        if (
            finalized.get("version") == command.version
            and finalized.get("revision") == command.revision
        ):
            raise ValueError("Successful historical versions are append-only; use rollback")

    initial_path = ROOT / "initial.json"
    initial_complete = ROOT / "initial-complete.json"
    if initial:
        if initial_complete.exists():
            raise ValueError("Initial deployment has already completed")
        if initial_path.exists():
            existing_owner = json.loads(initial_path.read_text())
            if (
                existing_owner.get("version") != command.version
                or existing_owner.get("revision") != command.revision
            ):
                raise ValueError("Initial deployment is owned by a different release")
    elif not initial_complete.is_file():
        raise ValueError("Initial deployment is unfinished; resume deploy-initial")

    if candidate_path.is_file():
        candidate = validate_candidate(
            json.loads(candidate_path.read_text()), command.version, command.revision
        )
        receive_archive(release, command.revision, command.archive_hash, retain=False)
        verify_candidate_images(candidate)
    else:
        ensure_version_aliases_absent(command.version)
        release.mkdir(parents=True, exist_ok=True)
        image_archive = receive_archive(release, command.revision, command.archive_hash)
        fetch_deploy_files(release, command.revision)
        run("docker", "load", "--input", str(image_archive))
        image_ids = inspect_release_images(command.revision, command.version)
        candidate = {
            "archive_sha256": command.archive_hash,
            "image_ids": image_ids,
            "revision": command.revision,
            "version": command.version,
        }
        write_json_exclusive(candidate_path, candidate)

    pending = ROOT / "pending.json"
    pending_matches = (
        pending.is_file()
        and json.loads(pending.read_text()) == candidate_identity(candidate)
    )
    if success_path.is_file() and not release_is_current(release) and not pending_matches:
        raise ValueError("Interrupted release is no longer active; use rollback")
    reconcile_pending(candidate)
    fetch_deploy_files(release, command.revision)
    BASE_ENV.parent.mkdir(parents=True, exist_ok=True)
    owner = candidate_identity(candidate)
    if initial:
        if initial_path.exists():
            if json.loads(initial_path.read_text()) != owner:
                raise ValueError("Initial deployment is owned by a different release")
            if initial_finalized(owner):
                raise ValueError("Initial deployment has already completed")
        else:
            if BASE_ENV.exists():
                raise ValueError("Server environment exists without initial ownership state")
            write_json_exclusive(initial_path, owner)
        reconcile_json(release / "initial-owner.json", owner)
        if not BASE_ENV.exists():
            run(
                "sh", str(release / "deploy" / "generate-env.sh"), str(BASE_ENV),
                command.version, *[candidate["image_ids"][name] for name in IMAGE_NAMES],
            )
    else:
        if not initial_path.is_file():
            raise ValueError("First deployment requires deploy-initial")
        initial_owner = json.loads(initial_path.read_text())
        if not initial_finalized(initial_owner):
            raise ValueError("Initial deployment is unfinished; resume deploy-initial")
        if not BASE_ENV.is_file():
            raise ValueError("Protected server environment is missing")

    env = build_release_env(release, candidate)
    manifest = load_deployment(release, candidate)
    if manifest is None:
        args = ["sh", str(release / "deploy" / "deploy-release.sh"), str(env)]
        if initial:
            args.append("--seed-initial")
        run(*args)
        manifest = {
            **candidate,
            "deployed_at": datetime.now(timezone.utc).isoformat(),
            "migration_fingerprint": migration_fingerprint(release),
        }
        write_json_exclusive(release / "deployment.json", manifest)
    elif migration_fingerprint(release) != manifest["migration_fingerprint"]:
        raise ValueError("Database migration fingerprint changed during release recovery")

    if success_path.exists() and json.loads(success_path.read_text()) != manifest:
        raise ValueError("Successful release manifest differs from deployment state")
    publish_new_success(release, manifest)
    reconcile_json(finalized_path, manifest)
    if initial:
        reconcile_json(initial_complete, owner)
    clear_pending(candidate)
    print(
        f"Release {command.version} ({command.revision}) is healthy and promoted",
        flush=True,
    )


def main():
    if os.geteuid() != 0:
        raise ValueError("Receiver must run as root")
    command = parse_command(sys.argv[1] if len(sys.argv) == 2 else "")
    os.umask(0o077)
    ROOT.mkdir(parents=True, exist_ok=True)
    with (ROOT / "deploy.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        validate_release_source(command.version, command.revision)
        if command.action == "rollback":
            rollback_release(command.version, command.revision)
        else:
            deploy_release(command)


if __name__ == "__main__":
    try:
        main()
    except (
        ValueError,
        OSError,
        subprocess.CalledProcessError,
        urllib.error.URLError,
    ) as error:
        # Never dump subprocess environments or the server-local configuration.
        print(f"Deployment failed: {error}", file=sys.stderr)
        sys.exit(1)
