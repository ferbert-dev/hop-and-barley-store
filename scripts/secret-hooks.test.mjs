import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function hookPath(name) {
  return join(repositoryRoot, '.husky', name);
}

function writeExecutable(path, source) {
  writeFileSync(path, source, 'utf8');
  chmodSync(path, 0o755);
}

function createHarness({ includeGgshield = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'hb-secret-hooks-'));
  const bin = join(root, 'bin');
  const log = join(root, 'hook.log');
  mkdirSync(bin);
  writeFileSync(log, '', 'utf8');

  writeExecutable(
    join(bin, 'pnpm'),
    `#!/bin/sh
printf 'pnpm %s\\n' "$*" >> "$HOOK_LOG"
exit "\${PNPM_STUB_EXIT:-0}"
`,
  );

  writeExecutable(
    join(bin, 'git'),
    `#!/bin/sh
printf 'git %s\\n' "$*" >> "$HOOK_LOG"
if [ "$*" = 'rev-list --count --all' ]; then
  printf '123\\n'
  exit 0
fi
case "$*" in
  'cat-file -e 1111111111111111111111111111111111111111^{commit}'|\
  'cat-file -e 2222222222222222222222222222222222222222^{commit}') exit 0 ;;
esac
exit 64
`,
  );

  if (includeGgshield) {
    writeExecutable(
      join(bin, 'ggshield'),
      `#!/bin/sh
printf 'ggshield %s\\n' "$*" >> "$HOOK_LOG"
printf 'max-commits %s\\n' "\${GITGUARDIAN_MAX_COMMITS_FOR_HOOK:-}" >> "$HOOK_LOG"
while IFS= read -r hook_line; do
  printf 'stdin %s\\n' "$hook_line" >> "$HOOK_LOG"
done
case ",\${SKIP:-}," in
  *,ggshield,*) exit 0 ;;
esac
if [ "\${GGSHIELD_WEAK_GLOBAL_CONFIG:-}" = '1' ] && [ "$1" != '--config-path' ]; then
  exit 0
fi
if [ "\${GITGUARDIAN_EXIT_ZERO:-}" = '1' ]; then
  exit 0
fi
if [ "\${GITGUARDIAN_FAIL_ON_SERVER_ERROR:-}" = 'false' ]; then
  case " $* " in
    *' --fail-on-server-error '*) ;;
    *) exit 0 ;;
  esac
fi
exit "\${GGSHIELD_STUB_EXIT:-0}"
`,
    );
  }

  return { bin, log, root };
}

function runHook(name, harness, { args = [], env = {}, input } = {}) {
  return spawnSync('/bin/sh', [hookPath(name), ...args], {
    cwd: harness.root,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
      HOOK_LOG: harness.log,
      PATH: `${harness.bin}:/usr/bin:/bin`,
    },
    input,
  });
}

function withHarness(options, callback) {
  const harness = createHarness(options);
  try {
    callback(harness);
  } finally {
    rmSync(harness.root, { force: true, recursive: true });
  }
}

test('repository-owned secret hooks are executable and do not weaken scanner failures', () => {
  for (const name of ['pre-commit', 'pre-push']) {
    const path = hookPath(name);
    const source = readFileSync(path, 'utf8');
    assert.notEqual(
      statSync(path).mode & 0o111,
      0,
      `${name} must be executable`,
    );
    assert.doesNotMatch(source, /--exit-zero|\|\|\s*true/u);
    assert.match(
      source,
      /unset GITGUARDIAN_EXIT_ZERO GITGUARDIAN_FAIL_ON_SERVER_ERROR SKIP/u,
    );
    assert.match(source, /--fail-on-server-error/u);
    assert.match(
      source,
      /ggshield --config-path \.gitguardian\.yaml secret scan/u,
    );
  }
});

test('repository configuration overrides weakening global ggshield defaults', () => {
  const source = readFileSync(
    join(repositoryRoot, '.gitguardian.yaml'),
    'utf8',
  );
  assert.match(source, /^version: 2$/mu);
  assert.match(source, /^exit_zero: false$/mu);
  assert.match(source, /^\s+fail_on_server_error: true$/mu);
  assert.doesNotMatch(
    source,
    /^\s*(?:exit_zero: true|fail_on_server_error: false)$/mu,
  );
});

test('pre-commit formats first and scans the final staged snapshot', () => {
  withHarness({}, (harness) => {
    const result = runHook('pre-commit', harness);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      readFileSync(harness.log, 'utf8'),
      'pnpm exec lint-staged\n' +
        'ggshield --config-path .gitguardian.yaml secret scan pre-commit --scan-all-merge-files --fail-on-server-error\n' +
        'max-commits \n',
    );
  });
});

test('pre-commit fails before formatting when ggshield is unavailable', () => {
  withHarness({ includeGgshield: false }, (harness) => {
    const result = runHook('pre-commit', harness);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ggshield is required to commit/u);
    assert.equal(readFileSync(harness.log, 'utf8'), '');
  });
});

