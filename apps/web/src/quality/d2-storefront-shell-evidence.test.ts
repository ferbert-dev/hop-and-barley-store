import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { isClosureAcceptedEvidence } from './acceptance-matrix';
import {
  d2EvidenceReviewerUrl,
  d2RequiredEvidenceMappings,
  d2ShellEvidence,
  loadD2EvidenceArtifacts,
  validateD2EvidenceBundle,
  validateD2RunReport,
  validateD2VisualManifest,
} from './d2-storefront-shell-evidence';

const repositoryRoot = join(process.cwd(), '..', '..');

function clone<T>(value: T): T {
  return structuredClone(value);
}

describe('D2 storefront shell closure evidence', () => {
  it('accepts only explicit truthful records backed by durable artifacts', () => {
    const artifacts = loadD2EvidenceArtifacts(repositoryRoot);

    expect(
      d2ShellEvidence.every(({ evidence }) =>
        isClosureAcceptedEvidence(evidence),
      ),
    ).toBe(true);
    expect(
      validateD2EvidenceBundle({
        artifacts,
        evidence: d2ShellEvidence,
        repositoryRoot,
        requiredMappings: d2RequiredEvidenceMappings,
      }),
    ).toEqual([]);
    expect(
      d2ShellEvidence.some(({ evidence }) => evidence.status === 'pass'),
    ).toBe(true);
    expect(
      d2ShellEvidence.some(
        ({ evidence }) => evidence.status === 'not-applicable',
      ),
    ).toBe(true);
  });

  it('requires exact report record IDs rather than invented or source-only fragments', () => {
    const artifacts = loadD2EvidenceArtifacts(repositoryRoot);
    const passingIndex = d2ShellEvidence.findIndex(
      ({ evidence }) => evidence.status === 'pass',
    );
    const scenarios = [
      'apps/web/src/quality/evidence/d2-playwright-connected.json#invented-record',
      'apps/e2e/tests/storefront-shell.spec.ts#source-only-test-name',
      'apps/web/docs/storefront-shell.md#manual-acceptance-checklist',
      'apps/web/src/quality/evidence/d2-manual-review.json#manual-pending-native-browser-zoom',
    ];

    for (const artifact of scenarios) {
      const evidence = clone(d2ShellEvidence);
      const passing = evidence[passingIndex];
      if (passing.evidence.status !== 'pass') throw new Error('Expected pass');
      passing.evidence.artifact = artifact;

      expect(
        validateD2EvidenceBundle({
          artifacts,
          evidence,
          repositoryRoot,
          requiredMappings: d2RequiredEvidenceMappings,
        }),
      ).not.toEqual([]);
    }
  });

  it('recomputes all 11 approved PNG hashes and dimensions and rejects drift', () => {
    const artifacts = loadD2EvidenceArtifacts(repositoryRoot);
    const manifest = artifacts.visualManifest;
    const baselineDirectory = join(
      repositoryRoot,
      'apps/e2e/tests/__screenshots__/storefront-shell.spec.ts',
    );
    const onDiskBaselines = readdirSync(baselineDirectory)
      .filter((filename) => filename.endsWith('.png'))
      .sort();

    expect(manifest.baselines).toHaveLength(11);
    expect(
      manifest.baselines.map(({ path }) => path.split('/').at(-1)).sort(),
    ).toEqual(onDiskBaselines);
    expect(validateD2VisualManifest(manifest, repositoryRoot)).toEqual([]);

    const missing = clone(manifest);
    missing.baselines.pop();
    expect(validateD2VisualManifest(missing, repositoryRoot)).not.toEqual([]);

    const hashDrift = clone(manifest);
    hashDrift.baselines[0].sha256 = '0'.repeat(64);
    expect(validateD2VisualManifest(hashDrift, repositoryRoot)).not.toEqual([]);

    const dimensionDrift = clone(manifest);
    dimensionDrift.baselines[0].width += 1;
    expect(
      validateD2VisualManifest(dimensionDrift, repositoryRoot),
    ).not.toEqual([]);
  });

  it('requires exact connected and unavailable run metadata and valid UTC times', () => {
    const artifacts = loadD2EvidenceArtifacts(repositoryRoot);
    const expectedBrowserTitles = [
      'home.spec.ts › shows the configured Hop & Barley stack status',
      'storefront-shell.spec.ts › supports the mobile disclosure with keyboard-only navigation',
      'storefront-shell.spec.ts › closes the inline disclosure when crossing the wide breakpoint',
      'storefront-shell.spec.ts › does not reopen the disclosure after cart navigation and browser Back',
      'storefront-shell.spec.ts › has no unexpected horizontal overflow at every Q1 viewport probe',
      'storefront-shell.spec.ts › matches approved shell visual baselines at every Q1 core viewport',
      'storefront-shell.spec.ts › matches mobile open-menu and visible-focus baselines',
      'storefront-shell.spec.ts › honours the reduced-motion contract',
      'storefront-shell.spec.ts › has no critical or serious axe violations in closed and open shell states',
      'storefront-shell.spec.ts › renders the configured API availability state without changing the shell',
    ];

    expect(artifacts.runReports.map(({ mode }) => mode).sort()).toEqual([
      'api-connected',
      'api-unavailable',
      'unit',
    ]);
    for (const report of artifacts.runReports) {
      expect(validateD2RunReport(report)).toEqual([]);
      expect(report.environment).toEqual({ node: 'v24.5.0', pnpm: '11.21.0' });
      expect(report.command).not.toBe('');
      expect(report.records.every(({ outcome }) => outcome === 'pass')).toBe(
        true,
      );
      if (report.mode !== 'unit') {
        expect(report.records).toHaveLength(10);
        expect(report.records.map(({ title }) => title)).toEqual(
          expectedBrowserTitles,
        );
        expect(report.command).toContain(
          `E2E_EXPECT_API_STATUS='${
            report.mode === 'api-connected'
              ? 'API connected'
              : 'API unavailable'
          }'`,
        );
      }
    }

    const invalidTimestamp = clone(artifacts.runReports[0]);
    invalidTimestamp.finishedAt = 'not-a-utc-timestamp';
    expect(validateD2RunReport(invalidTimestamp)).not.toEqual([]);
  });

  it('rejects unreviewed N/A records', () => {
    const artifacts = loadD2EvidenceArtifacts(repositoryRoot);
    const evidence = clone(d2ShellEvidence);
    const notApplicable = evidence.find(
      ({ evidence: record }) => record.status === 'not-applicable',
    );
    if (!notApplicable || notApplicable.evidence.status !== 'not-applicable') {
      throw new Error('Expected an N/A record');
    }

    expect(notApplicable.evidence.artifact).toBeNull();
    expect(notApplicable.evidence.reviewerAgreementTrace).toBe(
      d2EvidenceReviewerUrl,
    );
    notApplicable.evidence.reviewerAgreementTrace =
      'https://app.notion.com/p/unreviewed';

    expect(
      validateD2EvidenceBundle({
        artifacts,
        evidence,
        repositoryRoot,
        requiredMappings: d2RequiredEvidenceMappings,
      }),
    ).not.toEqual([]);
  });

  it('rejects duplicate and missing required state/check/channel mappings', () => {
    const artifacts = loadD2EvidenceArtifacts(repositoryRoot);
    const duplicate = [...clone(d2ShellEvidence), clone(d2ShellEvidence[0])];
    const missing = clone(d2ShellEvidence).slice(1);

    for (const evidence of [duplicate, missing]) {
      expect(
        validateD2EvidenceBundle({
          artifacts,
          evidence,
          repositoryRoot,
          requiredMappings: d2RequiredEvidenceMappings,
        }),
      ).not.toEqual([]);
    }
  });

  it('keeps reviewed observations separate from remaining manual work', () => {
    const { manualReview } = loadD2EvidenceArtifacts(repositoryRoot);

    expect(manualReview.reviewerAgentRun).toBe(d2EvidenceReviewerUrl);
    expect(manualReview.overallOutcome).toBe('failed-evidence-only');
    expect(manualReview.approvedObservations).not.toHaveLength(0);
    expect(
      manualReview.approvedObservations.every(
        ({ status }) => status === 'approved',
      ),
    ).toBe(true);
    expect(manualReview.correctionObservations).not.toHaveLength(0);
    expect(
      manualReview.correctionObservations.every(
        ({ status }) => status === 'approved',
      ),
    ).toBe(true);
    expect(manualReview.remainingObservations).not.toHaveLength(0);
    expect(
      manualReview.remainingObservations.every(
        ({ status }) => status === 'not-reviewed',
      ),
    ).toBe(true);
    for (const { id } of manualReview.remainingObservations) {
      expect(
        d2ShellEvidence.some(
          ({ evidence }) =>
            evidence.status === 'pass' && evidence.artifact.endsWith(`#${id}`),
        ),
      ).toBe(false);
    }
  });

  it('does not regenerate a blanket cartesian pass ledger', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/quality/d2-storefront-shell-evidence.ts'),
      'utf8',
    );
    const explicitLedgerSource = source.slice(
      source.indexOf('export const d2ShellEvidence'),
      source.indexOf('export const d2RequiredEvidenceMappings'),
    );

    expect(d2RequiredEvidenceMappings).toHaveLength(108);
    expect(d2ShellEvidence).toHaveLength(108);
    expect(explicitLedgerSource).not.toContain('.map(');
    expect(explicitLedgerSource).not.toContain('.flatMap(');
    expect(new Set(d2ShellEvidence.map(({ id }) => id)).size).toBe(
      d2ShellEvidence.length,
    );
  });
});
