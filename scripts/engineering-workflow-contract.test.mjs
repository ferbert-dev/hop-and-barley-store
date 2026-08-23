import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  cleanWorkspaceArtifacts,
  resolveArtifactTargets,
  WORKSPACE_ARTIFACT_ALLOWLIST,
} from './clean-workspace-artifacts.mjs';
import {
  GENERATED_OUTPUT_PATHS,
  verifyGeneratedStability,
} from './verify-generated-stability.mjs';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workflowPath = join(repositoryRoot, 'docs/engineering-workflow.md');
const contractPath = join(
  repositoryRoot,
  'docs/engineering-workflow.contract.json',
);
const packagePath = join(repositoryRoot, 'package.json');
const dockerIgnorePath = join(repositoryRoot, '.dockerignore');
const gitIgnorePath = join(repositoryRoot, '.gitignore');
const readmePath = join(repositoryRoot, 'README.md');
const ticketTemplatePath = join(repositoryRoot, 'tickets/ticket-template.md');
const agentInstructionPaths = [
  'AGENTS.md',
  'apps/api/AGENTS.md',
  'apps/e2e/AGENTS.md',
  'apps/web/AGENTS.md',
  '.agents/skills/project-ops-bootstrap/assets/repository/AGENTS.md',
];
const projectOpsSkillRoot = join(
  repositoryRoot,
  '.agents/skills/project-ops-bootstrap',
);
const projectOpsTemplateRoot = join(projectOpsSkillRoot, 'assets/repository');
const projectOpsInstalledPaths = [
  'AGENTS.md',
  'docs/engineering-workflow.md',
  'tickets/ticket-template.md',
];
const portableAgentsPath =
  '.agents/skills/project-ops-bootstrap/assets/repository/AGENTS.md';
const workerPolicyWithoutNumericLimitPaths = [
  'docs/engineering-workflow.md',
  '.agents/skills/project-ops-bootstrap/SKILL.md',
  '.agents/skills/project-ops-bootstrap/assets/repository/docs/engineering-workflow.md',
  '.agents/skills/project-ops-bootstrap/assets/notion/agent-roles.md',
  '.agents/skills/project-ops-bootstrap/scripts/verify_local.py',
];
const workerLimitPattern =
  /\bone root orchestrator plus at most ([a-z0-9-]+) spawned workers concurrently\b/iu;
const numericWorkerLimitPattern =
  /\b(?:at most|up to|maximum(?: of)?|max(?:imum)?(?: of)?)\s+(?:\d+|one|two|three|four|five)\s+(?:disjoint\s+|spawned\s+)?workers?\b/iu;

const workflow = readFileSync(workflowPath, 'utf8');
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const dockerIgnore = readFileSync(dockerIgnorePath, 'utf8');
const gitIgnore = readFileSync(gitIgnorePath, 'utf8');
const readme = readFileSync(readmePath, 'utf8');
const ticketTemplate = readFileSync(ticketTemplatePath, 'utf8');

const referenceBundleIgnore = '/docs/Hop-and-Barley-main/';

const expectedRuleIds = [
  'bounded-agent-lifecycle',
  'catalog-query-parity',
  'catalog-source-provenance',
  'concise-closure-summary',
  'cost-aware-model-routing',
  'cross-workspace-contract-second-consumer',
  'direct-node24-clean-order',
  'disposable-postgres-review',
  'exact-head-green-review',
  'generated-contract-drift',
  'immutable-correction-review',
  'independent-required-checks',
  'isolated-next-build-server',
  'one-ticket-branch-pr',
  'public-private-cache-separation',
  'reviewed-patch-runtime-binaries',
  'route-layout-ownership-before-auth-admin',
];

const expectedCleanOrder = [
  'pnpm install --frozen-lockfile --ignore-scripts',
  'pnpm clean',
  'pnpm generated:verify',
  'pnpm exec turbo run typecheck --force',
  'pnpm format:check',
  'pnpm exec turbo run lint test:unit build --force',
];

const expectedPolicyDigest =
  'sha256:fcc4012937e0de9aef415354eb7ea25427d81e6033aab2830a3c663339c0871a';
