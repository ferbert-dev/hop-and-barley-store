import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import localRunsJson from './evidence/c3-local-runs.json';
import manualReviewJson from './evidence/c3-manual-review.json';
import visualBaselinesJson from './evidence/c3-visual-baselines.json';
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
const BASELINE_DIRECTORIES = {
  darwin: 'apps/e2e/tests/__screenshots__/catalog-discovery.spec.ts',
  linux: 'apps/e2e/tests/__screenshots__/linux/catalog-discovery.spec.ts',
} as const;

export const c3RequirementId = 'c3-catalog-discovery' as const;
export const c3FailedReviewUrl =
  'https://app.notion.com/p/3bdd78850eab811fa693c08c1e93246b?pvs=204';
export const c3FailedReviewAt = '2026-08-15T01:55:00.000Z';
export const c3ManualReviewUrl =
  'https://app.notion.com/p/3bdd78850eab81dea404f9242a124efb';
export const c3ManualReviewedAt = '2026-08-15T02:30:32Z';

export const c3CatalogStates = [
  'loading',
  'ready',
  'filtered',
  'empty',
  'error',
] as const;

export type C3CatalogState = (typeof c3CatalogStates)[number];

/** Independent C3 derivation. Q1 drift is checked in the test, not inherited. */
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

function isNotApplicableMapping(mapping: C3EvidenceMapping): boolean {
  if (
    mapping.state === 'loading' &&
    ['keyboard-navigation', 'focus-visible', 'error-messaging'].includes(
      mapping.check,
    )
  ) {
    return true;
  }
  return (
    ['ready', 'filtered', 'empty'].includes(mapping.state) &&
    mapping.check === 'error-messaging'
  );
}

export const c3NotApplicableEvidenceMappings =
  c3RequiredEvidenceMappings.filter(isNotApplicableMapping);

type C3RunMode = 'api-connected' | 'api-unavailable' | 'unit';
type C3RunOutcome = 'blocked' | 'fail' | 'pass' | 'pending';
type C3Platform = keyof typeof BASELINE_DIRECTORIES;

interface C3RunRecord extends C3EvidenceMapping {
  id: string;
  outcome: 'pass';
  testName: string;
}

interface C3Run {
  command: string | null;
  environment: {
    node: string;
    platform: string;
    playwrightProject?: string;
    pnpm: string;
  } | null;
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
  schemaVersion: 2;
}

export interface C3VisualBaseline {
  focusTarget: 'filter' | 'pagination' | 'recovery' | 'retry' | null;
  height: number;
  id: string;
  kind: 'core-state' | 'focus';
  path: string;
  platform: C3Platform;
  sha256: string;
  state: C3CatalogState;
  viewport: { height: number; id: string; width: number };
  width: number;
}

interface C3VisualEvidenceSet extends C3EvidenceMapping {
  baselineIds: string[];
  channel: 'visual';
  id: string;
}

export interface C3VisualManifest {
  baselineDirectories: Record<C3Platform, string>;
  baselines: C3VisualBaseline[];
  evidenceSets: C3VisualEvidenceSet[];
  review: {
    observation: string;
    outcome: 'approved' | 'pending' | 'rejected';
    reviewedAt: string | null;
    reviewerAgentRun: string | null;
  };
  schemaVersion: 2;
}

type C3ManualReviewScope =
  'manual-mappings' | 'not-applicable-classification' | 'visual-baselines';

interface C3ManualReviewSession {
  approvedScopes: C3ManualReviewScope[];
  id: string;
  observation: string;
  outcome: 'approved' | 'approved-partial' | 'pending' | 'rejected';
  reviewedAt: string | null;
  reviewerAgentRun: string | null;
}

interface C3ManualObservation extends C3EvidenceMapping {
  channel: 'manual';
  id: string;
  observation: string;
  reviewId: string;
  status: 'approved';
}

export interface C3ManualReview {
  observations: C3ManualObservation[];
  reviews: C3ManualReviewSession[];
  schemaVersion: 2;
}

