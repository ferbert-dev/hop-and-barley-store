import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  acceptanceCheckIds,
  evidenceChannels,
  isClosureAcceptedEvidence,
  viewportProbes,
  type AcceptanceCheckId,
  type AcceptanceEvidence,
  type EvidenceChannel,
} from './acceptance-matrix';

const EVIDENCE_DIRECTORY = 'apps/web/src/quality/evidence';
const RUN_MANIFEST = `${EVIDENCE_DIRECTORY}/c3-local-runs.json`;
const VISUAL_MANIFEST = `${EVIDENCE_DIRECTORY}/c3-visual-baselines.json`;
const MANUAL_REVIEW = `${EVIDENCE_DIRECTORY}/c3-manual-review.json`;
const BASELINE_DIRECTORY =
  'apps/e2e/tests/__screenshots__/catalog-discovery.spec.ts';

export const c3RequirementId = 'c3-catalog-discovery' as const;

export const c3CatalogStates = [
  'loading',
  'ready',
  'filtered',
  'empty',
  'error',
] as const;

export type C3CatalogState = (typeof c3CatalogStates)[number];

/**
 * This table is intentionally independent of `acceptanceChecks`. A drift test
 * compares it with Q1, so changing Q1 cannot silently change the C3 required
 * set or turn an unreviewed row into evidence.
 */
export const c3RequiredChannelsByCheck = {
  'responsive-layout': ['playwright', 'visual', 'manual'],
  'keyboard-navigation': ['vitest', 'playwright', 'manual'],
  'focus-visible': ['playwright', 'visual', 'manual'],
  'names-and-labels': ['vitest', 'axe', 'playwright', 'manual'],
  contrast: ['axe', 'manual'],
  'error-messaging': ['vitest', 'axe', 'playwright', 'manual'],
  'reduced-motion': ['vitest', 'playwright', 'manual'],
  'overflow-and-reflow': ['playwright', 'visual', 'manual'],
  'route-announcement': ['playwright', 'manual'],
} as const satisfies Record<AcceptanceCheckId, readonly EvidenceChannel[]>;

export interface C3EvidenceMapping {
  channel: EvidenceChannel;
  check: AcceptanceCheckId;
  requirementId: typeof c3RequirementId;
  state: C3CatalogState;
}

export interface C3CatalogEvidenceRecord extends C3EvidenceMapping {
  evidence: AcceptanceEvidence;
  id: string;
  routeFamily: 'catalog';
}

export const c3RequiredEvidenceMappings: readonly C3EvidenceMapping[] =
  c3CatalogStates.flatMap((state) =>
    acceptanceCheckIds.flatMap((check) =>
      c3RequiredChannelsByCheck[check].map((channel) => ({
        channel,
        check,
        requirementId: c3RequirementId,
        state,
      })),
    ),
  );

/**
 * C3 has local artifacts, but no independent closure review yet. Keeping every
 * row `not-run` is deliberate: a PNG, test source, or terminal transcript is
 * not a durable reviewed pass by itself.
 */
export const c3CatalogEvidence: readonly C3CatalogEvidenceRecord[] =
  c3RequiredEvidenceMappings.map((mapping) => ({
    ...mapping,
    evidence: {
      artifact: null,
      channel: mapping.channel,
      checkedAt: null,
      note: 'Pending durable run evidence and independent C3 closure review.',
      status: 'not-run',
    },
    id: [
      mapping.requirementId,
      mapping.state,
      mapping.check,
      mapping.channel,
    ].join('--'),
    routeFamily: 'catalog',
  }));

type C3RunMode = 'api-connected' | 'api-unavailable' | 'unit';
type C3RunOutcome = 'blocked' | 'fail' | 'pass' | 'pending';

interface C3RunRecord {
  channels: EvidenceChannel[];
  checks: AcceptanceCheckId[];
  id: string;
  outcome: 'pass';
  states: C3CatalogState[];
  title: string;
}