test('pre-commit preserves lint-staged and scanner failure statuses', () => {
  withHarness({}, (harness) => {
    const lintFailure = runHook('pre-commit', harness, {
      env: { PNPM_STUB_EXIT: '17' },
    });
    assert.equal(lintFailure.status, 17);
    assert.equal(readFileSync(harness.log, 'utf8'), 'pnpm exec lint-staged\n');
  });

  withHarness({}, (harness) => {
    const scannerFailure = runHook('pre-commit', harness, {
      env: {
        GGSHIELD_STUB_EXIT: '42',
        GITGUARDIAN_EXIT_ZERO: '1',
        GITGUARDIAN_FAIL_ON_SERVER_ERROR: 'false',
        GGSHIELD_WEAK_GLOBAL_CONFIG: '1',
        SKIP: 'ggshield',
      },
    });
    assert.equal(scannerFailure.status, 42);
    assert.equal(
      readFileSync(harness.log, 'utf8'),
      'pnpm exec lint-staged\n' +
        'ggshield --config-path .gitguardian.yaml secret scan pre-commit --scan-all-merge-files --fail-on-server-error\n' +
        'max-commits \n',
    );
  });
});

test('pre-push scans every ref update with the remote and an uncapped local range', () => {
  withHarness({}, (harness) => {
    const firstRef =
      'refs/heads/ops5 1111111111111111111111111111111111111111 refs/heads/ops5 0000000000000000000000000000000000000000';
    const secondRef =
      'refs/heads/ops5-docs 2222222222222222222222222222222222222222 refs/heads/ops5-docs 0000000000000000000000000000000000000000';
    const deletedRef =
      'refs/heads/old 0000000000000000000000000000000000000000 refs/heads/old 3333333333333333333333333333333333333333';
    const result = runHook('pre-push', harness, {
      args: ['upstream', 'git@example.invalid:shop.git'],
      input: `${firstRef}\n${secondRef}\n${deletedRef}\n`,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      readFileSync(harness.log, 'utf8'),
      'git rev-list --count --all\n' +
        'git cat-file -e 1111111111111111111111111111111111111111^{commit}\n' +
        'ggshield --config-path .gitguardian.yaml secret scan pre-push --fail-on-server-error upstream git@example.invalid:shop.git\n' +
        'max-commits 123\n' +
        `stdin ${firstRef}\n` +
        'git cat-file -e 2222222222222222222222222222222222222222^{commit}\n' +
        'ggshield --config-path .gitguardian.yaml secret scan pre-push --fail-on-server-error upstream git@example.invalid:shop.git\n' +
        'max-commits 123\n' +
        `stdin ${secondRef}\n`,
    );
  });
});

test('pre-push fails closed on malformed Git ref input', () => {
  withHarness({}, (harness) => {
    const result = runHook('pre-push', harness, {
      args: ['upstream', 'git@example.invalid:shop.git'],
      input: 'incomplete ref update\n',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /invalid ref update/u);
    assert.equal(
      readFileSync(harness.log, 'utf8'),
      'git rev-list --count --all\n',
    );
  });
});

test('pre-push fails closed when a complete local object ID is not a commit', () => {
  withHarness({}, (harness) => {
    const result = runHook('pre-push', harness, {
      args: ['upstream', 'git@example.invalid:shop.git'],
      input:
        'refs/heads/ops5 4444444444444444444444444444444444444444 refs/heads/ops5 0000000000000000000000000000000000000000\n',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /does not resolve to a commit/u);
    assert.equal(
      readFileSync(harness.log, 'utf8'),
      'git rev-list --count --all\n' +
        'git cat-file -e 4444444444444444444444444444444444444444^{commit}\n',
    );
  });
});

test('pre-push preserves scanner failures despite weakening inherited settings', () => {
  withHarness({}, (harness) => {
    const refUpdate =
      'refs/heads/ops5 1111111111111111111111111111111111111111 refs/heads/ops5 0000000000000000000000000000000000000000\n';
    const result = runHook('pre-push', harness, {
      args: ['upstream', 'git@example.invalid:shop.git'],
      env: {
        GGSHIELD_STUB_EXIT: '23',
        GITGUARDIAN_EXIT_ZERO: '1',
        GITGUARDIAN_FAIL_ON_SERVER_ERROR: 'false',
        GGSHIELD_WEAK_GLOBAL_CONFIG: '1',
        SKIP: 'ggshield',
      },
      input: refUpdate,
    });
    assert.equal(result.status, 23);
    assert.equal(
      readFileSync(harness.log, 'utf8'),
      'git rev-list --count --all\n' +
        'git cat-file -e 1111111111111111111111111111111111111111^{commit}\n' +
        'ggshield --config-path .gitguardian.yaml secret scan pre-push --fail-on-server-error upstream git@example.invalid:shop.git\n' +
        'max-commits 123\n' +
        `stdin ${refUpdate}`,
    );
  });
});

test('pre-push fails closed when ggshield is unavailable', () => {
  withHarness({ includeGgshield: false }, (harness) => {
    const result = runHook('pre-push', harness);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ggshield is required to push/u);
    assert.equal(readFileSync(harness.log, 'utf8'), '');
  });
});
