import json
import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest


SCRIPT = Path(__file__).with_name("deploy-release.sh")


class DeployReleaseRecoveryTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.release = self.root / "release"
        self.release.mkdir()
        self.env_file = self.release / "release.env"
        self.env_file.write_text("COMPOSE_PROJECT_NAME=test\n")
        self.env_file.chmod(0o600)
        owner = self.release / "initial-owner.json"
        owner.write_text("{}\n")
        owner.chmod(0o600)
        self.state_file = self.root / "fake-state.json"
        self.state_file.write_text(json.dumps({
            "initialized": False,
            "catalog": "inconsistent",
            "migration_runs": 0,
            "seed_runs": 0,
        }))
        fake_bin = self.root / "bin"
        fake_bin.mkdir()
        docker = fake_bin / "docker"
        docker.write_text(textwrap.dedent("""\
            #!/usr/bin/env python3
            import json, os, pathlib, sys
            path = pathlib.Path(os.environ["FAKE_STATE"])
            state = json.loads(path.read_text())
            args = sys.argv[1:]
            joined = " ".join(args)
            if "to_regclass" in joined:
                print("1" if state["initialized"] else "0")
            elif "pg_database_size" in joined:
                print("1")
            elif "NOT EXISTS" in joined and "legacy-foundation" in joined:
                print(state["catalog"])
            elif "pg_dump" in joined:
                print("protected dump")
            elif " run " in f" {joined} " and args[-1] == "migrate":
                was_initialized = state["initialized"]
                state["initialized"] = True
                if not was_initialized:
                    state["catalog"] = "baseline"
                state["migration_runs"] += 1
                fail = os.environ.get("FAIL_AFTER") == "migrate" and not state.get("failed_migrate")
                state["failed_migrate"] = state.get("failed_migrate", False) or fail
                path.write_text(json.dumps(state))
                if fail:
                    sys.exit(75)
            elif " run " in f" {joined} " and args[-1] == "seed":
                state["catalog"] = "populated"
                state["seed_runs"] += 1
                fail = os.environ.get("FAIL_AFTER") == "seed" and not state.get("failed_seed")
                state["failed_seed"] = state.get("failed_seed", False) or fail
                path.write_text(json.dumps(state))
                if fail:
                    sys.exit(75)
            path.write_text(json.dumps(state))
        """))
        docker.chmod(0o755)
        stat = fake_bin / "stat"
        stat.write_text("#!/bin/sh\n[ \"$1\" = -c ] && [ \"$2\" = %a ] && { echo 600; exit; }\nexec /usr/bin/stat \"$@\"\n")
        stat.chmod(0o755)
        self.environment = {
            **os.environ,
            "FAKE_STATE": str(self.state_file),
            "PATH": f"{fake_bin}:{os.environ['PATH']}",
        }

    def run_script(self, fail_after):
        environment = {**self.environment, "FAIL_AFTER": fail_after}
        return subprocess.run(
            ("sh", str(SCRIPT), str(self.env_file), "--seed-initial"),
            env=environment,
            capture_output=True,
            text=True,
        )

    def assert_retry_recovers_without_duplicate_seed(self, fail_after):
        self.assertEqual(self.run_script(fail_after).returncode, 75)
        retry = self.run_script(fail_after)
        self.assertEqual(retry.returncode, 0, retry.stderr)
        state = json.loads(self.state_file.read_text())
        self.assertEqual(state["migration_runs"], 2)
        self.assertEqual(state["seed_runs"], 1)
        phase = self.release / ".deploy-state"
        self.assertTrue((phase / "migrations-complete").is_file())
        self.assertTrue((phase / "seed-started").is_file())
        self.assertTrue((phase / "seed-complete").is_file())

    def test_retry_after_completed_migrations(self):
        self.assert_retry_recovers_without_duplicate_seed("migrate")

    def test_retry_after_committed_transactional_seed(self):
        self.assert_retry_recovers_without_duplicate_seed("seed")


if __name__ == "__main__":
    unittest.main()
