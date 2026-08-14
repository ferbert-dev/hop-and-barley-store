import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function read(relativePath) {
  return readFileSync(join(repositoryRoot, relativePath), 'utf8');
}

test('the PR CI workflow is pinned, least-privilege, and covers every merge gate', () => {
  const workflow = read('.github/workflows/ci.yml');

  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /update_visual_baselines:/);
  assert.doesNotMatch(workflow, /pull_request_target:/);
  assert.match(workflow, /permissions:\n\s+contents: read/);
  assert.match(workflow, /node-version: ['"]24\.5\.0['"]/);
  assert.match(workflow, /version: ['"]11\.21\.0['"]/);

  for (const action of [
    'actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803',
    'pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1',
    'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
    'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
  ]) {
    assert.ok(workflow.includes(action), `${action} must stay pinned`);
  }

  for (const job of ['quality:', 'postgresql:', 'browser:']) {
    assert.ok(workflow.includes(`  ${job}`), `${job} merge job is required`);
  }

  for (const command of [
    'pnpm install --frozen-lockfile --ignore-scripts',
    'pnpm clean',
    'pnpm generated:verify',
    'pnpm exec turbo run typecheck --force',
    'pnpm format:check',
    'pnpm exec turbo run lint test:unit build --force',
    'pnpm audit --prod --audit-level=high',
    'pnpm test:catalog:postgres',
    'docker compose up -d --build --wait',
    'docker compose rm --force api',
    'pnpm --filter @hop-and-barley/e2e test:e2e',
    'pnpm --filter @hop-and-barley/e2e test:e2e --update-snapshots',
    "E2E_EXPECT_API_STATUS='API unavailable'",
    'apps/e2e/tests/__screenshots__/linux',
    'docker compose down --remove-orphans',
  ]) {
    assert.ok(workflow.includes(command), `${command} is required in CI`);
  }
});

test('clean public database and web verification commands own their prerequisites', () => {
  const apiPackage = JSON.parse(read('apps/api/package.json'));
  const webReadme = read('apps/web/README.md');

  assert.equal(
    apiPackage.scripts['db:seed'],
    'prisma generate && prisma db seed',
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

test('the security override and Docker context privacy guards remain exact', () => {
  const workspace = read('pnpm-workspace.yaml');
  const dockerIgnore = read('.dockerignore');

  assert.match(workspace, /overrides:\n\s+'@nestjs\/swagger>js-yaml': 5\.2\.2/);
  assert.match(dockerIgnore, /^\*\*\/\.DS_Store$/m);
});

test('visual regression baselines are platform-specific without weaker gates', () => {
  const config = read('apps/e2e/playwright.config.ts');

  assert.match(config, /process\.platform === 'darwin'/);
  assert.ok(
    config.includes("'{testDir}/__screenshots__/{testFilePath}/{arg}{ext}'"),
  );
  assert.ok(
    config.includes(
      "'{testDir}/__screenshots__/{platform}/{testFilePath}/{arg}{ext}'",
    ),
  );
  assert.match(config, /maxDiffPixelRatio: 0\.01/);
  assert.match(config, /threshold: 0\.2/);

  const expectedBaselines = [
    'api-unavailable-hero.png',
    'canvas-at-shell-footer.png',
    'canvas-at-shell-header.png',
    'compact-mobile-360-shell-footer.png',
    'compact-mobile-360-shell-header.png',
    'desktop-1280-shell-footer.png',
    'desktop-1280-shell-header.png',
    'mobile-navigation-open.png',
    'mobile-visible-focus.png',
    'tablet-768-shell-footer.png',
    'tablet-768-shell-header.png',
  ];
  const linuxBaselines = readdirSync(
    join(
      repositoryRoot,
      'apps/e2e/tests/__screenshots__/linux/storefront-shell.spec.ts',
    ),
  ).sort();

  assert.deepEqual(linuxBaselines, expectedBaselines);
});