const expectedNextStrategies = [
  'serialized-build-start-test-stop',
  'unique-build-output-per-server',
];
const expectedCleanupAllowlist = [
  'apps/web/.next',
  'apps/web/dist',
  'apps/web/tsconfig.tsbuildinfo',
  'apps/api/dist',
  'apps/api/tsconfig.tsbuildinfo',
  'apps/api/tsconfig.build.tsbuildinfo',
  'apps/api/src/generated/prisma',
  'apps/e2e/dist',
  'apps/e2e/tsconfig.tsbuildinfo',
  'packages/api-client/dist',
  'packages/api-client/tsconfig.tsbuildinfo',
  'packages/eslint-config/dist',
  'packages/eslint-config/tsconfig.tsbuildinfo',
  'packages/typescript-config/dist',
  'packages/typescript-config/tsconfig.tsbuildinfo',
];
const expectedGeneratedFiles = [
  'apps/api/openapi.json',
  'packages/api-client/src/generated/schema.ts',
];
const expectedGeneratedStability = {
  passes: 2,
  clientBaseline: 'pre-run-bytes',
  openApiBaseline: 'first-generation-bytes',
  requires: [
    'existing-client-before-first-generation',
    'openapi-and-client-after-each-generation',
    'first-client-equals-pre-run-client',
    'second-openapi-equals-first-openapi',
    'second-client-equals-first-client',
  ],
};
const expectedPatchSummaryFields = [
  'baseObjectId',
  'targetObjectId',
  'changedPaths',
  'textLineCounts',
  'dependencyLockDelta',
  'runtimeBinarySha256',
  'runtimeBinaryProvenance',
  'reviewMethod',
  'relevantTests',
  'cleanupResult',
];
const expectedRouteDecisionOutputs = [
  'routeGroupTree',
  'layoutOwnerByFamily',
  'authenticationBoundary',
  'landmarkTests',
  'rollback',
];
const expectedWebExports = [
  {
    path: 'apps/web/src/components/ui/card.tsx',
    symbols: ['ProductCard'],
  },
  {
    path: 'apps/web/src/components/ui/price.tsx',
    symbols: ['Price'],
  },
  {
    path: 'apps/web/src/components/ui/status.tsx',
    symbols: ['LoadingState', 'EmptyState', 'ErrorState'],
  },
];
const expectedGeneratedClientExports = [
  {
    path: 'packages/api-client/src/client.ts',
    symbols: ['createApiClient'],
  },
  {
    path: 'packages/api-client/src/generated/schema.ts',
    symbols: ['paths'],
  },
];
const expectedTooling = {
  cleaner: 'scripts/clean-workspace-artifacts.mjs',
  generatedVerifier: 'scripts/verify-generated-stability.mjs',
};
const expectedVerificationSummary = {
  builderOwner: 'primary-ticket-owner',
  reviewOwner: 'independent-reviewer',
  retainedIn: ['pull-request', 'github-checks', 'notion-agent-run'],
  always: ['changedPaths', 'relevantTests', 'ci', 'cleanup', 'exactHeadSha'],
  forbiddenRepositoryArtifacts: [
    'playwright-screenshots',
    'playwright-traces',
    'playwright-reports',
    'coverage-output',
    'generated-evidence-ledgers',
  ],
  conditionalChecks: {
    database: 'schema-migration-seed-or-data-touch',
    playwright: 'user-flow-or-browser-state-touch',
    manual: 'layout-or-manual-only-risk',
    runtimeBinaryReview: 'intentional-runtime-binary-change',
  },
  failedAttemptsRemainVisible: true,
};
const expectedOrchestration = {
  sourceTicket: 'OPS1',
  rootOwns: ['vertical-scope', 'integration', 'pull-request', 'final-status'],
  maxIndependentReviewers: 1,
  reviewStartsAfter: 'green-required-ci',
  nextScopeStartsAfter: ['merged', 'explicitly-blocked'],
  completedWorkerAction: ['stop', 'reuse-immediately'],
  idleAgentPoolAllowed: false,
  delegationRequires: [
    'model',
    'reasoning-effort',
    'cost-correctness-rationale',
  ],
  models: {
    'gpt-5.6-sol': {
      work: [
        'architecture',
        'security-sensitive',
        'risky-cross-cutting',
        'exact-head-review',
      ],
      defaultReasoning: 'high',
    },
    'gpt-5.6-terra': {
      work: ['feature-implementation', 'medium-complexity-fix', 'integration'],
      defaultReasoning: 'medium',
    },
    'gpt-5.6-luna': {
      work: [
        'mechanical-edit',
        'fixture',
        'repetitive-test',
        'inventory',
        'documentation',
      ],
      defaultReasoning: 'medium',
    },
  },
  fallback: {
    direction: 'upward-to-sol',
    triggers: [
      'unclear-boundary',
      'security',
      'data-integrity',
      'correctness',
      'worker-uncertainty',
    ],
    downwardAfterUncertaintyAllowed: false,
  },
};
const expectedTraceability = [
  'ticketUrl',
  'agentRunUrl',
  'branch',
  'pullRequestUrl',
  'headSha',
  'checkSuiteUrl',
  'reviewRunUrl',
  'verdict',
  'mergeSha',
  'mergedAt',
];
const expectedClosureOrder = [
  'ready-ticket',
  'running-agent-run',
  'ticket-branch',
  'commit',
  'draft-pull-request',
  'green-required-ci',
  'exact-head-independent-review',
  'ready-pull-request',
  'merge',
  'ticket-done',
];
const expectedDeliveryMetrics = [
  'readyAt',
  'firstCommitAt',
  'pullRequestOpenedAt',
  'firstGreenAt',
  'reviewStartedAt',
  'passAt',
  'mergedAt',
  'commitCount',
  'ciRunCount',
  'ciFailureCount',
  'reviewAttemptCount',
  'correctionCycleCount',
  'changedPathCount',
  'binaryBytes',
];

const expectedWorkflowHeadings = [
  '## Evidence boundary',
  '## Cost-aware multi-model orchestration',
  '## Isolated verification',
  '### Next.js build and server isolation',
  '### PostgreSQL isolation',
  '## Integration closure',
  '### Reviewed patch and binary manifest',
  '## Ownership gates for upcoming slices',
  '### Route and layout ownership before auth or admin',
  '### Promote a cross-workspace contract on the second consumer',
  '### Accepted catalog integration boundary',
  '## R1 measured retrospective',
  '## R2 measured catalog retrospective',
  '### Measured baseline',
  '### Conditional verification tiers',
  '### P1, O0 and O1 experiment',
];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function findDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();

  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }

  return [...duplicates];
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => key !== 'policyDigest')
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function policyDigest(value) {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex')}`;
}

function createTemporaryRepository(context) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'hop-barley-r1-'));
  context.after(() => rmSync(root, { force: true, recursive: true }));
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'hop-and-barley-store' }),
  );
  writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n");
  writeFileSync(join(root, '.git'), 'gitdir: disposable-test-only\n');
  return root;
}

function runProjectOpsScript(script, args) {
  return spawnSync(
    process.env.PYTHON ?? 'python3',
    [join(projectOpsSkillRoot, 'scripts', script), ...args],
    { encoding: 'utf8' },
  );
}