export interface C3EvidenceArtifacts {
  manualReview: C3ManualReview;
  runManifest: C3RunManifest;
  visualManifest: C3VisualManifest;
}

const bundledArtifacts = {
  manualReview: manualReviewJson,
  runManifest: localRunsJson,
  visualManifest: visualBaselinesJson,
} as unknown as C3EvidenceArtifacts;

function mappingKey(mapping: C3EvidenceMapping): string {
  return [
    mapping.requirementId,
    mapping.state,
    mapping.check,
    mapping.channel,
  ].join('|');
}

function sameMapping(
  left: C3EvidenceMapping,
  right: C3EvidenceMapping,
): boolean {
  return mappingKey(left) === mappingKey(right);
}

function notApplicableReason(mapping: C3EvidenceMapping): string {
  if (mapping.state === 'loading') {
    if (mapping.check === 'keyboard-navigation') {
      return 'The transient loading catalog has no stable catalog control to operate; keyboard behavior is exercised in ready, filtered, empty, and error states.';
    }
    if (mapping.check === 'focus-visible') {
      return 'The transient loading catalog exposes no stable focused catalog control; focus rendering is exercised in ready, filtered, empty, and error states.';
    }
    return 'Loading communicates progress rather than an input or API error, so error-message evidence does not apply.';
  }
  return `${mapping.state} is a successful non-error catalog state and has no error message to validate.`;
}

function pendingEvidence(mapping: C3EvidenceMapping): AcceptanceEvidence {
  return {
    artifact: null,
    channel: mapping.channel,
    checkedAt: null,
    note: `C3 ${mapping.state}/${mapping.check}/${mapping.channel} has no approved durable record yet.`,
    status: 'not-run',
  };
}

export function buildC3CatalogEvidence(
  artifacts: C3EvidenceArtifacts,
): readonly C3CatalogEvidenceRecord[] {
  return c3RequiredEvidenceMappings.map((mapping) => {
    let evidence: AcceptanceEvidence;
    if (isNotApplicableMapping(mapping)) {
      evidence = {
        artifact: null,
        channel: mapping.channel,
        checkedAt: c3FailedReviewAt,
        note: `Independent C3 review approved this ${mapping.state}/${mapping.check}/${mapping.channel} exclusion.`,
        reason: notApplicableReason(mapping),
        reviewerAgreementTrace: c3FailedReviewUrl,
        status: 'not-applicable',
      };
    } else if (mapping.channel === 'visual') {
      const matches = artifacts.visualManifest.evidenceSets.filter((record) =>
        sameMapping(record, mapping),
      );
      const review = artifacts.visualManifest.review;
      evidence =
        matches.length === 1 &&
        review.outcome === 'approved' &&
        typeof review.reviewedAt === 'string'
          ? {
              artifact: `${VISUAL_MANIFEST}#${matches[0].id}`,
              channel: mapping.channel,
              checkedAt: review.reviewedAt,
              note: `Reviewed macOS and Linux visual set for ${mapping.state}/${mapping.check}.`,
              status: 'pass',
            }
          : pendingEvidence(mapping);
    } else if (mapping.channel === 'manual') {
      const matches = artifacts.manualReview.observations.filter((record) =>
        sameMapping(record, mapping),
      );
      const review =
        matches.length === 1
          ? artifacts.manualReview.reviews.find(
              ({ id }) => id === matches[0].reviewId,
            )
          : undefined;
      evidence =
        matches.length === 1 &&
        review?.outcome === 'approved' &&
        review.approvedScopes.includes('manual-mappings') &&
        typeof review.reviewedAt === 'string'
          ? {
              artifact: `${MANUAL_REVIEW}#${matches[0].id}`,
              channel: mapping.channel,
              checkedAt: review.reviewedAt,
              note: matches[0].observation,
              status: 'pass',
            }
          : pendingEvidence(mapping);
    } else {
      const matches = artifacts.runManifest.runs
        .filter(({ outcome }) => outcome === 'pass')
        .flatMap((run) =>
          run.records
            .filter((record) => sameMapping(record, mapping))
            .map((record) => ({ record, run })),
        );
      evidence =
        matches.length === 1 && typeof matches[0].run.finishedAt === 'string'
          ? {
              artifact: `${RUN_MANIFEST}#${matches[0].record.id}`,
              channel: mapping.channel,
              checkedAt: matches[0].run.finishedAt,
              note: matches[0].record.testName,
              status: 'pass',
            }
          : pendingEvidence(mapping);
    }

    return {
      ...mapping,
      evidence,
      id: [
        mapping.requirementId,
        mapping.state,
        mapping.check,
        mapping.channel,
      ].join('--'),
      routeFamily: 'catalog',
    };
  });
}

