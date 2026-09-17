import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest import mock

spec = importlib.util.spec_from_file_location(
    "receiver", Path(__file__).with_name("receive-release.py")
)
receiver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(receiver)

VERSION = "V1.0.0"
SHA = "a" * 40
HASH = "b" * 64
IMAGE_IDS = {name: f"sha256:{str(index) * 64}" for index, name in enumerate(receiver.IMAGE_NAMES, 1)}


class ReceiverBoundaryTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)

    def test_interrupted_immutable_write_leaves_retryable_absent_record(self):
        path = self.root / "candidate.json"
        value = {"version": VERSION, "revision": SHA, "image_ids": IMAGE_IDS}

        def interrupt(_value, output, **_kwargs):
            output.write('{"version":')
            raise OSError("interrupted write")

        with mock.patch.object(receiver.json, "dump", side_effect=interrupt):
            with self.assertRaisesRegex(OSError, "interrupted write"):
                receiver.write_json_exclusive(path, value)
        self.assertFalse(path.exists())
        self.assertEqual(list(self.root.iterdir()), [])
        receiver.reconcile_json(path, value)
        self.assertEqual(json.loads(path.read_text()), value)
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_atomic_immutable_publication_never_replaces_existing_record(self):
        path = self.root / "candidate.json"
        original = {"version": VERSION}
        receiver.write_json_exclusive(path, original)
        with self.assertRaises(FileExistsError):
            receiver.write_json_exclusive(path, {"version": "V9.9.9"})
        self.assertEqual(json.loads(path.read_text()), original)
        self.assertEqual(list(self.root.iterdir()), [path])

    def test_interrupted_latest_write_preserves_previous_complete_record(self):
        path = self.root / "latest.json"
        previous = {"version": VERSION}
        receiver.write_json_atomic(path, previous)

        def interrupt(_value, output, **_kwargs):
            output.write('{"version":')
            raise OSError("interrupted write")

        with mock.patch.object(receiver.json, "dump", side_effect=interrupt):
            with self.assertRaisesRegex(OSError, "interrupted write"):
                receiver.write_json_atomic(path, {"version": "V1.0.1"})
        self.assertEqual(json.loads(path.read_text()), previous)
        self.assertEqual(list(self.root.iterdir()), [path])
        receiver.write_json_atomic(path, {"version": "V1.0.1"})
        self.assertEqual(json.loads(path.read_text()), {"version": "V1.0.1"})

    def test_commands_reject_injection_and_noncanonical_versions(self):
        self.assertEqual(
            receiver.parse_command(f"deploy {VERSION} {SHA} {HASH}"),
            receiver.Command("deploy", VERSION, SHA, HASH),
        )
        self.assertEqual(
            receiver.parse_command(f"deploy-initial {VERSION} {SHA} {HASH}"),
            receiver.Command("deploy-initial", VERSION, SHA, HASH),
        )
        self.assertEqual(
            receiver.parse_command(f"rollback {VERSION} {SHA}"),
            receiver.Command("rollback", VERSION, SHA),
        )
        invalid = (
            "",
            "sh",
            f"deploy {VERSION} {SHA} {HASH}; id",
            f"deploy {VERSION} {SHA} {HASH}\n",
            f"deploy V01.0.0 {SHA} {HASH}",
            f"deploy v1.0.0 {SHA} {HASH}",
            f"rollback {VERSION} {SHA} extra",
        )
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(ValueError):
                receiver.parse_command(value)

    def test_resolves_lightweight_and_annotated_tags(self):
        with mock.patch.object(
            receiver, "fetch_json", return_value={"object": {"type": "commit", "sha": SHA}}
        ):
            self.assertEqual(receiver.resolve_tag(VERSION), SHA)
        tag_object = "c" * 40
        with mock.patch.object(
            receiver,
            "fetch_json",
            side_effect=[
                {"object": {"type": "tag", "sha": tag_object}},
                {"object": {"type": "commit", "sha": SHA}},
            ],
        ):
            self.assertEqual(receiver.resolve_tag(VERSION), SHA)

    def test_rejects_tag_mismatch_and_non_main_commit(self):
        with mock.patch.object(receiver, "resolve_tag", return_value="c" * 40):
            with self.assertRaisesRegex(ValueError, "does not resolve"):
                receiver.validate_release_source(VERSION, SHA)
        with (
            mock.patch.object(receiver, "resolve_tag", return_value=SHA),
            mock.patch.object(receiver, "fetch_json", return_value={"status": "diverged"}),
        ):
            with self.assertRaisesRegex(ValueError, "not in main"):
                receiver.validate_release_source(VERSION, SHA)

    def archive(self, tags, duplicate=False):
        path = self.root / f"images-{len(list(self.root.iterdir()))}.tar.gz"
        manifest = json.dumps([{"RepoTags": entry} for entry in tags]).encode()
        with tarfile.open(path, "w:gz") as archive:
            for _ in range(2 if duplicate else 1):
                member = tarfile.TarInfo("manifest.json")
                member.size = len(manifest)
                archive.addfile(member, io.BytesIO(manifest))
        return path

    def test_archive_accepts_only_three_sha_tags(self):
        expected = [[f"hopbarley/{name}:{SHA}"] for name in receiver.IMAGE_NAMES]
        receiver.verify_archive(self.archive(expected), SHA)
        variants = (
            expected + [["unrelated/image:latest"]],
            expected[:2],
            [["hopbarley/web:wrong"], *expected[1:]],
            [[*expected[0], "unrelated/image:latest"], *expected[1:]],
            [expected[0], expected[0], expected[2]],
        )
        for tags in variants:
            with self.subTest(tags=tags), self.assertRaises(ValueError):
                receiver.verify_archive(self.archive(tags), SHA)
        with self.assertRaises(ValueError):
            receiver.verify_archive(self.archive(expected, duplicate=True), SHA)

    def test_archive_checks_expanded_size_before_loading(self):
        old_limit = receiver.MAX_EXPANDED
        receiver.MAX_EXPANDED = 1
        try:
            with self.assertRaisesRegex(ValueError, "expanded size"):
                receiver.verify_archive(
                    self.archive([[f"hopbarley/web:{SHA}"]]),
                    SHA,
                )
        finally:
            receiver.MAX_EXPANDED = old_limit

    def test_refuses_redeploy_of_successful_version(self):
        release = self.root / "releases" / VERSION
        release.mkdir(parents=True)
        (release / "success.json").write_text("{}")
        (release / "finalized.json").write_text(json.dumps({"version": VERSION, "revision": SHA}))
        command = receiver.Command("deploy", VERSION, SHA, HASH)
        with mock.patch.object(receiver, "ROOT", self.root):
            with self.assertRaisesRegex(ValueError, "append-only"):
                receiver.deploy_release(command)

    def test_refuses_existing_version_alias_before_creating_release_state(self):
        command = receiver.Command("deploy-initial", VERSION, SHA, HASH)
        with (
            mock.patch.object(receiver, "ROOT", self.root),
            mock.patch.object(receiver, "image_reference_id", return_value=IMAGE_IDS["web"]),
            mock.patch.object(receiver, "receive_archive") as receive,
        ):
            with self.assertRaisesRegex(ValueError, "alias already exists"):
                receiver.deploy_release(command)
        receive.assert_not_called()
        self.assertFalse((self.root / "releases" / VERSION).exists())

    def test_image_inspection_requires_platform_revision_and_version_labels(self):
        valid = [
            subprocess.CompletedProcess(
                ("docker",),
                0,
                stdout=f"{IMAGE_IDS[name]}|linux/amd64|{SHA}|{VERSION}\n",
            )
            for name in receiver.IMAGE_NAMES
        ]
        with mock.patch.object(receiver, "run", side_effect=valid):
            self.assertEqual(receiver.inspect_release_images(SHA, VERSION), IMAGE_IDS)
        invalid = subprocess.CompletedProcess(
            ("docker",),
            0,
            stdout=f"{IMAGE_IDS['web']}|linux/amd64|{SHA}|V9.9.9\n",
        )
        with mock.patch.object(receiver, "run", return_value=invalid):
            with self.assertRaisesRegex(ValueError, "version label"):
                receiver.inspect_release_images(SHA, VERSION)

    def test_failed_public_health_never_promotes_or_tags(self):
        release = self.root / "releases" / VERSION
        release.mkdir(parents=True)
        manifest = {
            "version": VERSION,
            "revision": SHA,
            "image_ids": IMAGE_IDS,
            "migration_fingerprint": HASH,
        }
        with (
            mock.patch.object(receiver, "ROOT", self.root),
            mock.patch.object(
                receiver, "verify_public_health", side_effect=ValueError("unhealthy")
            ),
            mock.patch.object(receiver, "run") as run,
        ):
            with self.assertRaisesRegex(ValueError, "unhealthy"):
                receiver.publish_new_success(release, manifest)
        self.assertEqual(run.call_count, 1)
        self.assertIn("compose", run.call_args.args)
        self.assertFalse((release / "success.json").exists())
        self.assertFalse((self.root / "latest.json").exists())
        self.assertFalse((self.root / "current").exists())

    def test_promotion_retry_reconciles_matching_immutable_state(self):
        release = self.root / "releases" / VERSION
        release.mkdir(parents=True)
        manifest = {
            "version": VERSION,
            "revision": SHA,
            "image_ids": IMAGE_IDS,
            "migration_fingerprint": HASH,
        }
        aliases = {}

        def reference_id(ref):
            return aliases.get(ref)

        def tag_images(image_ids, tag):
            for name in receiver.IMAGE_NAMES:
                aliases[f"hopbarley/{name}:{tag}"] = image_ids[name]

        real_atomic = receiver.write_json_atomic
        attempts = 0

        def fail_latest_once(path, value):
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise OSError("interrupted after success manifest")
            real_atomic(path, value)

        with (
            mock.patch.object(receiver, "ROOT", self.root),
            mock.patch.object(receiver, "restart_release_apps"),
            mock.patch.object(receiver, "verify_public_health"),
            mock.patch.object(receiver, "image_reference_id", side_effect=reference_id),
            mock.patch.object(receiver, "tag_images", side_effect=tag_images),
            mock.patch.object(receiver, "write_json_atomic", side_effect=fail_latest_once),
            mock.patch.object(receiver, "run") as run,
        ):
            with self.assertRaisesRegex(OSError, "interrupted"):
                receiver.publish_new_success(release, manifest)
            self.assertEqual(json.loads((release / "success.json").read_text()), manifest)
            receiver.publish_new_success(release, manifest)

        run.assert_has_calls(
            [
                mock.call("docker", "image", "tag", IMAGE_IDS[name], f"hopbarley/{name}:{VERSION}")
                for name in receiver.IMAGE_NAMES
            ]
        )
        self.assertEqual(json.loads((self.root / "latest.json").read_text()), manifest)
        self.assertEqual((self.root / "current").resolve(), release.resolve())

    def test_promotion_refuses_mismatched_version_alias(self):
        manifest = {
            "version": VERSION,
            "revision": SHA,
            "image_ids": IMAGE_IDS,
            "migration_fingerprint": HASH,
        }
        with mock.patch.object(receiver, "image_reference_id", return_value="sha256:" + "f" * 64):
            with self.assertRaisesRegex(ValueError, "different immutable"):
                receiver.reconcile_version_aliases(manifest)

    def test_initial_retry_reuses_owned_environment_after_failure(self):
        release = self.root / "releases" / VERSION
        release.mkdir(parents=True)
        candidate = {
            "archive_sha256": HASH,
            "version": VERSION,
            "revision": SHA,
            "image_ids": IMAGE_IDS,
        }
        (release / "candidate.json").write_text(json.dumps(candidate))
        base_env = self.root / "etc" / "production.env"
        command = receiver.Command("deploy-initial", VERSION, SHA, HASH)
        deploy_attempts = 0

        def command_run(*args, **kwargs):
            nonlocal deploy_attempts
            if args[0:2] == ("sh", str(release / "deploy" / "generate-env.sh")):
                base_env.parent.mkdir(parents=True, exist_ok=True)
                base_env.write_text("COMPOSE_PROJECT_NAME=hopbarley\n")
                base_env.chmod(0o600)
            elif args[0:2] == ("sh", str(release / "deploy" / "deploy-release.sh")):
                deploy_attempts += 1
                if deploy_attempts == 1:
                    raise subprocess.CalledProcessError(75, args)
            return subprocess.CompletedProcess(args, 0, stdout="")

        patches = (
            mock.patch.object(receiver, "ROOT", self.root),
            mock.patch.object(receiver, "BASE_ENV", base_env),
            mock.patch.object(receiver, "receive_archive"),
            mock.patch.object(receiver, "fetch_deploy_files", side_effect=lambda *args: (release / "deploy").mkdir(exist_ok=True)),
            mock.patch.object(receiver, "verify_candidate_images"),
            mock.patch.object(receiver, "migration_fingerprint", return_value=HASH),
            mock.patch.object(receiver, "publish_new_success"),
            mock.patch.object(receiver, "run", side_effect=command_run),
        )
        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6], patches[7]:
            with self.assertRaises(subprocess.CalledProcessError):
                receiver.deploy_release(command)
            self.assertTrue((self.root / "initial.json").is_file())
            self.assertTrue(base_env.is_file())
            receiver.deploy_release(command)

        self.assertEqual(deploy_attempts, 2)
        self.assertTrue((release / "deployment.json").is_file())
        self.assertFalse((self.root / "pending.json").exists())

    def test_initial_completion_survives_later_current_versions(self):
        owner = {"version": VERSION, "revision": SHA, "image_ids": IMAGE_IDS}
        receiver.write_json_exclusive(self.root / "initial-complete.json", owner)
        later = self.root / "releases" / "V1.0.2"
        later.mkdir(parents=True)
        (self.root / "current").symlink_to(later)
        with mock.patch.object(receiver, "ROOT", self.root):
            self.assertTrue(receiver.initial_finalized(owner))

    def test_interrupted_success_without_current_resumes_active_candidate(self):
        release = self.root / "releases" / VERSION
        release.mkdir(parents=True)
        candidate = {
            "archive_sha256": HASH,
            "version": VERSION,
            "revision": SHA,
            "image_ids": IMAGE_IDS,
        }
        manifest = {**candidate, "deployed_at": "now", "migration_fingerprint": HASH}
        for name, value in (
            ("candidate.json", candidate),
            ("deployment.json", manifest),
            ("success.json", manifest),
        ):
            (release / name).write_text(json.dumps(value))
        (self.root / "pending.json").write_text(json.dumps(receiver.candidate_identity(candidate)))
        initial_owner = {"version": "V0.9.0", "revision": "c" * 40, "image_ids": IMAGE_IDS}
        (self.root / "initial.json").write_text(json.dumps(initial_owner))
        (self.root / "initial-complete.json").write_text(json.dumps(initial_owner))
        base_env = self.root / "production.env"
        base_env.write_text("COMPOSE_PROJECT_NAME=hopbarley\n")
        command = receiver.Command("deploy", VERSION, SHA, HASH)
        with (
            mock.patch.object(receiver, "ROOT", self.root),
            mock.patch.object(receiver, "BASE_ENV", base_env),
            mock.patch.object(receiver, "receive_archive"),
            mock.patch.object(receiver, "verify_candidate_images"),
            mock.patch.object(receiver, "fetch_deploy_files"),
            mock.patch.object(receiver, "migration_fingerprint", return_value=HASH),
            mock.patch.object(receiver, "publish_new_success"),
        ):
            receiver.deploy_release(command)
        self.assertTrue((release / "finalized.json").is_file())
        self.assertFalse((self.root / "pending.json").exists())

    def test_new_forward_candidate_supersedes_pending_pointer(self):
        old = {"version": "V1.0.1", "revision": "c" * 40, "image_ids": IMAGE_IDS}
        new = {"version": "V1.0.2", "revision": "d" * 40, "image_ids": IMAGE_IDS}
        (self.root / "pending.json").write_text(json.dumps(receiver.candidate_identity(old)))
        with mock.patch.object(receiver, "ROOT", self.root):
            receiver.reconcile_pending(new)
        self.assertEqual(
            json.loads((self.root / "pending.json").read_text()),
            receiver.candidate_identity(new),
        )

    def test_rollback_reuses_retained_apps_without_schema_writes(self):
        release = self.root / "releases" / VERSION
        (release / "deploy").mkdir(parents=True)
        (release / "deploy" / "compose.prod.yaml").write_text("services: {}\n")
        (release / "release.env").write_text("COMPOSE_PROJECT_NAME=hopbarley\n")
        manifest = {
            "version": VERSION,
            "revision": SHA,
            "image_ids": IMAGE_IDS,
            "migration_fingerprint": HASH,
        }
        (release / "success.json").write_text(json.dumps(manifest))
        current_release = self.root / "releases" / "V1.1.0"
        current_release.mkdir()
        (self.root / "current").symlink_to(current_release)
        commands = []

        def capture(*args, **kwargs):
            commands.append(args)
            return subprocess.CompletedProcess(args, 0, stdout="")

        with (
            mock.patch.object(receiver, "ROOT", self.root),
            mock.patch.object(receiver, "validate_release_source"),
            mock.patch.object(receiver, "verify_retained_images"),
            mock.patch.object(receiver, "migration_fingerprint", return_value=HASH),
            mock.patch.object(receiver, "verify_public_health"),
            mock.patch.object(receiver, "tag_images"),
            mock.patch.object(receiver, "run", side_effect=capture),
        ):
            receiver.rollback_release(VERSION, SHA)

        flattened = " ".join(part for command in commands for part in command)
        self.assertNotIn("migrate", flattened)
        self.assertNotIn("seed", flattened)
        self.assertNotIn("build", flattened)
        self.assertIn(" stop ", f" {flattened} ")
        self.assertIn(" up ", f" {flattened} ")
        self.assertEqual((self.root / "current").resolve(), release.resolve())
        self.assertEqual(json.loads((self.root / "latest.json").read_text()), manifest)

    def test_rollback_reapplies_target_when_current_metadata_already_matches(self):
        release = self.root / "releases" / VERSION
        (release / "deploy").mkdir(parents=True)
        (release / "deploy" / "compose.prod.yaml").write_text("services: {}\n")
        (release / "release.env").write_text("COMPOSE_PROJECT_NAME=hopbarley\n")
        manifest = {
            "version": VERSION,
            "revision": SHA,
            "image_ids": IMAGE_IDS,
            "migration_fingerprint": HASH,
        }
        (release / "success.json").write_text(json.dumps(manifest))
        (self.root / "current").symlink_to(release)
        commands = []

        def capture(*args, **kwargs):
            commands.append(args)
            return subprocess.CompletedProcess(args, 0, stdout="")

        with (
            mock.patch.object(receiver, "ROOT", self.root),
            mock.patch.object(receiver, "verify_retained_images"),
            mock.patch.object(receiver, "migration_fingerprint", return_value=HASH),
            mock.patch.object(receiver, "verify_public_health"),
            mock.patch.object(receiver, "tag_images"),
            mock.patch.object(receiver, "run", side_effect=capture),
        ):
            receiver.rollback_release(VERSION, SHA)

        flattened = " ".join(part for command in commands for part in command)
        self.assertIn(" stop ", f" {flattened} ")
        self.assertIn(" up ", f" {flattened} ")
        self.assertEqual((self.root / "current").resolve(), release.resolve())
        self.assertFalse((self.root / "previous").exists())

    def test_rollback_fails_closed_on_migration_mismatch(self):
        release = self.root / "releases" / VERSION
        release.mkdir(parents=True)
        manifest = {
            "version": VERSION,
            "revision": SHA,
            "image_ids": IMAGE_IDS,
            "migration_fingerprint": HASH,
        }
        (release / "success.json").write_text(json.dumps(manifest))
        current_release = self.root / "releases" / "V1.1.0"
        current_release.mkdir()
        (self.root / "current").symlink_to(current_release)
        with (
            mock.patch.object(receiver, "ROOT", self.root),
            mock.patch.object(receiver, "verify_retained_images"),
            mock.patch.object(receiver, "migration_fingerprint", return_value="c" * 64),
            mock.patch.object(receiver, "run") as run,
        ):
            with self.assertRaisesRegex(ValueError, "fingerprint"):
                receiver.rollback_release(VERSION, SHA)
        run.assert_not_called()

    def test_migration_fingerprint_rejects_unfinished_migration(self):
        result = subprocess.CompletedProcess(("psql",), 0, stdout=b"1\n")
        with mock.patch.object(receiver, "database_query", return_value=result) as query:
            with self.assertRaisesRegex(ValueError, "unresolved"):
                receiver.migration_fingerprint(self.root)
        query.assert_called_once()


if __name__ == "__main__":
    unittest.main()