function writeRelative(root, relativePath, contents = 'sentinel') {
  const absolutePath = join(root, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents);
  return absolutePath;
}

function collectLeafPaths(value, currentPath = []) {
  if (value === null || typeof value !== 'object') return [currentPath];

  return Object.entries(value).flatMap(([key, child]) =>
    key === 'policyDigest'
      ? []
      : collectLeafPaths(child, [...currentPath, key]),
  );
}

function mutateLeaf(candidate, path) {
  let parent = candidate;
  for (const segment of path.slice(0, -1)) parent = parent[segment];
  const key = path.at(-1);
  const value = parent[key];

  if (typeof value === 'string') parent[key] = `${value}-mutated`;
  else if (typeof value === 'number') parent[key] = value + 1;
  else if (typeof value === 'boolean') parent[key] = !value;
  else if (value === null) parent[key] = 'mutated';
  else throw new TypeError(`Unsupported leaf at ${path.join('.')}`);
}

function validateWorkflowContract(candidate, markdown, rootPackage) {
  const errors = [];
  const normalizedMarkdown = markdown.replace(/\s+/g, ' ');
  const rules = Array.isArray(candidate.rules) ? candidate.rules : [];
  const ruleIds = rules.map((rule) => rule?.id).filter(isNonEmptyString);

  if (candidate.schemaVersion !== 2) errors.push('schemaVersion must be 2');
  if (candidate.ticket !== 'R2') errors.push('ticket must be R2');
  if (
    candidate.agentRun !==
    'https://app.notion.com/p/3bdd78850eab81d69677f7d24401fbcc'
  ) {
    errors.push('R2 agentRun must be durable and exact');
  }
  if (candidate.correctionAgentRun !== null) {
    errors.push('correctionAgentRun must stay null until a real correction');
  }
  if (
    candidate.policyDigest !== expectedPolicyDigest ||
    policyDigest(candidate) !== expectedPolicyDigest
  ) {
    errors.push('the exact machine policy digest drifted');
  }
  if (findDuplicates(ruleIds).length > 0) {
    errors.push('rule IDs must be unique');
  }
  if (JSON.stringify([...ruleIds].sort()) !== JSON.stringify(expectedRuleIds)) {
    errors.push('rules must equal the independent R2 expected set');
  }

  for (const rule of rules) {
    for (const field of ['id', 'owner', 'timing', 'verification', 'rollback']) {
      if (!isNonEmptyString(rule?.[field])) {
        errors.push(`rule ${rule?.id ?? '<unknown>'} lacks ${field}`);
      }
    }
  }

  if (
    JSON.stringify(candidate.verificationSummary) !==
    JSON.stringify(expectedVerificationSummary)
  ) {
    errors.push('concise verification summary policy drifted');
  }
  if (
    JSON.stringify(candidate.orchestration) !==
    JSON.stringify(expectedOrchestration)
  ) {
    errors.push('cost-aware orchestration policy drifted');
  }
  for (const model of Object.keys(expectedOrchestration.models)) {
    if (!normalizedMarkdown.includes(model)) {
      errors.push(`workflow must document ${model}`);
    }
  }

  if (candidate.isolation?.next?.maxServersPerBuildOutput !== 1) {
    errors.push('only one server may use a Next build output');
  }
  if (candidate.isolation?.next?.requiresUniquePorts !== true) {
    errors.push('server ports must be unique');
  }
  if (
    JSON.stringify(candidate.isolation?.next?.allowedStrategies) !==
    JSON.stringify(expectedNextStrategies)
  ) {
    errors.push('Next isolation strategies drifted');
  }
  if (candidate.isolation?.database?.disposable !== true) {
    errors.push('review PostgreSQL must be disposable');
  }
  if (candidate.isolation?.database?.requiresUniqueRunIdentity !== true) {
    errors.push('review PostgreSQL must use a unique run identity');
  }
  if (candidate.isolation?.database?.sharedComposeMutationAllowed !== false) {
    errors.push('shared Compose mutation must stay forbidden');
  }

  if (candidate.integration?.nodeMajor !== 24) {
    errors.push('integration Node major must remain 24');
  }
  if (candidate.integration?.packageManager !== rootPackage.packageManager) {
    errors.push('integration package manager must match package.json');
  }
  if (candidate.integration?.turboForce !== true) {
    errors.push('integration Turbo checks must be uncached');
  }
  if (
    JSON.stringify(candidate.integration?.cleanOrder) !==
    JSON.stringify(expectedCleanOrder)
  ) {
    errors.push('the clean-order integration sequence drifted');
  }
  if (
    JSON.stringify(candidate.integration?.cleanupAllowlist) !==
      JSON.stringify(expectedCleanupAllowlist) ||
    JSON.stringify(WORKSPACE_ARTIFACT_ALLOWLIST) !==
      JSON.stringify(expectedCleanupAllowlist)
  ) {
    errors.push('the cleanup allowlist drifted from executable tooling');
  }
  if (
    JSON.stringify(candidate.integration?.generatedFiles) !==
      JSON.stringify(expectedGeneratedFiles) ||
    JSON.stringify(Object.values(GENERATED_OUTPUT_PATHS)) !==
      JSON.stringify([expectedGeneratedFiles[1], expectedGeneratedFiles[0]])
  ) {
    errors.push('generated output paths drifted');
  }
  if (
    JSON.stringify(candidate.integration?.generatedStability) !==
    JSON.stringify(expectedGeneratedStability)
  ) {
    errors.push('generated stability policy drifted');
  }
  if (
    JSON.stringify(candidate.integration?.patchSummaryRequiredFields) !==
    JSON.stringify(expectedPatchSummaryFields)
  ) {
    errors.push('the reviewed patch summary is incomplete');
  }
  if (
    JSON.stringify(candidate.integration?.tooling) !==
    JSON.stringify(expectedTooling)
  ) {
    errors.push('workflow tooling paths drifted');
  }

  if (
    JSON.stringify(candidate.ownership?.routeLayout?.decisionRequiredBefore) !==
    JSON.stringify(['auth', 'admin'])
  ) {
    errors.push('auth/admin route ownership gate drifted');
  }
  if (
    candidate.ownership?.routeLayout?.currentEvidencePath !==
      'apps/web/src/app/layout.tsx' ||
    candidate.ownership?.routeLayout?.currentShellSymbol !==
      'StorefrontShell' ||
    JSON.stringify(
      candidate.ownership?.routeLayout?.requiredDecisionOutputs,
    ) !== JSON.stringify(expectedRouteDecisionOutputs)
  ) {
    errors.push('route/layout ownership outputs drifted');
  }
  if (
    candidate.ownership?.crossWorkspaceContract?.minimumIndependentConsumers !==
      2 ||
    candidate.ownership?.crossWorkspaceContract?.firstConsumerOwnsLocally !==
      true
  ) {
    errors.push('second-consumer promotion rule drifted');
  }

  if (
    candidate.delivery?.branch?.base !== 'main' ||
    candidate.delivery?.branch?.pattern !== '^codex/[a-z0-9]+-[a-z0-9-]+$' ||
    candidate.delivery?.branch?.ticketsPerPullRequest !== 1 ||
    candidate.delivery?.branch?.draftBeforeReview !== true
  ) {
    errors.push('one-ticket branch and pull-request policy drifted');
  }
  if (
    JSON.stringify(candidate.delivery?.traceabilityRequired) !==
    JSON.stringify(expectedTraceability)
  ) {
    errors.push('delivery traceability fields drifted');
  }
  if (
    candidate.delivery?.review?.independent !== true ||
    JSON.stringify(candidate.delivery?.review?.verdicts) !==
      JSON.stringify(['PASS', 'FAIL', 'BLOCKED']) ||
    candidate.delivery?.review?.exactHeadRequired !== true ||
    candidate.delivery?.review?.greenRequiredChecksBeforePass !== true ||
    candidate.delivery?.review?.newHeadRequiresNewRun !== true ||
    candidate.delivery?.review?.failedAttemptsImmutable !== true
  ) {
    errors.push('exact-head independent review policy drifted');
  }
  if (
    JSON.stringify(candidate.delivery?.closureOrder) !==
    JSON.stringify(expectedClosureOrder)
  ) {
    errors.push('ticket closure order drifted');
  }
  if (
    candidate.delivery?.correction?.defaultBundlesPerFail !== 1 ||
    JSON.stringify(candidate.delivery?.correction?.requires) !==
      JSON.stringify([
        'newCommit',
        'newHead',
        'greenRequiredCi',
        'newReviewRun',
      ]) ||
    candidate.delivery?.correction?.preservesFailedRun !== true
  ) {
    errors.push('immutable correction lifecycle drifted');
  }
  if (
    candidate.delivery?.browserReadiness?.forbiddenLifecycleWait !==
      'networkidle' ||
    candidate.delivery?.browserReadiness?.requiredWait !==
      'observable-application-state' ||
    candidate.delivery?.browserReadiness?.newlyCitedEvidenceRepeatPasses !== 5
  ) {
    errors.push('browser evidence readiness policy drifted');
  }
  if (
    JSON.stringify(candidate.delivery?.metricsRequired) !==
    JSON.stringify(expectedDeliveryMetrics)
  ) {
    errors.push('delivery metrics drifted');
  }

  if (
    JSON.stringify(candidate.catalogBoundary?.requiredWebExports) !==
      JSON.stringify(expectedWebExports) ||
    JSON.stringify(candidate.catalogBoundary?.generatedClientExports) !==
      JSON.stringify(expectedGeneratedClientExports)
  ) {
    errors.push('catalog reuse paths or symbols drifted');
  }
  if (
    JSON.stringify(candidate.catalogBoundary?.forbiddenOutcomes) !==
    JSON.stringify([
      'third-product-card-implementation',
      'hand-written-raw-fetch-catalog-contract',
    ])
  ) {
    errors.push('catalog duplicate-contract rejection drifted');
  }
  if (
    JSON.stringify(candidate.catalogBoundary?.baseline) !==
    JSON.stringify({
      categories: 5,
      products: 12,
      currency: 'USD',
      transactionIsolation: 'RepeatableRead',
      publicRevalidateSeconds: 60,
      requestTimeoutMilliseconds: 1000,
      catalogStates: 5,
      retainedTestArtifacts: 0,
    })
  ) {
    errors.push('accepted catalog baseline drifted');
  }
  if (
    JSON.stringify(candidate.nextExperiment) !==
    JSON.stringify({
      tickets: ['P1', 'O0', 'O1'],
      retrospective: 'R3',
      targets: {
        dedicatedBranchAndPullRequest: '3/3',
        ticketsDoneBeforeMerge: 0,
        reviewRequestsWithIncompleteEvidenceOrRedCi: 0,
        unsupportedBehaviorClaims: 0,
        maximumCiRunsPerTicket: 3,
        maximumExactHeadReviewAttemptsPerTicket: 2,
      },
    })
  ) {
    errors.push('P1/O0/O1 experiment drifted');
  }

  for (const heading of expectedWorkflowHeadings) {
    if (markdown.split(heading).length !== 2) {
      errors.push(`workflow heading must appear once: ${heading}`);
    }
  }
  for (const literal of [
    'Do not commit or upload Playwright screenshots, traces, reports, coverage',
    'The builder records one concise verification summary',
    'one `.next` directory',
    'pnpm exec turbo run typecheck --force',
    'generated ledger files',
    'zero third product cards',
    'one `codex/<ticket>-<slug>` branch and one draft pull request',
    'A test name or source path is navigation, not semantic proof.',
    '`networkidle` is forbidden',
    'P1 and O0 may proceed in parallel only in separate branches and pull requests',
  ]) {
    if (!normalizedMarkdown.includes(literal)) {
      errors.push(`workflow is missing invariant text: ${literal}`);
    }
  }

  if (
    rootPackage.scripts?.['workflow:check'] !==
    'node --test scripts/engineering-workflow-contract.test.mjs scripts/ci-workflow-contract.test.mjs'
  ) {
    errors.push('workflow:check script drifted');
  }
  if (
    rootPackage.scripts?.clean !== 'pnpm clean:artifacts' ||
    rootPackage.scripts?.['clean:artifacts'] !==
      'node scripts/clean-workspace-artifacts.mjs' ||
    rootPackage.scripts?.['generated:verify'] !==
      'pnpm --filter @hop-and-barley/auth-contract build && node scripts/verify-generated-stability.mjs'
  ) {
    errors.push('executable clean/generated scripts drifted');
  }
  if (!rootPackage.scripts?.check?.startsWith('pnpm workflow:check &&')) {
    errors.push('root check must run workflow:check first');
  }
  if (
    rootPackage.scripts?.['dev:web'] !==
      'turbo run dev --filter=@hop-and-barley/web' ||
    rootPackage.scripts?.['dev:api'] !== 'pnpm --filter @hop-and-barley/api dev'
  ) {
    errors.push(
      'root dev:web must use the filtered Turbo dependency graph while dev:api remains explicit',
    );
  }

  return errors;
}