export const c3CatalogEvidence = buildC3CatalogEvidence(bundledArtifacts);

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

function isMappingRecord(value: Record<string, unknown>): boolean {
  return (
    value.requirementId === c3RequirementId &&
    isState(value.state) &&
    isCheck(value.check) &&
    isChannel(value.channel)
  );
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

function exactSetErrors(
  label: string,
  expectedKeys: readonly string[],
  actualKeys: readonly string[],
): string[] {
  const errors: string[] = [];
  const expected = new Map<string, number>();
  const actual = new Map<string, number>();
  for (const key of expectedKeys)
    expected.set(key, (expected.get(key) ?? 0) + 1);
  for (const key of actualKeys) actual.set(key, (actual.get(key) ?? 0) + 1);
  for (const key of new Set([...expected.keys(), ...actual.keys()])) {
    if (expected.get(key) !== actual.get(key)) {
      errors.push(`${label} ${key} is missing, duplicated or unexpected.`);
    }
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
  if (value.schemaVersion !== 2) errors.push('C3 run schemaVersion must be 2.');
  if (!Array.isArray(value.runs)) return [...errors, 'C3 runs are required.'];

  const ids: unknown[] = [];
  const modes: unknown[] = [];
  const recordIds: unknown[] = [];
  const recordMappings: string[] = [];
  for (const candidate of value.runs) {
    if (!isRecord(candidate)) {
      errors.push('C3 run must be an object.');
      continue;
    }
    ids.push(candidate.id);
    modes.push(candidate.mode);
    const prefix = `C3 run ${String(candidate.id)}`;
    if (!isNonEmptyString(candidate.id) || !isNonEmptyString(candidate.note))
      errors.push(`${prefix} needs an ID and note.`);
    if (
      !['api-connected', 'api-unavailable', 'unit'].includes(
        String(candidate.mode),
      )
    )
      errors.push(`${prefix} has an invalid mode.`);
    if (
      !['blocked', 'fail', 'pass', 'pending'].includes(
        String(candidate.outcome),
      )
    )
      errors.push(`${prefix} has an invalid outcome.`);
    if (!Array.isArray(candidate.records)) {
      errors.push(`${prefix} records must be an array.`);
      continue;
    }
    for (const field of ['startedAt', 'finishedAt'] as const) {
      if (candidate[field] !== null && !isUtcTimestamp(candidate[field]))
        errors.push(`${prefix} has an invalid ${field}.`);
    }
    if (
      isUtcTimestamp(candidate.startedAt) &&
      isUtcTimestamp(candidate.finishedAt) &&
      new Date(candidate.finishedAt) < new Date(candidate.startedAt)
    )
      errors.push(`${prefix} finishes before it starts.`);

    if (candidate.outcome === 'pending') {
      if (
        candidate.command !== null ||
        candidate.environment !== null ||
        candidate.startedAt !== null ||
        candidate.finishedAt !== null ||
        candidate.records.length !== 0
      )
        errors.push(
          `${prefix} pending state must not claim execution evidence.`,
        );
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
        !isNonEmptyString(candidate.environment.platform) ||
        ('playwrightProject' in candidate.environment &&
          !isNonEmptyString(candidate.environment.playwrightProject)) ||
        candidate.records.length === 0
      )
        errors.push(`${prefix} pass is missing durable execution metadata.`);
      if (
        candidate.mode !== 'unit' &&
        (!isRecord(candidate.environment) ||
          candidate.environment.playwrightProject !== 'chromium')
      )
        errors.push(`${prefix} must identify the Chromium project.`);
    }

    for (const record of candidate.records) {
      if (!isRecord(record)) {
        errors.push(`${prefix} record must be an object.`);
        continue;
      }
      recordIds.push(record.id);
      if (
        !isNonEmptyString(record.id) ||
        !isNonEmptyString(record.testName) ||
        record.outcome !== 'pass' ||
        !isMappingRecord(record) ||
        record.channel === 'manual' ||
        record.channel === 'visual'
      ) {
        errors.push(`${prefix} has an invalid record ${String(record.id)}.`);
        continue;
      }
      const mapping = record as unknown as C3EvidenceMapping;
      if (isNotApplicableMapping(mapping))
        errors.push(`${prefix} claims an N/A mapping as a run pass.`);
      if (
        (candidate.mode === 'unit' && mapping.channel !== 'vitest') ||
        (candidate.mode !== 'unit' &&
          !['axe', 'playwright'].includes(mapping.channel))
      )
        errors.push(`${prefix} claims a channel outside its run mode.`);
      if (
        (candidate.mode === 'api-connected' &&
          !['ready', 'filtered', 'empty'].includes(mapping.state)) ||
        (candidate.mode === 'api-unavailable' &&
          !['loading', 'error'].includes(mapping.state))
      )
        errors.push(`${prefix} claims a state outside its environment.`);
      recordMappings.push(mappingKey(mapping));
    }
  }
  if (!hasUniqueNonEmptyStrings(ids)) errors.push('C3 run IDs must be unique.');
  if (!hasUniqueNonEmptyStrings(recordIds))
    errors.push('C3 run record IDs must be unique.');
  if (new Set(recordMappings).size !== recordMappings.length)
    errors.push('C3 run mappings must be unique.');
  if (
    !['api-connected', 'api-unavailable', 'unit'].every((mode) =>
      modes.includes(mode),
    )
  )
    errors.push('C3 requires unit, connected, and unavailable runs.');

  if (value.runs.every((run) => isRecord(run) && run.outcome === 'pass')) {
    const expected = c3RequiredEvidenceMappings
      .filter(
        (mapping) =>
          !isNotApplicableMapping(mapping) &&
          mapping.channel !== 'manual' &&
          mapping.channel !== 'visual',
      )
      .map(mappingKey);
    errors.push(...exactSetErrors('C3 run mapping', expected, recordMappings));
  }
  return errors;
}

const expectedFocusByState = {
  empty: 'recovery',
  error: 'retry',
  filtered: 'pagination',
  ready: 'filter',
} as const;

function expectedBaselineKey(
  platform: C3Platform,
  state: C3CatalogState,
  viewportWidth: number,
  focusTarget: C3VisualBaseline['focusTarget'],
): string {
  return [platform, state, viewportWidth, focusTarget ?? 'core'].join('|');
}

export function validateC3VisualManifest(
  value: unknown,
  repositoryRoot: string,
): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ['C3 visual manifest must be an object.'];
  if (value.schemaVersion !== 2)
    errors.push('C3 visual schemaVersion must be 2.');
  if (
    !isRecord(value.baselineDirectories) ||
    value.baselineDirectories.darwin !== BASELINE_DIRECTORIES.darwin ||
    value.baselineDirectories.linux !== BASELINE_DIRECTORIES.linux
  )
    errors.push('C3 visual baseline directories are invalid.');
  if (
    !isRecord(value.review) ||
    value.review.outcome !== 'approved' ||
    value.review.reviewerAgentRun !== c3ManualReviewUrl ||
    value.review.reviewedAt !== c3ManualReviewedAt ||
    !isNonEmptyString(value.review.observation)
  )
    errors.push('C3 visual review must match the dedicated manual review.');
  if (!Array.isArray(value.baselines) || !Array.isArray(value.evidenceSets))
    return [...errors, 'C3 visual baselines and evidence sets are required.'];

  const ids: unknown[] = [];
  const paths: unknown[] = [];
  const actualBaselineKeys: string[] = [];
  const baselineById = new Map<string, Record<string, unknown>>();
  for (const candidate of value.baselines) {
    if (!isRecord(candidate)) {
      errors.push('C3 visual baseline must be an object.');
      continue;
    }
    ids.push(candidate.id);
    paths.push(candidate.path);
    const prefix = `C3 visual baseline ${String(candidate.id)}`;
    if (
      !isNonEmptyString(candidate.id) ||
      !isNonEmptyString(candidate.path) ||
      !['darwin', 'linux'].includes(String(candidate.platform)) ||
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
    baselineById.set(candidate.id, candidate);
    const platform = candidate.platform as C3Platform;
    const viewportMetadata = candidate.viewport;
    const viewport = viewportProbes.find(
      ({ id }) => id === viewportMetadata.id,
    );
    if (
      viewport === undefined ||
      !viewport.visualBaseline ||
      viewport.width !== viewportMetadata.width ||
      viewport.height !== viewportMetadata.height
    )
      errors.push(`${prefix} viewport does not match a Q1 core probe.`);

    const filename = candidate.path.split('/').at(-1);
    const focusTarget = candidate.focusTarget;
    if (candidate.kind === 'core-state') {
      if (
        focusTarget !== null ||
        candidate.width !== viewportMetadata.width ||
        filename !==
          `catalog-${String(candidate.state)}-${String(viewportMetadata.width)}.png`
      )
        errors.push(`${prefix} is not a canonical core baseline.`);
    } else if (
      !['filter', 'pagination', 'recovery', 'retry'].includes(
        String(focusTarget),
      ) ||
      expectedFocusByState[
        candidate.state as keyof typeof expectedFocusByState
      ] !== focusTarget
    ) {
      errors.push(`${prefix} is not a canonical focus baseline.`);
    }
    actualBaselineKeys.push(
      expectedBaselineKey(
        platform,
        candidate.state as C3CatalogState,
        Number(viewportMetadata.width),
        focusTarget as C3VisualBaseline['focusTarget'],
      ),
    );

    const expectedDirectory = BASELINE_DIRECTORIES[platform];
    const path = join(repositoryRoot, candidate.path);
    if (!candidate.path.startsWith(`${expectedDirectory}/`))
      errors.push(`${prefix} escapes its platform directory.`);
    else if (!existsSync(path)) errors.push(`${prefix} is missing.`);
    else {
      const buffer = readFileSync(path);
      if (
        createHash('sha256').update(buffer).digest('hex') !== candidate.sha256
      )
        errors.push(`${prefix} SHA-256 drifted.`);
      const dimensions = readPngDimensions(buffer);
      if (
        dimensions === null ||
        dimensions.width !== candidate.width ||
        dimensions.height !== candidate.height
      )
        errors.push(`${prefix} dimensions drifted.`);
    }
  }
  if (!hasUniqueNonEmptyStrings(ids))
    errors.push('C3 visual baseline IDs must be unique.');
  if (!hasUniqueNonEmptyStrings(paths))
    errors.push('C3 visual baseline paths must be unique.');

  const expectedBaselineKeys = (
    Object.keys(BASELINE_DIRECTORIES) as C3Platform[]
  ).flatMap((platform) => [
    ...c3CatalogStates.flatMap((state) =>
      viewportProbes
        .filter(({ visualBaseline }) => visualBaseline)
        .map(({ width }) => expectedBaselineKey(platform, state, width, null)),
    ),
    ...Object.entries(expectedFocusByState).map(([state, focusTarget]) => {
      const width = state === 'filtered' ? 1280 : 360;
      return expectedBaselineKey(
        platform,
        state as C3CatalogState,
        width,
        focusTarget,
      );
    }),
  ]);
  errors.push(
    ...exactSetErrors(
      'C3 visual baseline',
      expectedBaselineKeys,
      actualBaselineKeys,
    ),
  );

  for (const platform of Object.keys(BASELINE_DIRECTORIES) as C3Platform[]) {
    const directory = join(repositoryRoot, BASELINE_DIRECTORIES[platform]);
    const onDisk = readdirSync(directory)
      .filter((filename) => filename.endsWith('.png'))
      .sort();
    const declared = value.baselines
      .filter(
        (baseline) => isRecord(baseline) && baseline.platform === platform,
      )
      .map((baseline) => String(baseline.path).split('/').at(-1) ?? '')
      .sort();
    if (JSON.stringify(onDisk) !== JSON.stringify(declared))
      errors.push(`C3 ${platform} manifest must exactly match PNGs on disk.`);
  }

  const setIds: unknown[] = [];
  const setMappings: string[] = [];
  for (const set of value.evidenceSets) {
    if (!isRecord(set)) {
      errors.push('C3 visual evidence set must be an object.');
      continue;
    }
    setIds.push(set.id);
    if (
      !isNonEmptyString(set.id) ||
      !isMappingRecord(set) ||
      set.channel !== 'visual' ||
      !Array.isArray(set.baselineIds) ||
      !hasUniqueNonEmptyStrings(set.baselineIds)
    ) {
      errors.push(`C3 visual set ${String(set.id)} is invalid.`);
      continue;
    }
    const mapping = set as unknown as C3EvidenceMapping;
    setMappings.push(mappingKey(mapping));
    const expectedBaselines =
      mapping.check === 'focus-visible'
        ? value.baselines
            .filter(
              (baseline) =>
                isRecord(baseline) &&
                baseline.kind === 'focus' &&
                baseline.state === mapping.state,
            )
            .map((baseline) => String(baseline.id))
            .sort()
        : value.baselines
            .filter(
              (baseline) =>
                isRecord(baseline) &&
                baseline.kind === 'core-state' &&
                baseline.state === mapping.state,
            )
            .map((baseline) => String(baseline.id))
            .sort();
    if (
      JSON.stringify([...set.baselineIds].sort()) !==
        JSON.stringify(expectedBaselines) ||
      set.baselineIds.some((id) => !baselineById.has(id))
    )
      errors.push(
        `C3 visual set ${String(set.id)} baseline mapping is invalid.`,
      );
  }
  if (!hasUniqueNonEmptyStrings(setIds))
    errors.push('C3 visual evidence set IDs must be unique.');
  const expectedVisualMappings = c3RequiredEvidenceMappings
    .filter(
      (mapping) =>
        mapping.channel === 'visual' && !isNotApplicableMapping(mapping),
    )
    .map(mappingKey);
  errors.push(
    ...exactSetErrors('C3 visual mapping', expectedVisualMappings, setMappings),
  );
  if (value.baselines.length !== 48)
    errors.push('C3 visual manifest must contain exactly 48 baselines.');
  return errors;
}

function isReviewScope(value: unknown): value is C3ManualReviewScope {
  return [
    'manual-mappings',
    'not-applicable-classification',
    'visual-baselines',
  ].includes(String(value));
}

export function validateC3ManualReview(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ['C3 manual review must be an object.'];
  if (value.schemaVersion !== 2)
    errors.push('C3 manual review schemaVersion must be 2.');
  if (!Array.isArray(value.reviews) || !Array.isArray(value.observations))
    return [...errors, 'C3 reviews and observations are required.'];

  const reviewIds: unknown[] = [];
  const approvedManualReviewIds = new Set<string>();
  for (const review of value.reviews) {
    if (!isRecord(review)) {
      errors.push('C3 review session must be an object.');
      continue;
    }
    reviewIds.push(review.id);
    const prefix = `C3 review ${String(review.id)}`;
    const approvedScopes = Array.isArray(review.approvedScopes)
      ? review.approvedScopes
      : [];
    if (
      !isNonEmptyString(review.id) ||
      !isNonEmptyString(review.observation) ||
      !Array.isArray(review.approvedScopes) ||
      !review.approvedScopes.every(isReviewScope) ||
      !['approved', 'approved-partial', 'pending', 'rejected'].includes(
        String(review.outcome),
      )
    )
      errors.push(`${prefix} is invalid.`);
    if (review.outcome === 'pending') {
      if (
        review.reviewerAgentRun !== null ||
        review.reviewedAt !== null ||
        approvedScopes.length !== 0
      )
        errors.push(`${prefix} pending state claims review evidence.`);
    } else if (
      !isNonEmptyString(review.reviewerAgentRun) ||
      !String(review.reviewerAgentRun).startsWith('https://') ||
      !isUtcTimestamp(review.reviewedAt)
    )
      errors.push(`${prefix} completed metadata is invalid.`);
    if (
      review.outcome === 'approved' &&
      approvedScopes.includes('manual-mappings') &&
      isNonEmptyString(review.id)
    )
      approvedManualReviewIds.add(review.id);
  }
  if (!hasUniqueNonEmptyStrings(reviewIds))
    errors.push('C3 review session IDs must be unique.');
  const failedReview = value.reviews.find(
    (review) =>
      isRecord(review) && review.id === 'c3-failed-review-visual-and-na',
  );
  if (
    !isRecord(failedReview) ||
    failedReview.outcome !== 'approved-partial' ||
    failedReview.reviewerAgentRun !== c3FailedReviewUrl ||
    failedReview.reviewedAt !== c3FailedReviewAt ||
    JSON.stringify(failedReview.approvedScopes) !==
      JSON.stringify(['visual-baselines', 'not-applicable-classification'])
  )
    errors.push('C3 failed-review scope or trace drifted.');

  const observationIds: unknown[] = [];
  const observationMappings: string[] = [];
  for (const observation of value.observations) {
    if (!isRecord(observation)) {
      errors.push('C3 manual observation must be an object.');
      continue;
    }
    observationIds.push(observation.id);
    if (
      !isNonEmptyString(observation.id) ||
      !isNonEmptyString(observation.observation) ||
      observation.status !== 'approved' ||
      observation.channel !== 'manual' ||
      !isMappingRecord(observation) ||
      !isNonEmptyString(observation.reviewId) ||
      !approvedManualReviewIds.has(observation.reviewId)
    ) {
      errors.push(
        `C3 manual observation ${String(observation.id)} is invalid.`,
      );
      continue;
    }
    const mapping = observation as unknown as C3EvidenceMapping;
    if (isNotApplicableMapping(mapping))
      errors.push('C3 manual observation cannot turn an N/A row into a pass.');
    observationMappings.push(mappingKey(mapping));
  }
  if (!hasUniqueNonEmptyStrings(observationIds))
    errors.push('C3 manual observation IDs must be unique.');
  if (new Set(observationMappings).size !== observationMappings.length)
    errors.push('C3 manual observation mappings must be unique.');
  if (approvedManualReviewIds.size > 0) {
    const expectedManualMappings = c3RequiredEvidenceMappings
      .filter(
        (mapping) =>
          mapping.channel === 'manual' && !isNotApplicableMapping(mapping),
      )
      .map(mappingKey);
    errors.push(
      ...exactSetErrors(
        'C3 manual mapping',
        expectedManualMappings,
        observationMappings,
      ),
    );
  }
  return errors;
}

function validateExactEvidenceMappings(
  evidence: readonly C3CatalogEvidenceRecord[],
  requiredMappings: readonly C3EvidenceMapping[],
): string[] {
  const errors = exactSetErrors(
    'C3 evidence mapping',
    requiredMappings.map(mappingKey),
    evidence.map(mappingKey),
  );
  if (!hasUniqueNonEmptyStrings(evidence.map(({ id }) => id)))
    errors.push('C3 evidence IDs must be unique.');
  for (const record of evidence) {
    if (
      record.routeFamily !== 'catalog' ||
      record.evidence.channel !== record.channel
    )
      errors.push(`C3 evidence ${record.id} metadata is inconsistent.`);
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
    ...validateExactEvidenceMappings(evidence, requiredMappings),
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
  const passCount = input.evidence.filter(
    ({ evidence }) => evidence.status === 'pass',
  ).length;
  const notApplicableCount = input.evidence.filter(
    ({ evidence }) => evidence.status === 'not-applicable',
  ).length;
  if (passCount !== 113 || notApplicableCount !== 22)
    errors.push(
      `C3 closure requires exactly 113 pass and 22 N/A rows; received ${passCount} pass and ${notApplicableCount} N/A.`,
    );

  for (const record of input.evidence) {
    if (!isClosureAcceptedEvidence(record.evidence)) {
      errors.push(`C3 evidence ${record.id} is non-closing.`);
      continue;
    }
    if (record.evidence.status === 'not-applicable') {
      if (
        !isNotApplicableMapping(record) ||
        record.evidence.artifact !== null ||
        record.evidence.checkedAt !== c3FailedReviewAt ||
        record.evidence.reviewerAgreementTrace !== c3FailedReviewUrl
      )
        errors.push(`C3 evidence ${record.id} is not an approved N/A.`);
      continue;
    }

    const parsed = parseArtifact(record.evidence.artifact);
    if (
      parsed === null ||
      !parsed.path.startsWith(`${EVIDENCE_DIRECTORY}/c3-`) ||
      !existsSync(join(input.repositoryRoot, parsed?.path ?? ''))
    ) {
      errors.push(
        `C3 evidence ${record.id} does not reference durable C3 JSON.`,
      );
      continue;
    }

    if (parsed.path === RUN_MANIFEST) {
      const matches = input.artifacts.runManifest.runs
        .filter(({ outcome }) => outcome === 'pass')
        .flatMap((run) =>
          run.records
            .filter(({ id }) => id === parsed.recordId)
            .map((runRecord) => ({ run, runRecord })),
        );
      if (
        matches.length !== 1 ||
        !sameMapping(matches[0].runRecord, record) ||
        matches[0].run.finishedAt !== record.evidence.checkedAt
      )
        errors.push(`C3 evidence ${record.id} mismatches its run record.`);
    } else if (parsed.path === VISUAL_MANIFEST) {
      const matches = input.artifacts.visualManifest.evidenceSets.filter(
        ({ id }) => id === parsed.recordId,
      );
      if (
        record.channel !== 'visual' ||
        matches.length !== 1 ||
        !sameMapping(matches[0], record) ||
        input.artifacts.visualManifest.review.outcome !== 'approved' ||
        input.artifacts.visualManifest.review.reviewedAt !==
          record.evidence.checkedAt
      )
        errors.push(`C3 evidence ${record.id} mismatches its visual record.`);
    } else if (parsed.path === MANUAL_REVIEW) {
      const matches = input.artifacts.manualReview.observations.filter(
        ({ id }) => id === parsed.recordId,
      );
      const review =
        matches.length === 1
          ? input.artifacts.manualReview.reviews.find(
              ({ id }) => id === matches[0].reviewId,
            )
          : undefined;
      if (
        record.channel !== 'manual' ||
        matches.length !== 1 ||
        !sameMapping(matches[0], record) ||
        review?.outcome !== 'approved' ||
        !review.approvedScopes.includes('manual-mappings') ||
        review.reviewedAt !== record.evidence.checkedAt
      )
        errors.push(`C3 evidence ${record.id} mismatches manual review.`);
    } else {
      errors.push(`C3 evidence ${record.id} references an unknown artifact.`);
    }
  }
  return errors;
}
