import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  acceptanceChecks,
  isClosureAcceptedEvidence,
} from './acceptance-matrix';
import {
  c3CatalogEvidence,
  c3CatalogStates,
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
  evidence: readonly C3CatalogEvidenceRecord[] = c3CatalogEvidence,
  requiredMappings: readonly C3EvidenceMapping[] = c3RequiredEvidenceMappings,
) {
  return validateC3EvidenceStructure({
    artifacts,
    evidence,
    repositoryRoot,
    requiredMappings,
  });
}

describe('C3 catalog evidence scaffold', () => {
  it('pins an independently derived exact set of 135 Q1 mappings', () => {
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

  it('validates the current artifact schemas but keeps closure fail-closed', () => {
    const artifacts = loadC3EvidenceArtifacts(repositoryRoot);

    expect(structureErrors(artifacts)).toEqual([]);
    expect(
      c3CatalogEvidence.every(
        ({ evidence }) =>
          evidence.status === 'not-run' && !isClosureAcceptedEvidence(evidence),
      ),
    ).toBe(true);
    expect(artifacts.runManifest.runs.map(({ outcome }) => outcome)).toEqual([
      'pending',
      'pending',
      'pending',
    ]);
    expect(artifacts.manualReview).toMatchObject({
      outcome: 'pending',
      reviewedAt: null,
      reviewerAgentRun: null,
    });
    expect(artifacts.visualManifest.review).toEqual({
      outcome: 'pending',
      reviewedAt: null,
      reviewerAgentRun: null,
    });

    const closureErrors = validateC3EvidenceBundle({
      artifacts,
      evidence: c3CatalogEvidence,
      repositoryRoot,
      requiredMappings: c3RequiredEvidenceMappings,
    });
    expect(closureErrors).toHaveLength(137);
    expect(closureErrors).toContain(
      'C3 independent manual closure review is still pending.',
    );
    expect(closureErrors).toContain('C3 visual review is still pending.');
  });

  it('requires exact equality for missing, duplicate, and unexpected mappings', () => {
    const artifacts = loadC3EvidenceArtifacts(repositoryRoot);
    const evidence = clone(c3CatalogEvidence) as C3CatalogEvidenceRecord[];
    const duplicate = [...evidence, clone(evidence[0])];
    const unexpected = clone(evidence);
    unexpected[0] = {
      ...unexpected[0],
      requirementId: 'unexpected-requirement',
    } as unknown as C3CatalogEvidenceRecord;

    expect(structureErrors(artifacts, evidence.slice(1))).not.toEqual([]);
    expect(structureErrors(artifacts, duplicate)).not.toEqual([]);
    expect(structureErrors(artifacts, unexpected)).not.toEqual([]);

    const duplicatedRequired = [
      ...c3RequiredEvidenceMappings,
      c3RequiredEvidenceMappings[0],
    ];
    expect(
      structureErrors(artifacts, c3CatalogEvidence, duplicatedRequired),
    ).not.toEqual([]);
  });

  it('recomputes the exact 20 core and four focus PNG baselines', () => {
    const { visualManifest } = loadC3EvidenceArtifacts(repositoryRoot);
    const onDisk = readdirSync(
      join(
        repositoryRoot,
        'apps/e2e/tests/__screenshots__/catalog-discovery.spec.ts',
      ),
    )
      .filter((filename) => filename.endsWith('.png'))
      .sort();

    expect(visualManifest.baselines).toHaveLength(24);
    expect(
      visualManifest.baselines.filter(({ kind }) => kind === 'core-state'),
    ).toHaveLength(20);
    expect(
      visualManifest.baselines.filter(({ kind }) => kind === 'focus'),
    ).toHaveLength(4);
    expect(
      visualManifest.baselines.map(({ path }) => path.split('/').at(-1)).sort(),
    ).toEqual(onDisk);
    expect(validateC3VisualManifest(visualManifest, repositoryRoot)).toEqual(
      [],
    );
  });

  it('rejects missing, duplicate, unexpected, hash-drifted, and dimension-drifted PNGs', () => {
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
          'catalog-loading-360.png',
          'catalog-unexpected-360.png',
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

  it('rejects invented and source-only pass artifacts', () => {
    const artifacts = loadC3EvidenceArtifacts(repositoryRoot);
    const scenarios = [
      'apps/e2e/tests/catalog-discovery.spec.ts#source-only-test-name',
      'apps/web/docs/catalog-discovery.md#manual-checklist',
      'apps/web/src/quality/evidence/c3-local-runs.json#invented-record',
    ];

    for (const artifact of scenarios) {
      const evidence = clone(c3CatalogEvidence) as C3CatalogEvidenceRecord[];
      evidence[0].evidence = {
        artifact,
        channel: evidence[0].channel,
        checkedAt: '2026-08-15T02:55:00Z',
        note: 'Mutation fixture; this is not current project evidence.',
        status: 'pass',
      };
      const errors = validateC3EvidenceBundle({
        artifacts,
        evidence,
        repositoryRoot,
        requiredMappings: c3RequiredEvidenceMappings,
      });

      expect(
        errors.some(
          (error) =>
            error.includes('does not reference a durable C3 JSON record') ||
            error.includes('references an unknown or mismatched record'),
        ),
      ).toBe(true);
    }
  });

  it('does not let a pending or failed run back a passing mapping', () => {
    const artifacts = loadC3EvidenceArtifacts(repositoryRoot);
    const failedRun = artifacts.runManifest.runs[0];
    Object.assign(failedRun, {
      command: 'pnpm --filter @hop-and-barley/web test:unit',
      environment: { node: 'v24.19.0', pnpm: '11.21.0' },
      finishedAt: '2026-08-15T00:55:01Z',
      outcome: 'fail',
      records: [
        {
          channels: ['playwright'],
          checks: ['responsive-layout'],
          id: 'failed-record',
          outcome: 'pass',
          states: ['loading'],
          title: 'A partial record cannot upgrade its failed parent run.',
        },
      ],
      startedAt: '2026-08-15T00:55:00Z',
    });
    const evidence = clone(c3CatalogEvidence) as C3CatalogEvidenceRecord[];
    evidence[0].evidence = {
      artifact:
        'apps/web/src/quality/evidence/c3-local-runs.json#failed-record',
      channel: evidence[0].channel,
      checkedAt: '2026-08-15T00:55:01Z',
      note: 'Mutation fixture; failed runs never close evidence.',
      status: 'pass',
    };

    expect(validateC3RunManifest(artifacts.runManifest)).toEqual([]);
    expect(
      validateC3EvidenceBundle({
        artifacts,
        evidence,
        repositoryRoot,
        requiredMappings: c3RequiredEvidenceMappings,
      }),
    ).toContain(
      `C3 evidence ${evidence[0].id} references an unknown or mismatched record.`,
    );
  });

  it('rejects bad run and review timestamps without upgrading pending work', () => {
    const artifacts = loadC3EvidenceArtifacts(repositoryRoot);
    const runManifest = clone(artifacts.runManifest);
    Object.assign(runManifest.runs[0], {
      command: 'pnpm test:unit',
      environment: { node: 'v24.19.0', pnpm: '11.21.0' },
      finishedAt: '2026-08-15T02:55:00Z',
      outcome: 'pass',
      records: [
        {
          channels: ['vitest'],
          checks: ['names-and-labels'],
          id: 'unit-fixture',
          outcome: 'pass',
          states: ['ready'],
          title: 'Fixture only',
        },
      ],
      startedAt: 'not-a-utc-timestamp',
    });
    expect(validateC3RunManifest(runManifest)).not.toEqual([]);

    const review = clone(artifacts.manualReview);
    Object.assign(review, {
      outcome: 'approved',
      reviewedAt: 'not-a-utc-timestamp',
      reviewerAgentRun: 'https://app.notion.com/p/reviewer',
    });
    expect(validateC3ManualReview(review)).not.toEqual([]);
  });
});