function clone(value) {
  return structuredClone(value);
}

function assertExports(sourceRoot, entries) {
  for (const entry of entries) {
    const absolutePath = join(sourceRoot, entry.path);
    assert.equal(existsSync(absolutePath), true, `${entry.path} must exist`);
    const source = readFileSync(absolutePath, 'utf8');

    for (const symbol of entry.symbols) {
      assert.match(
        source,
        new RegExp(`export (?:function|interface|type) ${symbol}\\b`),
        `${entry.path} must export ${symbol}`,
      );
    }
  }
}

test('R2 contract matches an independent required rule set', () => {
  assert.deepEqual(
    validateWorkflowContract(contract, workflow, packageJson),
    [],
  );
});

test('local reference bundle stays outside Git and Docker build contexts', () => {
  for (const [source, contents] of [
    ['.gitignore', gitIgnore],
    ['.dockerignore', dockerIgnore],
  ]) {
    const matches = contents
      .split(/\r?\n/u)
      .filter((line) => line === referenceBundleIgnore);
    assert.equal(
      matches.length,
      1,
      `${source} must contain exactly ${referenceBundleIgnore}`,
    );
  }
});

test('root README reports the accepted catalog seed and implemented detail scope', () => {
  assert.match(readme, /12 deterministic products across five categories/u);
  assert.match(readme, /GET \/api\/v1\/products\/:slug/u);
  assert.match(readme, /responsive detail template for all 12/u);
  assert.doesNotMatch(readme, /two seeded products/u);
  assert.doesNotMatch(readme, /product details and categories/u);
  const plannedProductWork = readme
    .split('Planned product work:')[1]
    ?.split('The backend remains')[0];
  assert.ok(plannedProductWork, 'planned product-work section must remain');
  assert.doesNotMatch(plannedProductWork, /product detail/u);
});