interface C3Run {
  command: string | null;
  environment: { node: string; pnpm: string } | null;
  finishedAt: string | null;
  id: string;
  mode: C3RunMode;
  note: string;
  outcome: C3RunOutcome;
  records: C3RunRecord[];
  startedAt: string | null;
}

export interface C3RunManifest {
  runs: C3Run[];
  schemaVersion: 1;
}

export interface C3VisualBaseline {
  focusTarget: 'filter' | 'pagination' | 'recovery' | 'retry' | null;
  height: number;
  id: string;
  kind: 'core-state' | 'focus';
  path: string;
  sha256: string;
  state: C3CatalogState;
  viewport: { height: number; id: string; width: number };
  width: number;
}

export interface C3VisualManifest {
  baselineDirectory: typeof BASELINE_DIRECTORY;
  baselines: C3VisualBaseline[];
  review: {
    outcome: 'approved' | 'pending' | 'rejected';
    reviewedAt: string | null;
    reviewerAgentRun: string | null;
  };
  schemaVersion: 1;
}

export interface C3ManualReview {
  note: string;
  outcome: 'approved' | 'pending' | 'rejected';
  reviewedAt: string | null;
  reviewerAgentRun: string | null;
  schemaVersion: 1;
}

export interface C3EvidenceArtifacts {
  manualReview: C3ManualReview;
  runManifest: C3RunManifest;
  visualManifest: C3VisualManifest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isUtcTimestamp(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
  ) {
    return false;
  }

