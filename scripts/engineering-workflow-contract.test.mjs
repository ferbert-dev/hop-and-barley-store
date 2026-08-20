import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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

const workflow = readFileSync(workflowPath, 'utf8');
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const dockerIgnore = readFileSync(dockerIgnorePath, 'utf8');
const gitIgnore = readFileSync(gitIgnorePath, 'utf8');
const readme = readFileSync(readmePath, 'utf8');
const ticketTemplate = readFileSync(ticketTemplatePath, 'utf8');

const referenceBundleIgnore = '/docs/Hop-and-Barley-main/';

const expectedRuleIds = [
  'catalog-query-parity',
  'catalog-source-evidence-provenance',
  'cross-workspace-contract-second-consumer',
  'direct-node24-clean-order',
  'disposable-postgres-review',
  'durable-fail-closed-evidence',
  'exact-head-green-review',
  'generated-contract-drift',
  'immutable-correction-review',
  'independent-required-set',
  'isolated-next-build-server',
  'one-ticket-branch-pr',
  'public-private-cache-separation',
  'reviewed-patch-binary-manifest',
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
  'sha256:350da2a9be59ee39437c77364ce515edd8ed43ebd64de88ed471a1a2af61699c';
const expectedArtifactReferencePattern = '<durable-json-path>#<record-id>';
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
const expectedPatchManifestFields = [
  'baseObjectId',
  'targetObjectId',
  'changedPaths',
  'textLineCounts',
  'dependencyLockDelta',
  'binarySha256',
  'binaryDimensionsOrType',
  'binaryProvenance',
  'reviewMethod',
  'runArtifacts',
  'cleanupEvidence',
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
const expectedAlwaysEvidence = [
  'changedPaths',
  'relevantTests',
  'ci',
  'cleanup',
  'exactHeadSha',
];
const expectedSemanticReporterProposal = {
  status: 'proposed-non-closing',
  activationRequires: [
    'dedicated-tooling-ticket',
    'executable-reporter-command',
    'versioned-artifact-schema',
    'ticket-template-slot',
    'ci-contract',
    'independent-review',
  ],
  blocksTickets: [],
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
  '### Conditional evidence tiers',
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

  if (candidate.evidence?.requiredSetOwner !== 'independent-reviewer') {
    errors.push('the required evidence set must be reviewer-owned');
  }
  if (
    candidate.evidence?.artifactReferencePattern !==
    expectedArtifactReferencePattern
  ) {
    errors.push('the durable artifact reference pattern drifted');
  }
  if (
    JSON.stringify(candidate.evidence?.mappingFields) !==
    JSON.stringify(['requirementId', 'state', 'check', 'channel'])
  ) {
    errors.push('the evidence mapping key drifted');
  }
  if (
    JSON.stringify(candidate.evidence?.closureEligibleStatuses) !==
    JSON.stringify(['pass', 'not-applicable'])
  ) {
    errors.push('closure-eligible statuses drifted');
  }
  if (
    JSON.stringify(candidate.evidence?.nonClosingStatuses) !==
    JSON.stringify(['pending', 'not-run', 'blocked', 'fail'])
  ) {
    errors.push('non-closing statuses drifted');
  }
  if (
    JSON.stringify(candidate.evidence?.pass?.requires) !==
    JSON.stringify([
      'artifact',
      'checkedAt',
      'outcome',
      'commandOrTestName',
      'mode',
      'environment',
    ])
  ) {
    errors.push('passing evidence requirements drifted');
  }
  if (candidate.evidence?.notApplicable?.artifact !== null) {
    errors.push('not-applicable evidence must have a null artifact');
  }
  if (
    JSON.stringify(candidate.evidence?.notApplicable?.requires) !==
    JSON.stringify(['reason', 'reviewerAgreementTrace'])
  ) {
    errors.push('not-applicable review requirements drifted');
  }
  if (
    JSON.stringify(candidate.evidence?.always) !==
    JSON.stringify(expectedAlwaysEvidence)
  ) {
    errors.push('always-required evidence drifted');
  }
  if (
    JSON.stringify(candidate.evidence?.conditional) !==
    JSON.stringify({
      database: 'schema-migration-seed-or-data-touch',
      playwright: 'user-flow-or-browser-state-touch',
      visualManual: 'visual-bytes-layout-or-manual-risk',
      fullBinaryManifest: 'binary-dependency-lock-or-multi-slice-integration',
    })
  ) {
    errors.push('conditional evidence tiers drifted');
  }
  if (Object.hasOwn(candidate.evidence ?? {}, 'automatedSemanticProof')) {
    errors.push('unimplemented semantic reporter must not be a closing gate');
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
    JSON.stringify(candidate.integration?.patchManifestRequiredFields) !==
    JSON.stringify(expectedPatchManifestFields)
  ) {
    errors.push('the reviewed patch manifest is incomplete');
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
    candidate.delivery?.branch?.pattern !== '^agent/[a-z0-9]+-[a-z0-9-]+$' ||
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
      qualityMappings: 135,
      qualityPass: 113,
      qualityNotApplicable: 22,
      visualBaselinesPerPlatform: 24,
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
        unsupportedAutomatedEvidenceMappings: 0,
        maximumCiRunsPerTicket: 3,
        maximumExactHeadReviewAttemptsPerTicket: 2,
      },
      semanticReporterProposal: expectedSemanticReporterProposal,
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
    'requirementId + state + check + channel',
    'path/to/report.json#record-id',
    'one `.next` directory',
    'pnpm exec turbo run typecheck --force',
    '62 backed passes plus 46 precise reviewer-approved N/A records',
    'zero third product cards',
    'one `agent/<ticket>-<slug>` branch and one draft pull request',
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
      'node scripts/verify-generated-stability.mjs'
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

test('ticket template captures every traceability field and tiered evidence', () => {
  const traceabilityLabels = {
    ticketUrl: '- Ticket URL:',
    agentRunUrl: '- Implementation Agent Run:',
    branch: '- Branch: `agent/<ticket>-<slug>`',
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
  for (const literal of ['- Evidence tiers:', '- Delivery metrics:']) {
    assert.ok(ticketTemplate.includes(literal), literal);
  }
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
  const evidenceSource = readFileSync(
    join(repositoryRoot, 'apps/web/src/quality/c3-catalog-evidence.ts'),
    'utf8',
  );
  const localRuns = JSON.parse(
    readFileSync(
      join(repositoryRoot, 'apps/web/src/quality/evidence/c3-local-runs.json'),
      'utf8',
    ),
  );
  const manualReview = JSON.parse(
    readFileSync(
      join(
        repositoryRoot,
        'apps/web/src/quality/evidence/c3-manual-review.json',
      ),
      'utf8',
    ),
  );
  const visualBaselines = JSON.parse(
    readFileSync(
      join(
        repositoryRoot,
        'apps/web/src/quality/evidence/c3-visual-baselines.json',
      ),
      'utf8',
    ),
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

  const catalogStatesBlock = evidenceSource.match(
    /export const c3CatalogStates = \[([\s\S]*?)\] as const;/u,
  )?.[1];
  assert.ok(catalogStatesBlock, 'C3 catalog states export must exist');
  const catalogStates = [...catalogStatesBlock.matchAll(/'([^']+)'/gu)].map(
    ([, state]) => state,
  );

  const channelMapBlock = evidenceSource.match(
    /export const c3RequiredChannelsByCheck = \{([\s\S]*?)\} as const satisfies/u,
  )?.[1];
  assert.ok(channelMapBlock, 'C3 required-channel map must exist');
  const channelsByCheck = Object.fromEntries(
    [...channelMapBlock.matchAll(/('?[^':]+'?): \[([^\]]+)\]/gu)].map(
      ([, rawCheck, rawChannels]) => [
        rawCheck.replaceAll("'", ''),
        [...rawChannels.matchAll(/'([^']+)'/gu)].map(([, channel]) => channel),
      ],
    ),
  );
  const channelsPerState = Object.values(channelsByCheck).reduce(
    (total, channels) => total + channels.length,
    0,
  );

  const loadingNotApplicableChecks = [
    ...(evidenceSource
      .match(
        /mapping\.state === 'loading'[\s\S]*?\[([^\]]+)\]\.includes\(\s*mapping\.check/u,
      )?.[1]
      .matchAll(/'([^']+)'/gu) ?? []),
  ].map(([, check]) => check);
  const successfulStates = [
    ...(evidenceSource
      .match(/return \(\s*\[([^\]]+)\]\.includes\(mapping\.state\)/u)?.[1]
      .matchAll(/'([^']+)'/gu) ?? []),
  ].map(([, state]) => state);
  const notApplicableCount =
    loadingNotApplicableChecks.reduce(
      (total, check) => total + channelsByCheck[check].length,
      0,
    ) +
    successfulStates.length * channelsByCheck['error-messaging'].length;

  const publicCurrencies = [
    ...new Set(
      [...service.matchAll(/currency: '([A-Z]{3})'/gu)].map(
        ([, currency]) => currency,
      ),
    ),
  ];
  const automatedPassCount = localRuns.runs.reduce((total, run) => {
    assert.equal(run.outcome, 'pass', run.id);
    assert.equal(
      run.records.every((record) => record.outcome === 'pass'),
      true,
      run.id,
    );
    return total + run.records.length;
  }, 0);
  assert.equal(
    manualReview.observations.every(
      (observation) => observation.status === 'approved',
    ),
    true,
  );
  assert.equal(visualBaselines.review.outcome, 'approved');

  assert.deepEqual(publicCurrencies, [
    contract.catalogBoundary.baseline.currency,
  ]);
  assert.equal(
    catalogStates.length,
    contract.catalogBoundary.baseline.catalogStates,
  );
  assert.equal(
    catalogStates.length * channelsPerState,
    contract.catalogBoundary.baseline.qualityMappings,
  );
  assert.equal(
    automatedPassCount +
      manualReview.observations.length +
      visualBaselines.evidenceSets.length,
    contract.catalogBoundary.baseline.qualityPass,
  );
  assert.equal(
    notApplicableCount,
    contract.catalogBoundary.baseline.qualityNotApplicable,
  );

  for (const relativeDirectory of [
    'apps/e2e/tests/__screenshots__/catalog-discovery.spec.ts',
    'apps/e2e/tests/__screenshots__/linux/catalog-discovery.spec.ts',
  ]) {
    assert.equal(
      readdirSync(join(repositoryRoot, relativeDirectory)).filter((path) =>
        path.endsWith('.png'),
      ).length,
      contract.catalogBoundary.baseline.visualBaselinesPerPlatform,
    );
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

test('contract rejects fail-open evidence semantics', () => {
  const candidate = clone(contract);
  candidate.evidence.pass.requires = [];
  candidate.evidence.notApplicable.artifact = 'checklist.md';
  candidate.evidence.nonClosingStatuses = ['not-run', 'blocked', 'fail'];

  const errors = validateWorkflowContract(
    candidate,
    workflow,
    packageJson,
  ).join('\n');
  assert.match(errors, /passing evidence requirements/);
  assert.match(errors, /non-closing statuses drifted/);
  assert.match(errors, /null artifact/);
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
  candidate.integration.patchManifestRequiredFields = [];

  const errors = validateWorkflowContract(
    candidate,
    workflow,
    packageJson,
  ).join('\n');
  assert.match(errors, /uncached/);
  assert.match(errors, /clean-order/);
  assert.match(errors, /patch manifest/);
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