test('ticket template captures traceability and the concise verification summary', () => {
  const traceabilityLabels = {
    ticketUrl: '- Ticket URL:',
    agentRunUrl: '- Implementation Agent Run:',
    branch: '- Branch: `codex/<ticket>-<slug>`',
    pullRequestUrl: '- Pull request:',
    headSha: '- Head SHA:',
    checkSuiteUrl: '- Required checks / check-suite URL:',
    reviewRunUrl: '- Independent review Agent Run:',
    verdict: '- Review verdict: `PASS | FAIL | BLOCKED`',
    mergeSha: '- Merge SHA:',
    mergedAt: '- Merged at:',
  };

  assert.deepEqual(
    Object.keys(traceabilityLabels),
    contract.delivery.traceabilityRequired,
  );
  for (const literal of Object.values(traceabilityLabels)) {
    assert.ok(ticketTemplate.includes(literal), literal);
  }
  for (const literal of [
    '- Delegation plan:',
    '- Model / reasoning effort:',
    '- Cost/correctness rationale:',
    '- Worker cleanup:',
    '- Verification summary:',
    '- Delivery metrics:',
  ]) {
    assert.ok(ticketTemplate.includes(literal), literal);
  }
});

test('root agent instructions are the only numeric worker-limit sources', () => {
  const rootAgents = readFileSync(join(repositoryRoot, 'AGENTS.md'), 'utf8');
  const portableAgents = readFileSync(
    join(repositoryRoot, portableAgentsPath),
    'utf8',
  );
  for (const literal of [
    '[`docs/engineering-workflow.md`](docs/engineering-workflow.md)',
    'sole source of truth for the worker concurrency limit',
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    'never leave completed agents waiting',
    'Start one independent exact-head reviewer only after green CI',
  ]) {
    assert.ok(rootAgents.includes(literal), literal);
  }

  const rootWorkerLimit = rootAgents.match(workerLimitPattern);
  const portableWorkerLimit = portableAgents.match(workerLimitPattern);
  assert.ok(rootWorkerLimit, 'root AGENTS.md must own one worker limit');
  assert.ok(
    portableWorkerLimit,
    'portable AGENTS.md must own one worker limit',
  );
  assert.equal(rootWorkerLimit[1], portableWorkerLimit[1]);
  assert.match(
    portableAgents,
    /sole source of truth for the worker concurrency limit/iu,
  );

  assert.match(
    workflow,
    /AGENTS\.md.*sole source of truth for the worker\s+concurrency limit/su,
  );
  for (const relativePath of workerPolicyWithoutNumericLimitPaths) {
    const contents = readFileSync(join(repositoryRoot, relativePath), 'utf8');
    assert.doesNotMatch(
      contents,
      numericWorkerLimitPattern,
      `${relativePath} must defer the numeric worker limit to root AGENTS.md`,
    );
  }
  assert.equal('maxDisjointWorkers' in contract.orchestration, false);

  for (const relativePath of agentInstructionPaths) {
    const contents = readFileSync(join(repositoryRoot, relativePath), 'utf8');
    assert.ok(
      contents.split(/\r?\n/u).length - 1 <= 80,
      `${relativePath} must stay at or below 80 lines`,
    );
  }
});

