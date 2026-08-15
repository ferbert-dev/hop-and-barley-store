import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { acceptanceChecks } from './acceptance-matrix';
import {
  buildC3CatalogEvidence,
  c3CatalogEvidence,
  c3CatalogStates,
  c3FailedReviewAt,
  c3FailedReviewUrl,
  c3ManualReviewedAt,
  c3ManualReviewUrl,
  c3NotApplicableEvidenceMappings,
  c3RequiredEvidenceMappings,
  c3RequirementId,
  loadC3EvidenceArtifacts,
  validateC3EvidenceBundle,
  validateC3EvidenceStructure,
  validateC3ManualReview,
  validateC3RunManifest,
  validateC3VisualManifest,
  type C3CatalogEvidenceRecord,
  type C3EvidenceArtifacts,
  type C3EvidenceMapping,
} from './c3-catalog-evidence';

const repositoryRoot = join(process.cwd(), '..', '..');

function clone<T>(value: T): T {
  return structuredClone(value);
}

function structureErrors(
  artifacts: C3EvidenceArtifacts,
  evidence: readonly C3CatalogEvidenceRecord[] = buildC3CatalogEvidence(
    artifacts,
  ),
  requiredMappings: readonly C3EvidenceMapping[] = c3RequiredEvidenceMappings,
) {
  return validateC3EvidenceStructure({
    artifacts,
    evidence,
    repositoryRoot,
    requiredMappings,
  });
}

function bundleErrors(
  artifacts: C3EvidenceArtifacts,
  evidence: readonly C3CatalogEvidenceRecord[] = buildC3CatalogEvidence(
    artifacts,
  ),
) {
  return validateC3EvidenceBundle({
    artifacts,
    evidence,
    repositoryRoot,
    requiredMappings: c3RequiredEvidenceMappings,
  });
}