  const parsed = new Date(value);
  const normalized = value.includes('.') ? value : value.replace(/Z$/, '.000Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === normalized;
}

function isState(value: unknown): value is C3CatalogState {
  return c3CatalogStates.some((state) => state === value);
}

function isCheck(value: unknown): value is AcceptanceCheckId {
  return acceptanceCheckIds.some((check) => check === value);
}

function isChannel(value: unknown): value is EvidenceChannel {
  return evidenceChannels.some((channel) => channel === value);
}

function hasUniqueNonEmptyStrings(values: unknown[]): boolean {
  return (
    values.every(isNonEmptyString) && new Set(values).size === values.length
  );
}

function readPngDimensions(
  buffer: Buffer,
): { height: number; width: number } | null {
  if (
    buffer.length < 24 ||
    buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
  ) {
    return null;
  }

  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readJson<T>(repositoryRoot: string, path: string): T {
  return JSON.parse(readFileSync(join(repositoryRoot, path), 'utf8')) as T;
}

function mappingKey(mapping: C3EvidenceMapping): string {
  return [
    mapping.requirementId,
    mapping.state,
    mapping.check,
    mapping.channel,
  ].join('|');
}

function validateExactMappings(
  evidence: readonly C3CatalogEvidenceRecord[],
  requiredMappings: readonly C3EvidenceMapping[],
): string[] {
  const errors: string[] = [];
  const expected = new Map<string, number>();
  const actual = new Map<string, number>();

  for (const mapping of requiredMappings) {
    const key = mappingKey(mapping);
    expected.set(key, (expected.get(key) ?? 0) + 1);
  }
  for (const record of evidence) {
    const key = mappingKey(record);
    actual.set(key, (actual.get(key) ?? 0) + 1);
  }

  if ([...expected.values()].some((count) => count !== 1)) {
    errors.push('C3 required mappings must be unique.');
  }
  for (const key of new Set([...expected.keys(), ...actual.keys()])) {
    if (expected.get(key) !== actual.get(key)) {
      errors.push(`C3 mapping ${key} is missing, duplicated or unexpected.`);
    }
  }
  if (!hasUniqueNonEmptyStrings(evidence.map(({ id }) => id))) {
    errors.push('C3 evidence IDs must be unique and non-empty.');
  }
  return errors;
}

export function loadC3EvidenceArtifacts(
  repositoryRoot: string,
): C3EvidenceArtifacts {
  return {
    manualReview: readJson<C3ManualReview>(repositoryRoot, MANUAL_REVIEW),
    runManifest: readJson<C3RunManifest>(repositoryRoot, RUN_MANIFEST),
    visualManifest: readJson<C3VisualManifest>(repositoryRoot, VISUAL_MANIFEST),
  };
}

export function validateC3RunManifest(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ['C3 run manifest must be an object.'];
  if (value.schemaVersion !== 1) errors.push('C3 run schemaVersion must be 1.');
  if (!Array.isArray(value.runs)) return [...errors, 'C3 runs are required.'];

  const runs = value.runs;
  const ids: unknown[] = [];
  const modes: unknown[] = [];
  for (const candidate of runs) {
    if (!isRecord(candidate)) {
      errors.push('C3 run must be an object.');
      continue;
    }
    ids.push(candidate.id);
    modes.push(candidate.mode);
    const prefix = `C3 run ${String(candidate.id)}`;
    if (!isNonEmptyString(candidate.id) || !isNonEmptyString(candidate.note)) {
      errors.push(`${prefix} needs an ID and note.`);
    }
    if (
      !['api-connected', 'api-unavailable', 'unit'].includes(
        String(candidate.mode),
      )
    ) {
      errors.push(`${prefix} has an invalid mode.`);
    }
    if (
      !['blocked', 'fail', 'pass', 'pending'].includes(
        String(candidate.outcome),
      )
    ) {
      errors.push(`${prefix} has an invalid outcome.`);
    }

    for (const field of ['startedAt', 'finishedAt'] as const) {
      if (candidate[field] !== null && !isUtcTimestamp(candidate[field])) {
        errors.push(`${prefix} has an invalid ${field}.`);
      }
    }
    if (
      isUtcTimestamp(candidate.startedAt) &&
      isUtcTimestamp(candidate.finishedAt) &&
      new Date(candidate.finishedAt) < new Date(candidate.startedAt)
    ) {
      errors.push(`${prefix} finishes before it starts.`);
    }

    if (!Array.isArray(candidate.records)) {
      errors.push(`${prefix} records must be an array.`);
      continue;
    }
    if (candidate.outcome === 'pending') {
      if (
        candidate.command !== null ||
        candidate.environment !== null ||
        candidate.startedAt !== null ||
        candidate.finishedAt !== null ||
        candidate.records.length !== 0
      ) {
        errors.push(
          `${prefix} pending state must not claim execution evidence.`,
        );
      }
      continue;
    }
    if (candidate.outcome === 'pass') {
      if (
        !isNonEmptyString(candidate.command) ||
        !isUtcTimestamp(candidate.startedAt) ||
        !isUtcTimestamp(candidate.finishedAt) ||
        !isRecord(candidate.environment) ||
        !isNonEmptyString(candidate.environment.node) ||
        !isNonEmptyString(candidate.environment.pnpm) ||
        candidate.records.length === 0
      ) {
        errors.push(`${prefix} pass is missing durable execution metadata.`);
      }
    }

    const recordIds: unknown[] = [];
    for (const record of candidate.records) {
      if (!isRecord(record)) {
        errors.push(`${prefix} record must be an object.`);
        continue;
      }
      recordIds.push(record.id);
      if (
        !isNonEmptyString(record.id) ||
        !isNonEmptyString(record.title) ||
        record.outcome !== 'pass' ||
        !Array.isArray(record.states) ||
        !record.states.every(isState) ||
        !Array.isArray(record.checks) ||
        !record.checks.every(isCheck) ||
        !Array.isArray(record.channels) ||
        !record.channels.every(isChannel)
      ) {
        errors.push(`${prefix} has an invalid record ${String(record.id)}.`);
      }
    }
    if (!hasUniqueNonEmptyStrings(recordIds)) {
      errors.push(`${prefix} record IDs must be unique.`);
    }
  }

  if (!hasUniqueNonEmptyStrings(ids)) errors.push('C3 run IDs must be unique.');
  if (
    runs.length !== 3 ||
    !hasUniqueNonEmptyStrings(modes) ||
    !['api-connected', 'api-unavailable', 'unit'].every((mode) =>
      modes.includes(mode),
    )
  ) {
    errors.push('C3 requires exactly unit, connected, and unavailable runs.');
  }
  return errors;
}

const expectedFocusBaselines = [
  {
    filename: 'catalog-ready-filter-focus-360.png',
    focusTarget: 'filter',
    state: 'ready',
    viewportWidth: 360,
  },
  {
    filename: 'catalog-filtered-pagination-focus-1280.png',
    focusTarget: 'pagination',
    state: 'filtered',
    viewportWidth: 1280,
  },
  {
    filename: 'catalog-empty-recovery-focus-360.png',
    focusTarget: 'recovery',
    state: 'empty',
    viewportWidth: 360,
  },
  {
    filename: 'catalog-error-retry-focus-360.png',
    focusTarget: 'retry',
    state: 'error',
    viewportWidth: 360,
  },
] as const;

export function validateC3VisualManifest(
  value: unknown,
  repositoryRoot: string,
): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ['C3 visual manifest must be an object.'];
  if (value.schemaVersion !== 1) {
    errors.push('C3 visual schemaVersion must be 1.');
  }
  if (value.baselineDirectory !== BASELINE_DIRECTORY) {
    errors.push('C3 visual baseline directory is invalid.');
  }
  if (!isRecord(value.review)) {
    errors.push('C3 visual review metadata is required.');
  } else if (value.review.outcome === 'pending') {
    if (
      value.review.reviewedAt !== null ||
      value.review.reviewerAgentRun !== null
    ) {
      errors.push('Pending visual review must not claim reviewer evidence.');
    }
  } else if (
    !['approved', 'rejected'].includes(String(value.review.outcome)) ||
    !isUtcTimestamp(value.review.reviewedAt) ||
    !isNonEmptyString(value.review.reviewerAgentRun) ||
    !String(value.review.reviewerAgentRun).startsWith('https://')
  ) {
    errors.push('Completed visual review metadata is invalid.');
  }
  if (!Array.isArray(value.baselines)) {
    return [...errors, 'C3 visual baselines are required.'];
  }

  const baselineIds: unknown[] = [];
  const baselinePaths: unknown[] = [];
  const coreKeys = new Map<string, number>();
  const focusKeys = new Map<string, number>();
  for (const candidate of value.baselines) {
    if (!isRecord(candidate)) {
      errors.push('C3 visual baseline must be an object.');
      continue;
    }
    baselineIds.push(candidate.id);
    baselinePaths.push(candidate.path);
    const prefix = `C3 visual baseline ${String(candidate.id)}`;
    if (
      !isNonEmptyString(candidate.id) ||
      !isNonEmptyString(candidate.path) ||
      !isState(candidate.state) ||
      !['core-state', 'focus'].includes(String(candidate.kind)) ||
      !Number.isInteger(candidate.width) ||
      !Number.isInteger(candidate.height) ||
      Number(candidate.width) <= 0 ||
      Number(candidate.height) <= 0 ||
      !/^[a-f0-9]{64}$/.test(String(candidate.sha256)) ||
      !isRecord(candidate.viewport)
    ) {
      errors.push(`${prefix} metadata is invalid.`);
      continue;
    }

    const viewportMetadata = candidate.viewport;
    const viewport = viewportProbes.find(
      ({ id }) => id === viewportMetadata.id,
    );
    if (
      viewport === undefined ||
      !viewport.visualBaseline ||
      viewport.width !== viewportMetadata.width ||
      viewport.height !== viewportMetadata.height
    ) {
      errors.push(`${prefix} viewport does not match a Q1 core probe.`);
    }

    const path = join(repositoryRoot, candidate.path);
    if (!candidate.path.startsWith(`${BASELINE_DIRECTORY}/`)) {
      errors.push(`${prefix} escapes the catalog baseline directory.`);
    } else if (!existsSync(path)) {
      errors.push(`${prefix} is missing.`);
    } else {
      const buffer = readFileSync(path);
      const hash = createHash('sha256').update(buffer).digest('hex');
      if (hash !== candidate.sha256) errors.push(`${prefix} SHA-256 drifted.`);
      const dimensions = readPngDimensions(buffer);
      if (
        dimensions === null ||
        dimensions.width !== candidate.width ||
        dimensions.height !== candidate.height
      ) {
        errors.push(`${prefix} dimensions drifted.`);
      }
    }

    const filename = String(candidate.path).split('/').at(-1);
    if (candidate.kind === 'core-state') {
      if (
        candidate.focusTarget !== null ||
        candidate.width !== viewportMetadata.width ||
        filename !==
          `catalog-${String(candidate.state)}-${String(viewportMetadata.width)}.png`
      ) {
        errors.push(`${prefix} is not a canonical core-state baseline.`);
      }
      const key = `${String(candidate.state)}|${String(viewportMetadata.width)}`;
      coreKeys.set(key, (coreKeys.get(key) ?? 0) + 1);
    } else {
      const key = [
        String(candidate.state),
        String(candidate.focusTarget),
        String(viewportMetadata.width),
        filename,
      ].join('|');
      focusKeys.set(key, (focusKeys.get(key) ?? 0) + 1);
    }
  }

  if (!hasUniqueNonEmptyStrings(baselineIds)) {
    errors.push('C3 visual baseline IDs must be unique.');
  }
  if (!hasUniqueNonEmptyStrings(baselinePaths)) {
    errors.push('C3 visual baseline paths must be unique.');
  }

  const expectedCoreKeys = c3CatalogStates.flatMap((state) =>
    viewportProbes
      .filter(({ visualBaseline }) => visualBaseline)
      .map(({ width }) => `${state}|${String(width)}`),
  );
  const expectedFocusKeys = expectedFocusBaselines.map(
    ({ filename, focusTarget, state, viewportWidth }) =>
      `${state}|${focusTarget}|${String(viewportWidth)}|${filename}`,
  );
  for (const [label, expectedKeys, actualKeys] of [
    ['core-state', expectedCoreKeys, coreKeys],
    ['focus', expectedFocusKeys, focusKeys],
  ] as const) {
    for (const key of new Set([...expectedKeys, ...actualKeys.keys()])) {
      const expectedCount = expectedKeys.filter(
        (value) => value === key,
      ).length;
      if (actualKeys.get(key) !== expectedCount) {
        errors.push(
          `C3 ${label} visual ${key} is missing, duplicated or unexpected.`,
        );
      }
    }
  }

  const directory = join(repositoryRoot, BASELINE_DIRECTORY);
  const onDisk = existsSync(directory)
    ? readdirSync(directory)
        .filter((filename) => filename.endsWith('.png'))
        .sort()
    : [];
  const declared = value.baselines
    .filter(isRecord)
    .map(({ path }) => String(path).split('/').at(-1) ?? '')
    .sort();
  if (JSON.stringify(onDisk) !== JSON.stringify(declared)) {
    errors.push('C3 visual manifest must exactly match the PNGs on disk.');
  }
  if (value.baselines.length !== 24) {
    errors.push('C3 visual manifest must contain exactly 24 baselines.');
  }
  return errors;
}

export function validateC3ManualReview(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ['C3 manual review must be an object.'];
  if (value.schemaVersion !== 1) {
    errors.push('C3 manual review schemaVersion must be 1.');
  }
  if (!isNonEmptyString(value.note)) {
    errors.push('C3 manual review note is required.');
  }
  if (value.outcome === 'pending') {
    if (value.reviewedAt !== null || value.reviewerAgentRun !== null) {
      errors.push('Pending C3 review must not claim reviewer evidence.');
    }
  } else if (
    !['approved', 'rejected'].includes(String(value.outcome)) ||
    !isUtcTimestamp(value.reviewedAt) ||
    !isNonEmptyString(value.reviewerAgentRun) ||
    !String(value.reviewerAgentRun).startsWith('https://')
  ) {
    errors.push('Completed C3 manual review metadata is invalid.');
  }
  return errors;
}

export function validateC3EvidenceStructure({
  artifacts,
  evidence,
  repositoryRoot,
  requiredMappings,
}: {
  artifacts: C3EvidenceArtifacts;
  evidence: readonly C3CatalogEvidenceRecord[];
  repositoryRoot: string;
  requiredMappings: readonly C3EvidenceMapping[];
}): string[] {
  return [
    ...validateExactMappings(evidence, requiredMappings),
    ...validateC3RunManifest(artifacts.runManifest),
    ...validateC3VisualManifest(artifacts.visualManifest, repositoryRoot),
    ...validateC3ManualReview(artifacts.manualReview),
  ];
}

function parseArtifact(
  value: string,
): { path: string; recordId: string } | null {
  const separator = value.lastIndexOf('#');
  if (separator <= 0 || separator === value.length - 1) return null;
  const path = value.slice(0, separator);
  const recordId = value.slice(separator + 1);
  if (!path.endsWith('.json') || !isNonEmptyString(recordId)) return null;
  return { path, recordId };
}

export function validateC3EvidenceBundle(input: {
  artifacts: C3EvidenceArtifacts;
  evidence: readonly C3CatalogEvidenceRecord[];
  repositoryRoot: string;
  requiredMappings: readonly C3EvidenceMapping[];
}): string[] {
  const errors = validateC3EvidenceStructure(input);

  for (const record of input.evidence) {
    if (!isClosureAcceptedEvidence(record.evidence)) {
      errors.push(
        `C3 evidence ${record.id} is non-closing (${record.evidence.status}).`,
      );
      continue;
    }
    if (record.evidence.status === 'not-applicable') {
      if (
        input.artifacts.manualReview.outcome !== 'approved' ||
        record.evidence.reviewerAgreementTrace !==
          input.artifacts.manualReview.reviewerAgentRun
      ) {
        errors.push(`C3 evidence ${record.id} is not reviewer-approved N/A.`);
      }
      continue;
    }

    const parsed = parseArtifact(record.evidence.artifact);
    if (
      parsed === null ||
      !parsed.path.startsWith(`${EVIDENCE_DIRECTORY}/c3-`) ||
      !existsSync(join(input.repositoryRoot, parsed?.path ?? ''))
    ) {
      errors.push(
        `C3 evidence ${record.id} does not reference a durable C3 JSON record.`,
      );
      continue;
    }

    // A path is not enough: the referenced record must exist in an approved
    // artifact and carry the same state/check/channel mapping.
    const matchingRunRecord = input.artifacts.runManifest.runs
      .filter(({ outcome }) => outcome === 'pass')
      .flatMap(({ finishedAt, records }) =>
        records.map((runRecord) => ({ finishedAt, runRecord })),
      )
      .find(
        ({ runRecord }) =>
          parsed.path === RUN_MANIFEST && runRecord.id === parsed.recordId,
      );
    if (
      matchingRunRecord === undefined ||
      matchingRunRecord.finishedAt !== record.evidence.checkedAt ||
      !matchingRunRecord.runRecord.states.includes(record.state) ||
      !matchingRunRecord.runRecord.checks.includes(record.check) ||
      !matchingRunRecord.runRecord.channels.includes(record.evidence.channel)
    ) {
      errors.push(
        `C3 evidence ${record.id} references an unknown or mismatched record.`,
      );
    }
  }
  if (input.artifacts.manualReview.outcome !== 'approved') {
    errors.push('C3 independent manual closure review is still pending.');
  }
  if (input.artifacts.visualManifest.review.outcome !== 'approved') {
    errors.push('C3 visual review is still pending.');
  }
  return errors;
}
