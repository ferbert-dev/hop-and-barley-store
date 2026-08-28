import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const transientOutputPathPattern =
  /(?:^|\/)(?:__screenshots__|playwright-report|test-results|coverage)(?:\/|$)/u;

function read(relativePath) {
  return readFileSync(join(repositoryRoot, relativePath), 'utf8');
}

test('the PR CI workflow is pinned, least-privilege, and covers every merge gate', () => {
  const workflow = read('.github/workflows/ci.yml');

  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request_target:/);
  assert.doesNotMatch(workflow, /update_visual_baselines|update-snapshots/);
  assert.doesNotMatch(workflow, /actions\/upload-artifact|__screenshots__/);
  assert.match(workflow, /permissions:\n\s+contents: read/);
  assert.match(workflow, /node-version: ['"]24\.5\.0['"]/);
  assert.match(workflow, /version: ['"]11\.21\.0['"]/);

  for (const action of [
    'actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803',
    'pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1',
    'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
  ]) {
    assert.ok(workflow.includes(action), `${action} must stay pinned`);
  }

  for (const job of ['quality:', 'postgresql:', 'browser:']) {
    assert.ok(workflow.includes(`  ${job}`), `${job} merge job is required`);
  }

  for (const command of [
    'pnpm install --frozen-lockfile --ignore-scripts',
    'pnpm clean',
    'pnpm ci:contract',
    'pnpm secret-hooks:check',
    'pnpm generated:verify',
    'pnpm exec turbo run typecheck --force',
    'pnpm format:check',
    'pnpm exec turbo run lint test:unit build --force',
    'pnpm audit --prod --audit-level=high',
    'pnpm test:catalog:postgres',
    'pnpm test:a1:postgres',
    'pnpm test:a1b:postgres',
    'pnpm test:o0:postgres',
    'pnpm test:o1b:postgres',
    'pnpm test:a1b:argon2:alpine',
    'docker compose up -d --build --wait',
    'docker compose rm --force api',
    '--network-alias api',
    'Recreate a cold storefront for the unavailable phase',
    'docker compose rm --stop --force web',
    'setTimeout(()=>{response.statusCode=503;response.end("delayed unavailable")},2000)',
    'pnpm --filter @hop-and-barley/e2e test:e2e',
    "E2E_EXPECT_API_STATUS='API unavailable'",
    'docker rm --force "${COMPOSE_PROJECT_NAME}-delayed-api"',
    'docker compose down --remove-orphans',
  ]) {
    assert.ok(workflow.includes(command), `${command} is required in CI`);
  }
});

test('clean public database and web verification commands own their prerequisites', () => {
  const rootPackage = JSON.parse(read('package.json'));
  const apiPackage = JSON.parse(read('apps/api/package.json'));
  const e2ePackage = JSON.parse(read('apps/e2e/package.json'));
  const webReadme = read('apps/web/README.md');

  assert.match(
    rootPackage.scripts['generated:verify'],
    /^pnpm --filter @hop-and-barley\/auth-contract build && /,
  );
  for (const command of [
    'test:catalog:postgres',
    'test:a1:postgres',
    'test:a1b:postgres',
    'test:o0:postgres',
    'test:o1b:postgres',
  ]) {
    assert.match(
      rootPackage.scripts[command],
      /^pnpm --filter @hop-and-barley\/auth-contract build && /,
      `${command} must build its workspace runtime dependency`,
    );
  }

  assert.equal(
    apiPackage.scripts['db:seed'],
    'prisma generate && prisma db seed',
  );
  assert.equal(
    e2ePackage.scripts['test:e2e'],
    'pnpm --filter @hop-and-barley/auth-contract build && pnpm --filter @hop-and-barley/api-client build && playwright test',
  );
  assert.doesNotMatch(
    webReadme,
    /pnpm --filter @hop-and-barley\/web (?:test:unit|typecheck|build)/,
  );
  for (const task of ['test:unit', 'typecheck', 'build']) {
    assert.ok(
      webReadme.includes(
        `pnpm exec turbo run ${task} --filter=@hop-and-barley/web`,
      ),
    );
  }
});

test('browser CI runs the behavioral disposable-settings contract', () => {
  const rootPackage = JSON.parse(read('package.json'));
  const workflow = read('.github/workflows/ci.yml');

  assert.equal(
    rootPackage.scripts['ci:contract'],
    'node --test scripts/ci-workflow-contract.test.mjs scripts/configure-ci-browser-env.test.mjs',
  );
  assert.match(workflow, /pnpm ci:contract/);
  assert.match(workflow, /node scripts\/configure-ci-browser-env\.mjs/);
});

test('the security override and Docker context privacy guards remain exact', () => {
  const workspace = read('pnpm-workspace.yaml');
  const dockerIgnore = read('.dockerignore');

  assert.match(workspace, /overrides:\n\s+'@nestjs\/swagger>js-yaml': 5\.2\.2/);
  assert.match(dockerIgnore, /^\*\*\/\.DS_Store$/m);
});

test('browser runs keep generated screenshots and traces out of retained output', () => {
  const config = read('apps/e2e/playwright.config.ts');
  const gitIgnore = read('.gitignore');
  const dockerIgnore = read('.dockerignore');

  assert.match(config, /reporter: \[\['list'\]\]/);
  assert.match(config, /screenshot: 'off'/);
  assert.match(config, /trace: 'off'/);
  assert.match(gitIgnore, /^__screenshots__\/$/m);
  assert.match(dockerIgnore, /^\*\*\/__screenshots__$/m);
});

test('the repository tracks no transient test-output artifacts', () => {
  for (const path of [
    '__screenshots__/root.png',
    'apps/e2e/tests/__screenshots__/nested.png',
    'playwright-report/index.html',
    'apps/e2e/playwright-report/index.html',
    'test-results/trace.zip',
    'apps/e2e/test-results/trace.zip',
    'coverage/lcov.info',
    'apps/web/coverage/lcov.info',
  ]) {
    assert.equal(transientOutputPathPattern.test(path), true, path);
  }

  for (const path of [
    'docs/coverage-notes.md',
    'apps/web/public/assets/screenshots/product.webp',
  ]) {
    assert.equal(transientOutputPathPattern.test(path), false, path);
  }

  const trackedPaths = execFileSync('git', ['ls-files', '-z'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
  const forbidden = trackedPaths.filter(
    (path) =>
      transientOutputPathPattern.test(path) ||
      path.startsWith('apps/web/src/quality/evidence/') ||
      /apps\/web\/src\/quality\/(?:c3|d2)-.+-evidence(?:\.test)?\.ts$/u.test(
        path,
      ),
  );

  assert.deepEqual(forbidden, []);
});