describe('C3 catalog closure evidence', () => {
  it('pins the independently derived exact 135-row Q1 set', () => {
    const q1DerivedMappings = c3CatalogStates.flatMap((state) =>
      acceptanceChecks.flatMap((check) =>
        [
          ...check.automatedBy,
          ...(check.manualConfirmationRequired ? (['manual'] as const) : []),
        ].map((channel) => ({
          channel,
          check: check.id,
          requirementId: c3RequirementId,
          state,
        })),
      ),
    );

    expect(c3RequiredEvidenceMappings).toHaveLength(135);
    expect(c3RequiredEvidenceMappings).toEqual(q1DerivedMappings);
    expect(c3NotApplicableEvidenceMappings).toHaveLength(22);
    expect(c3CatalogEvidence).toHaveLength(135);
    expect(
      c3CatalogEvidence.map(({ channel, check, requirementId, state }) => ({
        channel,
        check,
        requirementId,
        state,
      })),
    ).toEqual(c3RequiredEvidenceMappings);
    expect(new Set(c3CatalogEvidence.map(({ id }) => id)).size).toBe(135);
  });

  it('closes with exactly 113 durable passes and 22 reviewed N/A rows', () => {
    const artifacts = loadC3EvidenceArtifacts(repositoryRoot);
    const evidence = buildC3CatalogEvidence(artifacts);

    expect(structureErrors(artifacts, evidence)).toEqual([]);
    expect(
      evidence.filter(({ evidence }) => evidence.status === 'pass'),
    ).toHaveLength(113);
    expect(
      evidence.filter(({ evidence }) => evidence.status === 'not-applicable'),
    ).toHaveLength(22);
    expect(
      evidence.filter(({ evidence }) =>
        ['not-run', 'blocked', 'fail'].includes(evidence.status),
      ),
    ).toHaveLength(0);
    expect(bundleErrors(artifacts, evidence)).toEqual([]);
  });

  it('keeps N/A limited to the independently reviewed classification', () => {
    const evidence = c3CatalogEvidence.filter(
      ({ evidence: record }) => record.status === 'not-applicable',
    );
    const keys = evidence.map(
      ({ channel, check, state }) => `${state}|${check}|${channel}`,
    );
    const expected = c3NotApplicableEvidenceMappings.map(
      ({ channel, check, state }) => `${state}|${check}|${channel}`,
    );

    expect(keys).toEqual(expected);
    expect(
      evidence.every(
        ({ evidence: record }) =>
          record.status === 'not-applicable' &&
          record.artifact === null &&
          record.checkedAt === c3FailedReviewAt &&
          record.reviewerAgreementTrace === c3FailedReviewUrl,
      ),
    ).toBe(true);
  });

  it('recomputes all 48 reviewed macOS and Linux PNGs', () => {
    const { visualManifest } = loadC3EvidenceArtifacts(repositoryRoot);
    expect(visualManifest.baselines).toHaveLength(48);
    expect(
      visualManifest.baselines.filter(({ kind }) => kind === 'core-state'),
    ).toHaveLength(40);
    expect(
      visualManifest.baselines.filter(({ kind }) => kind === 'focus'),
    ).toHaveLength(8);
    expect(visualManifest.evidenceSets).toHaveLength(14);
    expect(visualManifest.review).toMatchObject({
      outcome: 'approved',
      reviewedAt: c3ManualReviewedAt,
      reviewerAgentRun: c3ManualReviewUrl,
    });
    expect(validateC3VisualManifest(visualManifest, repositoryRoot)).toEqual(
      [],
    );

    const namesByPlatform = Object.fromEntries(
      (['darwin', 'linux'] as const).map((platform) => [
        platform,
        visualManifest.baselines
          .filter((baseline) => baseline.platform === platform)
          .map(({ path }) => path.split('/').at(-1))
          .sort(),
      ]),
    );
    expect(namesByPlatform.linux).toEqual(namesByPlatform.darwin);
    for (const [platform, directory] of Object.entries(
      visualManifest.baselineDirectories,
    )) {
      const onDisk = readdirSync(join(repositoryRoot, directory))
        .filter((filename) => filename.endsWith('.png'))
        .sort();
      expect(namesByPlatform[platform as 'darwin' | 'linux']).toEqual(onDisk);
    }
  });

  it('records truthful exact unit, connected, and unavailable runs', () => {
    const { runManifest } = loadC3EvidenceArtifacts(repositoryRoot);

    expect(validateC3RunManifest(runManifest)).toEqual([]);
    expect(runManifest.runs.map(({ mode }) => mode).sort()).toEqual([
      'api-connected',
      'api-connected',
      'api-unavailable',
      'unit',
    ]);
    expect(runManifest.runs.every(({ outcome }) => outcome === 'pass')).toBe(
      true,
    );
    expect(
      runManifest.runs.reduce<Record<string, number>>((counts, run) => {
        counts[run.mode] = (counts[run.mode] ?? 0) + run.records.length;
        return counts;
      }, {}),
    ).toEqual({ 'api-connected': 27, 'api-unavailable': 18, unit: 15 });
    expect(runManifest.runs.flatMap(({ records }) => records)).toHaveLength(60);
  });

  it('requires an independent approved record for every applicable manual row', () => {
    const { manualReview } = loadC3EvidenceArtifacts(repositoryRoot);
    expect(validateC3ManualReview(manualReview)).toEqual([]);
    expect(manualReview.observations).toHaveLength(39);
    const fullReview = manualReview.reviews.find(({ approvedScopes }) =>
      approvedScopes.includes('manual-mappings'),
    );
    expect(fullReview).toMatchObject({ outcome: 'approved' });
    expect(fullReview?.reviewerAgentRun).toBe(c3ManualReviewUrl);
    expect(fullReview?.reviewedAt).toBe(c3ManualReviewedAt);
  });

  it('rejects missing, duplicate, and unexpected required mappings', () => {
    const artifacts = loadC3EvidenceArtifacts(repositoryRoot);
    const evidence = clone(c3CatalogEvidence) as C3CatalogEvidenceRecord[];
    const unexpected = clone(evidence);
    unexpected[0] = {
      ...unexpected[0],
      requirementId: 'unexpected-requirement',
    } as unknown as C3CatalogEvidenceRecord;

    expect(structureErrors(artifacts, evidence.slice(1))).not.toEqual([]);
    expect(
      structureErrors(artifacts, [...evidence, clone(evidence[0])]),
    ).not.toEqual([]);
    expect(structureErrors(artifacts, unexpected)).not.toEqual([]);
    expect(
      structureErrors(artifacts, evidence, [
        ...c3RequiredEvidenceMappings,
        c3RequiredEvidenceMappings[0],
      ]),
    ).not.toEqual([]);
  });

  it('rejects visual omission, duplication, unexpected files, hash drift, and dimension drift', () => {
    const { visualManifest } = loadC3EvidenceArtifacts(repositoryRoot);
    const scenarios = [
      (() => {
        const value = clone(visualManifest);
        value.baselines.pop();
        return value;
      })(),
      (() => {
        const value = clone(visualManifest);
        value.baselines.push(clone(value.baselines[0]));
        return value;
      })(),
      (() => {
        const value = clone(visualManifest);
        value.baselines[0].path = value.baselines[0].path.replace(
          /[^/]+$/,
          'catalog-unexpected.png',
        );
        return value;
      })(),
      (() => {
        const value = clone(visualManifest);
        value.baselines[0].sha256 = '0'.repeat(64);
        return value;
      })(),
      (() => {
        const value = clone(visualManifest);
        value.baselines[0].height += 1;
        return value;
      })(),
    ];

    for (const manifest of scenarios) {
      expect(validateC3VisualManifest(manifest, repositoryRoot)).not.toEqual(
        [],
      );
    }
  });

  it('rejects source-only, invented, and mismatched pass references', () => {
    const artifacts = loadC3EvidenceArtifacts(repositoryRoot);
    const evidence = clone(c3CatalogEvidence) as C3CatalogEvidenceRecord[];
    const passingIndex = evidence.findIndex(
      ({ evidence: record }) => record.status === 'pass',
    );
    if (passingIndex < 0 || evidence[passingIndex].evidence.status !== 'pass')
      throw new Error('Expected a passing evidence row.');

    for (const artifact of [
      'apps/e2e/tests/catalog-discovery.spec.ts#source-only-test-name',
      'apps/web/docs/catalog-discovery.md#manual-checklist',
      'apps/web/src/quality/evidence/c3-local-runs.json#invented-record',
    ]) {
      const mutated = clone(evidence);
      const record = mutated[passingIndex].evidence;
      if (record.status !== 'pass') throw new Error('Expected pass.');
      record.artifact = artifact;
      expect(bundleErrors(artifacts, mutated)).not.toEqual([]);
    }

    const mismatched = clone(evidence);
    const firstRunPass = mismatched.find(
      ({ evidence: record }) =>
        record.status === 'pass' && record.artifact.includes('c3-local-runs'),
    );
    const otherRunPass = mismatched.find(
      ({ evidence: record, id }) =>
        id !== firstRunPass?.id &&
        record.status === 'pass' &&
        record.artifact.includes('c3-local-runs'),
    );
    if (
      firstRunPass?.evidence.status !== 'pass' ||
      otherRunPass?.evidence.status !== 'pass'
    )
      throw new Error('Expected two run passes.');
    firstRunPass.evidence.artifact = otherRunPass.evidence.artifact;
    expect(bundleErrors(artifacts, mismatched)).not.toEqual([]);
  });

  it('rejects pending or failed parent runs even when a child record says pass', () => {
    const artifacts = loadC3EvidenceArtifacts(repositoryRoot);
    for (const outcome of ['pending', 'fail'] as const) {
      const mutated = clone(artifacts);
      const run = mutated.runManifest.runs[0];
      run.outcome = outcome;
      if (outcome === 'pending') {
        run.command = null;
        run.environment = null;
        run.startedAt = null;
        run.finishedAt = null;
        run.records = [];
      }
      expect(bundleErrors(mutated)).not.toEqual([]);
      expect(
        buildC3CatalogEvidence(mutated).some(
          ({ evidence }) => evidence.status === 'not-run',
        ),
      ).toBe(true);
    }
  });

  it('rejects invalid timestamps and reviewer traces', () => {
    const artifacts = loadC3EvidenceArtifacts(repositoryRoot);

    const badRun = clone(artifacts.runManifest);
    badRun.runs[0].startedAt = 'not-a-utc-timestamp';
    expect(validateC3RunManifest(badRun)).not.toEqual([]);

    const badVisual = clone(artifacts.visualManifest);
    badVisual.review.reviewerAgentRun = 'https://app.notion.com/p/unreviewed';
    expect(validateC3VisualManifest(badVisual, repositoryRoot)).not.toEqual([]);

    const badManual = clone(artifacts.manualReview);
    const completed = badManual.reviews.find(
      ({ id }) => id === 'c3-failed-review-visual-and-na',
    );
    if (!completed) throw new Error('Expected completed partial review.');
    completed.reviewedAt = 'not-a-utc-timestamp';
    expect(validateC3ManualReview(badManual)).not.toEqual([]);

    const badNa = clone(c3CatalogEvidence) as C3CatalogEvidenceRecord[];
    const notApplicable = badNa.find(
      ({ evidence }) => evidence.status === 'not-applicable',
    );
    if (notApplicable?.evidence.status !== 'not-applicable')
      throw new Error('Expected N/A evidence.');
    notApplicable.evidence.reviewerAgreementTrace =
      'https://app.notion.com/p/unreviewed';
    expect(bundleErrors(artifacts, badNa)).not.toEqual([]);
  });

  it('rejects run, visual, and manual mapping drift', () => {
    const artifacts = loadC3EvidenceArtifacts(repositoryRoot);

    const runDrift = clone(artifacts.runManifest);
    runDrift.runs[0].records[0].state = 'error';
    expect(validateC3RunManifest(runDrift)).not.toEqual([]);

    const visualDrift = clone(artifacts.visualManifest);
    visualDrift.evidenceSets[0].baselineIds.pop();
    expect(validateC3VisualManifest(visualDrift, repositoryRoot)).not.toEqual(
      [],
    );

    const manualDrift = clone(artifacts.manualReview);
    manualDrift.observations.push({
      channel: 'manual',
      check: 'responsive-layout',
      id: 'c3-manual-invented-without-approved-review',
      observation: 'Synthetic adversarial record.',
      requirementId: c3RequirementId,
      reviewId: 'c3-correction-manual-evidence-review',
      state: 'ready',
      status: 'approved',
    });
    expect(validateC3ManualReview(manualDrift)).not.toEqual([]);
  });
});