test('project-ops bootstrap generates exact, idempotent, fail-closed core templates', (context) => {
  const temporaryRoot = createTemporaryRepository(context);
  const initArgs = [
    temporaryRoot,
    '--project-name',
    'Workflow contract verification',
    '--mode',
    'core',
  ];

  const firstInstall = runProjectOpsScript('init_local.py', initArgs);
  assert.equal(firstInstall.status, 0, firstInstall.stderr);
  for (const relativePath of projectOpsInstalledPaths) {
    assert.equal(
      readFileSync(join(temporaryRoot, relativePath), 'utf8'),
      readFileSync(join(projectOpsTemplateRoot, relativePath), 'utf8'),
      relativePath,
    );
  }

  const firstVerify = runProjectOpsScript('verify_local.py', [temporaryRoot]);
  assert.equal(firstVerify.status, 0, firstVerify.stderr);

  const secondInstall = runProjectOpsScript('init_local.py', initArgs);
  assert.equal(secondInstall.status, 0, secondInstall.stderr);
  assert.match(secondInstall.stdout, /Existing files were preserved/u);
  for (const relativePath of projectOpsInstalledPaths) {
    assert.equal(
      readFileSync(join(temporaryRoot, relativePath), 'utf8'),
      readFileSync(join(projectOpsTemplateRoot, relativePath), 'utf8'),
      relativePath,
    );
  }

  writeFileSync(
    join(temporaryRoot, 'tickets/ticket-template.md'),
    '# incompatible local ticket template\n',
  );
  const preservationInstall = runProjectOpsScript('init_local.py', initArgs);
  assert.equal(preservationInstall.status, 0, preservationInstall.stderr);
  assert.equal(
    readFileSync(join(temporaryRoot, 'tickets/ticket-template.md'), 'utf8'),
    '# incompatible local ticket template\n',
  );
  const driftVerify = runProjectOpsScript('verify_local.py', [temporaryRoot]);
  assert.notEqual(driftVerify.status, 0);
  assert.match(
    driftVerify.stderr,
    /Drifted project-operations files: tickets\/ticket-template\.md/u,
  );

  const unsupportedMode = runProjectOpsScript('init_local.py', [
    temporaryRoot,
    '--project-name',
    'Workflow contract verification',
    '--mode',
    'light',
  ]);
  assert.notEqual(unsupportedMode.status, 0);
  assert.match(unsupportedMode.stderr, /invalid choice: 'light'/u);
});

test('R2 catalog baseline remains grounded in executable source contracts', () => {
  const fixtureTest = readFileSync(
    join(repositoryRoot, 'apps/api/src/catalog/catalog-fixtures.spec.ts'),
    'utf8',
  );
  const service = readFileSync(
    join(repositoryRoot, 'apps/api/src/catalog/catalog.service.ts'),
    'utf8',
  );
  const transport = readFileSync(
    join(repositoryRoot, 'apps/web/src/lib/catalog.ts'),
    'utf8',
  );
  const browserSpec = readFileSync(
    join(repositoryRoot, 'apps/e2e/tests/catalog-discovery.spec.ts'),
    'utf8',
  );
  const acceptanceMatrix = readFileSync(
    join(repositoryRoot, 'apps/web/src/quality/acceptance-matrix.ts'),
    'utf8',
  );
  const playwrightConfig = readFileSync(
    join(repositoryRoot, 'apps/e2e/playwright.config.ts'),
    'utf8',
  );

  assert.match(fixtureTest, /five normalized categories/u);
  assert.match(fixtureTest, /catalogProducts\)\.toHaveLength\(12\)/u);
  for (const sourceContract of [
    'transaction.product.count({ where })',
    'transaction.product.findMany({',
    'transaction.category.findMany(facetQuery)',
    "{ isolationLevel: 'RepeatableRead' }",
  ]) {
    assert.ok(service.includes(sourceContract), sourceContract);
  }
  assert.match(transport, /CATALOG_REQUEST_TIMEOUT_MS = 1_000/u);
  assert.match(transport, /next: \{ revalidate: 60 \}/u);
  assert.doesNotMatch(browserSpec, /networkidle/u);
  assert.doesNotMatch(browserSpec, /toHaveScreenshot|visual baseline/iu);
  assert.doesNotMatch(playwrightConfig, /toHaveScreenshot|__screenshots__/u);
  assert.match(playwrightConfig, /screenshot: 'off'/u);
  assert.match(playwrightConfig, /trace: 'off'/u);

  const catalogStatesBlock = acceptanceMatrix.match(
    /id: 'catalog',[\s\S]*?states: \[([^\]]+)\]/u,
  )?.[1];
  assert.ok(catalogStatesBlock, 'catalog route states must remain explicit');
  const catalogStates = [...catalogStatesBlock.matchAll(/'([^']+)'/gu)].map(
    ([, state]) => state,
  );

  const publicCurrencies = [
    ...new Set(
      [...service.matchAll(/currency: '([A-Z]{3})'/gu)].map(
        ([, currency]) => currency,
      ),
    ),
  ];
  assert.deepEqual(publicCurrencies, [
    contract.catalogBoundary.baseline.currency,
  ]);
  assert.equal(
    catalogStates.length,
    contract.catalogBoundary.baseline.catalogStates,
  );
  assert.equal(contract.catalogBoundary.baseline.retainedTestArtifacts, 0);
  for (const retiredArtifact of [
    'apps/web/src/quality/c3-catalog-evidence.ts',
    'apps/web/src/quality/d2-storefront-shell-evidence.ts',
    'apps/web/src/quality/evidence/c3-local-runs.json',
    'apps/web/src/quality/evidence/d2-vitest.json',
  ]) {
    assert.equal(existsSync(join(repositoryRoot, retiredArtifact)), false);
  }
});

