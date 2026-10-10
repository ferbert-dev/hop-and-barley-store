from __future__ import annotations

import importlib.util
import json
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, call, patch


SCRIPT_PATH = Path(__file__).with_name("configure_ci_docker_mirror.py")
SPEC = importlib.util.spec_from_file_location("configure_ci_docker_mirror", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
mirror = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mirror)


class RunnerGuardTests(unittest.TestCase):
    def setUp(self) -> None:
        self.environment = {
            "CI": "true",
            "GITHUB_ACTIONS": "true",
            "RUNNER_ENVIRONMENT": "github-hosted",
            "RUNNER_OS": "Linux",
        }

    def test_accepts_only_the_ephemeral_github_hosted_linux_identity(self) -> None:
        mirror.require_ephemeral_github_runner(self.environment)

        for name, value in (
            ("CI", "false"),
            ("GITHUB_ACTIONS", "false"),
            ("RUNNER_ENVIRONMENT", "self-hosted"),
            ("RUNNER_OS", "macOS"),
        ):
            with self.subTest(name=name), self.assertRaises(
                mirror.MirrorConfigurationError
            ):
                mirror.require_ephemeral_github_runner(
                    {**self.environment, name: value}
                )


class DaemonConfigTests(unittest.TestCase):
    def test_prepends_mirror_and_preserves_options_and_existing_mirrors(self) -> None:
        original = {
            "features": {"containerd-snapshotter": True},
            "log-driver": "json-file",
            "registry-mirrors": ["https://existing.example", "https://backup.example"],
        }

        merged, changed = mirror.merge_registry_mirror(original)

        self.assertTrue(changed)
        self.assertEqual(original["registry-mirrors"], ["https://existing.example", "https://backup.example"])
        self.assertEqual(
            merged,
            {
                "features": {"containerd-snapshotter": True},
                "log-driver": "json-file",
                "registry-mirrors": [
                    mirror.MIRROR_URL,
                    "https://existing.example",
                    "https://backup.example",
                ],
            },
        )

    def test_promotes_existing_google_mirror_once_and_is_idempotent(self) -> None:
        merged, changed = mirror.merge_registry_mirror(
            {
                "registry-mirrors": [
                    "https://existing.example",
                    mirror.MIRROR_URL,
                    mirror.MIRROR_URL,
                ]
            }
        )
        self.assertTrue(changed)
        self.assertEqual(
            merged["registry-mirrors"],
            [mirror.MIRROR_URL, "https://existing.example"],
        )
        repeated, repeated_changed = mirror.merge_registry_mirror(merged)
        self.assertFalse(repeated_changed)
        self.assertEqual(repeated, merged)

    def test_rejects_non_object_and_malformed_mirror_values(self) -> None:
        invalid_values = ([], {"registry-mirrors": "not-an-array"}, {"registry-mirrors": [""]}, {"registry-mirrors": [3]})
        for value in invalid_values:
            with self.subTest(value=value), self.assertRaises(
                mirror.MirrorConfigurationError
            ):
                mirror.merge_registry_mirror(value)

    def test_temp_fixture_rejects_malformed_json_and_symlinks(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            malformed = root / "malformed.json"
            malformed.write_text("{not json", encoding="utf-8")
            with self.assertRaises(mirror.MirrorConfigurationError):
                mirror.read_daemon_config(malformed)

            valid = root / "valid.json"
            valid.write_text("{}\n", encoding="utf-8")
            symlink = root / "daemon.json"
            symlink.symlink_to(valid)
            with self.assertRaises(mirror.MirrorConfigurationError):
                mirror.read_daemon_config(symlink)
            with self.assertRaises(mirror.MirrorConfigurationError):
                mirror.write_daemon_config(symlink, {}, None)

    def test_temp_fixture_atomic_write_preserves_file_mode(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "daemon.json"
            path.write_text('{"debug": false}\n', encoding="utf-8")
            path.chmod(0o640)
            _, _, original_stat = mirror.read_daemon_config(path)

            expected = {"debug": False, "registry-mirrors": [mirror.MIRROR_URL]}
            mirror.write_daemon_config(path, expected, original_stat)

            self.assertEqual(json.loads(path.read_text(encoding="utf-8")), expected)
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o640)

    def test_running_container_guard_fails_closed(self) -> None:
        mirror.reject_running_containers("\n")
        with self.assertRaises(mirror.MirrorConfigurationError):
            mirror.reject_running_containers("container-id\n")


class DaemonLifecycleTests(unittest.TestCase):
    environment = {
        "CI": "true",
        "GITHUB_ACTIONS": "true",
        "RUNNER_ENVIRONMENT": "github-hosted",
        "RUNNER_OS": "Linux",
    }

    @staticmethod
    def completed(stdout: str = "") -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess([], 0, stdout, "")

    def test_non_runner_refuses_before_commands_or_writes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "daemon.json"
            original = b'{"debug": false}\n'
            path.write_bytes(original)
            command = Mock()

            with (
                patch.object(
                    mirror.os,
                    "environ",
                    {**self.environment, "RUNNER_ENVIRONMENT": "self-hosted"},
                ),
                patch.object(mirror.os, "geteuid", return_value=0),
                patch.object(mirror, "run", command),
                self.assertRaises(mirror.MirrorConfigurationError),
            ):
                mirror.configure_runner_daemon(path)

            command.assert_not_called()
            self.assertEqual(path.read_bytes(), original)

    def test_running_containers_refuse_before_write(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "daemon.json"
            original = b'{"debug": false}\n'
            path.write_bytes(original)
            command = Mock(
                side_effect=[self.completed(), self.completed("container-id\n")]
            )

            with (
                patch.object(mirror.os, "environ", self.environment),
                patch.object(mirror.os, "geteuid", return_value=0),
                patch.object(mirror, "run", command),
                self.assertRaises(mirror.MirrorConfigurationError),
            ):
                mirror.configure_runner_daemon(path)

            self.assertEqual(path.read_bytes(), original)
            self.assertEqual(
                command.call_args_list,
                [
                    call(["systemctl", "is-active", "--quiet", "docker"]),
                    call(["docker", "ps", "--quiet"]),
                ],
            )

    def test_success_restarts_and_verifies_the_effective_mirror(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "daemon.json"
            path.write_text(
                '{"debug": false, "registry-mirrors": ["https://existing.example"]}\n',
                encoding="utf-8",
            )
            command = Mock(
                side_effect=[
                    self.completed(),
                    self.completed(),
                    self.completed(),
                    self.completed(),
                    self.completed(),
                    self.completed('["https://mirror.gcr.io/"]\n'),
                ]
            )

            with (
                patch.object(mirror.os, "environ", self.environment),
                patch.object(mirror.os, "geteuid", return_value=0),
                patch.object(mirror, "run", command),
                patch("builtins.print"),
            ):
                mirror.configure_runner_daemon(path)

            configured = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(configured["debug"], False)
            self.assertEqual(
                configured["registry-mirrors"],
                [mirror.MIRROR_URL, "https://existing.example"],
            )
            self.assertIn(
                call(["systemctl", "restart", "docker"]), command.call_args_list
            )
            self.assertEqual(
                command.call_args_list[-1],
                call(
                    [
                        "docker",
                        "info",
                        "--format",
                        "{{json .RegistryConfig.Mirrors}}",
                    ]
                ),
            )

    def test_effective_mirror_failure_restores_exact_original_bytes(self) -> None:
        for effective_output in (
            '["https://unexpected.example/"]\n',
            "[3]\n",
        ):
            with self.subTest(effective_output=effective_output):
                with tempfile.TemporaryDirectory() as directory:
                    path = Path(directory) / "daemon.json"
                    original = b'{ "debug": false, "registry-mirrors": ["https://existing.example"] }\n'
                    path.write_bytes(original)
                    command = Mock(
                        side_effect=[
                            self.completed(),
                            self.completed(),
                            self.completed(),
                            self.completed(),
                            self.completed(),
                            self.completed(effective_output),
                            self.completed(),
                        ]
                    )

                    with (
                        patch.object(mirror.os, "environ", self.environment),
                        patch.object(mirror.os, "geteuid", return_value=0),
                        patch.object(mirror, "run", command),
                        self.assertRaisesRegex(
                            mirror.MirrorConfigurationError,
                            "original daemon config restored",
                        ),
                    ):
                        mirror.configure_runner_daemon(path)

                    self.assertEqual(path.read_bytes(), original)
                    self.assertEqual(
                        command.call_args_list.count(
                            call(["systemctl", "restart", "docker"])
                        ),
                        2,
                    )


if __name__ == "__main__":
    unittest.main()
