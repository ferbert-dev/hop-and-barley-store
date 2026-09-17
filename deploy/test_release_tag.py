import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('verify-release-tag.sh').resolve()


class VersionGateTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.cwd = Path(self.directory.name)
        self.env = {**os.environ, 'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': os.devnull}
        self.git('init', '-q', '-b', 'main')
        self.git('config', 'user.name', 'Release test')
        self.git('config', 'user.email', 'release@example.invalid')
        self.git('config', 'core.hooksPath', '/dev/null')
        self.git('commit', '-q', '--allow-empty', '-m', 'initial')
        self.sha = self.git('rev-parse', 'HEAD').stdout.strip()
        self.git('update-ref', 'refs/remotes/origin/main', self.sha)

    def git(self, *args):
        return subprocess.run(['git', *args], cwd=self.cwd, env=self.env,
                              text=True, capture_output=True, check=True)

    def verify(self, tag):
        return subprocess.run(['sh', str(SCRIPT), tag], cwd=self.cwd, env=self.env,
                              text=True, capture_output=True)

    def test_current_main_lightweight_tag(self):
        self.git('tag', 'V1.0.0')
        result = self.verify('V1.0.0')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), self.sha)

    def test_annotated_tag_in_main_history_remains_selectable(self):
        self.git('tag', '-a', 'V1.0.0', '-m', 'first release')
        self.git('commit', '-q', '--allow-empty', '-m', 'next version')
        self.git('update-ref', 'refs/remotes/origin/main', 'HEAD')
        result = self.verify('V1.0.0')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), self.sha)

    def test_rejects_tag_outside_main(self):
        self.git('checkout', '-q', '-b', 'unmerged')
        self.git('commit', '-q', '--allow-empty', '-m', 'unreviewed')
        self.git('tag', 'V1.0.0')
        self.assertNotEqual(self.verify('V1.0.0').returncode, 0)

    def test_rejects_missing_mutable_and_malformed_tags(self):
        for tag in ('V1.0.0', 'latest', 'main', 'v1.0.0', 'V01.0.0', 'V1.0',
                    'V1.0.0-rc1', 'V1.0.0;true', 'V1.0.0\nmain'):
            with self.subTest(tag=tag):
                self.assertNotEqual(self.verify(tag).returncode, 0)


if __name__ == '__main__':
    unittest.main()