test('every workflow rule has an owner, timing, verification and rollback', () => {
  for (const rule of contract.rules) {
    assert.equal(isNonEmptyString(rule.owner), true, rule.id);
    assert.equal(isNonEmptyString(rule.timing), true, rule.id);
    assert.equal(isNonEmptyString(rule.verification), true, rule.id);
    assert.equal(isNonEmptyString(rule.rollback), true, rule.id);
  }
});

test('contract rejects a submitted rule set with a missing mapping', () => {
  const candidate = clone(contract);
  candidate.rules.pop();

  assert.match(
    validateWorkflowContract(candidate, workflow, packageJson).join('\n'),
    /independent R2 expected set/,
  );
});

test('contract rejects retained test outputs or incomplete summaries', () => {
  const candidate = clone(contract);
  candidate.verificationSummary.always = [];
  candidate.verificationSummary.forbiddenRepositoryArtifacts = [];
  candidate.verificationSummary.failedAttemptsRemainVisible = false;

  const errors = validateWorkflowContract(
    candidate,
    workflow,
    packageJson,
  ).join('\n');
  assert.match(errors, /concise verification summary policy/);
});

test('contract rejects a duplicated worker limit or weakened model routing', () => {
  const candidate = clone(contract);
  candidate.orchestration.duplicatedPolicy = 'worker-concurrency-limit';
  candidate.orchestration.idleAgentPoolAllowed = true;
  candidate.orchestration.models['gpt-5.6-sol'].work = [];
  candidate.orchestration.fallback.downwardAfterUncertaintyAllowed = true;

  assert.match(
    validateWorkflowContract(candidate, workflow, packageJson).join('\n'),
    /cost-aware orchestration policy/,
  );
});

test('contract rejects shared build output or database mutation', () => {
  const candidate = clone(contract);
  candidate.isolation.next.maxServersPerBuildOutput = 2;
  candidate.isolation.database.sharedComposeMutationAllowed = true;

  const errors = validateWorkflowContract(
    candidate,
    workflow,
    packageJson,
  ).join('\n');
  assert.match(errors, /one server/);
  assert.match(errors, /shared Compose mutation/);
});

test('contract rejects cached, reordered or incomplete integration closure', () => {
  const candidate = clone(contract);
  candidate.integration.turboForce = false;
  candidate.integration.cleanOrder.reverse();
  candidate.integration.patchSummaryRequiredFields = [];

  const errors = validateWorkflowContract(
    candidate,
    workflow,
    packageJson,
  ).join('\n');
  assert.match(errors, /uncached/);
  assert.match(errors, /clean-order/);
  assert.match(errors, /patch summary/);
});

test('contract rejects premature sharing and duplicate catalog contracts', () => {
  const candidate = clone(contract);
  candidate.ownership.crossWorkspaceContract.minimumIndependentConsumers = 1;
  candidate.catalogBoundary.requiredWebExports = [];

  const errors = validateWorkflowContract(
    candidate,
    workflow,
    packageJson,
  ).join('\n');
  assert.match(errors, /second-consumer/);
  assert.match(errors, /catalog reuse paths or symbols/);
});

test('every machine-policy leaf is protected by the independent exact digest', () => {
  const leafPaths = collectLeafPaths(contract);
  assert.ok(leafPaths.length > 100, 'expected broad machine-policy coverage');

  for (const path of leafPaths) {
    const candidate = clone(contract);
    mutateLeaf(candidate, path);
    assert.match(
      validateWorkflowContract(candidate, workflow, packageJson).join('\n'),
      /exact machine policy digest/,
      path.join('.'),
    );
  }
});

test('allowlisted cleaner deletes only disposable temp-repository artifacts', (context) => {
  const temporaryRoot = createTemporaryRepository(context);
  for (const relativePath of expectedCleanupAllowlist) {
    const sentinelPath = relativePath.endsWith('.tsbuildinfo')
      ? relativePath
      : `${relativePath}/sentinel.txt`;
    writeRelative(temporaryRoot, sentinelPath);
  }
  const unrelatedPaths = [
    'apps/web/public/keep.txt',
    'apps/api/src/catalog/keep.ts',
    'packages/api-client/src/index.ts',
    'keep-at-root.txt',
  ];
  for (const relativePath of unrelatedPaths) {
    writeRelative(temporaryRoot, relativePath, 'preserve');
  }

  const result = cleanWorkspaceArtifacts({ repositoryRoot: temporaryRoot });

  assert.deepEqual(result.checked, expectedCleanupAllowlist);
  assert.deepEqual(result.removed, expectedCleanupAllowlist);
  for (const relativePath of expectedCleanupAllowlist) {
    assert.equal(existsSync(join(temporaryRoot, relativePath)), false);
  }
  for (const relativePath of unrelatedPaths) {
    assert.equal(
      readFileSync(join(temporaryRoot, relativePath), 'utf8'),
      'preserve',
    );
  }
});

test('cleaner rejects traversal and symlink components before removal', (context) => {
  const temporaryRoot = createTemporaryRepository(context);
  for (const traversal of ['..', '../outside']) {
    assert.throws(
      () =>
        resolveArtifactTargets({
          allowlist: [traversal],
          repositoryRoot: temporaryRoot,
        }),
      /Unsafe artifact allowlist path|escapes repository root/,
    );
  }

  const outsideRoot = mkdtempSync(
    join(realpathSync(tmpdir()), 'hop-barley-r1-outside-'),
  );
  context.after(() => rmSync(outsideRoot, { force: true, recursive: true }));
  mkdirSync(join(temporaryRoot, 'apps'), { recursive: true });
  symlinkSync(outsideRoot, join(temporaryRoot, 'apps', 'linked'), 'dir');
  writeRelative(outsideRoot, 'must-survive.txt', 'outside');

  assert.throws(
    () =>
      resolveArtifactTargets({
        allowlist: ['apps/linked/dist'],
        repositoryRoot: temporaryRoot,
      }),
    /traverses a symlink/,
  );
  assert.equal(
    readFileSync(join(outsideRoot, 'must-survive.txt'), 'utf8'),
    'outside',
  );
});

test('generated verifier accepts missing OpenAPI and an accepted dirty client baseline', async (context) => {
  const temporaryRoot = createTemporaryRepository(context);
  const clientPath = writeRelative(
    temporaryRoot,
    GENERATED_OUTPUT_PATHS.client,
    'accepted-dirty-client',
  );
  const openApiPath = join(temporaryRoot, GENERATED_OUTPUT_PATHS.openApi);
  let calls = 0;

  const result = await verifyGeneratedStability({
    generate: async () => {
      calls += 1;
      writeRelative(
        temporaryRoot,
        GENERATED_OUTPUT_PATHS.openApi,
        '{"stable":true}',
      );
      writeFileSync(clientPath, 'accepted-dirty-client');
    },
    repositoryRoot: temporaryRoot,
  });

  assert.equal(calls, 2);
  assert.equal(result.passes, 2);
  assert.equal(readFileSync(clientPath, 'utf8'), 'accepted-dirty-client');
  assert.equal(readFileSync(openApiPath, 'utf8'), '{"stable":true}');
});

test('generated verifier rejects first-pass client drift and restores the baseline', async (context) => {
  const temporaryRoot = createTemporaryRepository(context);
  const clientPath = writeRelative(
    temporaryRoot,
    GENERATED_OUTPUT_PATHS.client,
    'accepted-dirty-client',
  );
  const openApiPath = join(temporaryRoot, GENERATED_OUTPUT_PATHS.openApi);

  await assert.rejects(
    verifyGeneratedStability({
      generate: async () => {
        writeRelative(temporaryRoot, GENERATED_OUTPUT_PATHS.openApi, '{}');
        writeFileSync(clientPath, 'unexpected-client-drift');
      },
      repositoryRoot: temporaryRoot,
    }),
    /changed the accepted generated client baseline/,
  );
  assert.equal(readFileSync(clientPath, 'utf8'), 'accepted-dirty-client');
  assert.equal(existsSync(openApiPath), false);
});

test('generated verifier rejects second-pass nondeterminism and restores pre-run bytes', async (context) => {
  const temporaryRoot = createTemporaryRepository(context);
  const clientPath = writeRelative(
    temporaryRoot,
    GENERATED_OUTPUT_PATHS.client,
    'accepted-dirty-client',
  );
  const openApiPath = writeRelative(
    temporaryRoot,
    GENERATED_OUTPUT_PATHS.openApi,
    'accepted-ignored-openapi',
  );
  let pass = 0;

  await assert.rejects(
    verifyGeneratedStability({
      generate: async () => {
        pass += 1;
        writeFileSync(clientPath, 'accepted-dirty-client');
        writeFileSync(openApiPath, `generated-pass-${pass}`);
      },
      repositoryRoot: temporaryRoot,
    }),
    /not byte-stable between passes: apps\/api\/openapi.json/,
  );
  assert.equal(readFileSync(clientPath, 'utf8'), 'accepted-dirty-client');
  assert.equal(readFileSync(openApiPath, 'utf8'), 'accepted-ignored-openapi');
});

test('accepted integration exposes the route owner, D3 primitives and generated client', (context) => {
  const integratedCardPath =
    contract.catalogBoundary.requiredWebExports[0].path;
  const integrationSourceRoot =
    process.env.WORKFLOW_INTEGRATION_SOURCE_ROOT ??
    process.env.R1_INTEGRATION_SOURCE_ROOT ??
    (existsSync(join(repositoryRoot, integratedCardPath))
      ? repositoryRoot
      : undefined);

  if (!integrationSourceRoot) {
    context.skip(
      'Set WORKFLOW_INTEGRATION_SOURCE_ROOT to the accepted combined tree for the integration source audit.',
    );
    return;
  }

  assertExports(integrationSourceRoot, [
    ...contract.catalogBoundary.requiredWebExports,
    ...contract.catalogBoundary.generatedClientExports,
  ]);

  const layout = readFileSync(
    join(
      integrationSourceRoot,
      contract.ownership.routeLayout.currentEvidencePath,
    ),
    'utf8',
  );
  assert.match(
    layout,
    new RegExp(`\\b${contract.ownership.routeLayout.currentShellSymbol}\\b`),
  );
});
