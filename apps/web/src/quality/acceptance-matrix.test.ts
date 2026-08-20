import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { breakpoints } from '../design-system/tokens';
import {
  type AcceptanceEvidence,
  acceptanceCheckIds,
  acceptanceChecks,
  closureAcceptedEvidenceStatuses,
  evidenceChannels,
  evidenceStatuses,
  isClosureAcceptedEvidence,
  protectedRouteAccessStates,
  protectedRouteFamilyIds,
  qualityGates,
  routeFamilies,
  sliceMaintenanceRequirements,
  viewportProbes,
  wcag22AAThresholds,
} from './acceptance-matrix';

const expectedRouteFamilyIds = [
  'storefront-shell',
  'catalog',
  'product-detail',
  'cart',
  'checkout',
  'auth-entry',
  'auth-recovery',
  'account-profile',
  'account-orders',
  'admin-products',
  'admin-product-create',
  'admin-product-edit',
  'admin-dashboard',
] as const;

const expectedAcceptanceCheckIds = [
  'responsive-layout',
  'keyboard-navigation',
  'focus-visible',
  'names-and-labels',
  'contrast',
  'error-messaging',
  'reduced-motion',
  'overflow-and-reflow',
  'route-announcement',
] as const;

const tokenCssPath = resolve(process.cwd(), 'src/styles/design-tokens.css');

describe('quality acceptance matrix', () => {
  it('probes every D1 breakpoint immediately before and at its boundary', () => {
    for (const [breakpoint, width] of Object.entries(breakpoints)) {
      const boundaryProbes = viewportProbes.filter(
        (probe) => probe.boundary?.breakpoint === breakpoint,
      );

      expect(boundaryProbes).toHaveLength(2);
      expect(
        boundaryProbes.find((probe) => probe.boundary?.position === 'before')
          ?.width,
      ).toBe(width - 1);
      expect(
        boundaryProbes.find((probe) => probe.boundary?.position === 'at')
          ?.width,
      ).toBe(width);
    }

    expect(
      viewportProbes.filter((probe) => probe.core).map(({ width }) => width),
    ).toEqual([360, 768, 1280, 1440]);
    expect(viewportProbes.find(({ id }) => id === 'reflow-320')).toMatchObject({
      height: 800,
      width: 320,
    });
    expect(
      viewportProbes.find(({ id }) => id === 'compact-mobile-360'),
    ).toMatchObject({ height: 800, width: 360 });
  });

  it('keeps every planned route family, state and quality dimension explicit', () => {
    expect(routeFamilies.map(({ id }) => id)).toEqual(expectedRouteFamilyIds);
    expect(acceptanceCheckIds).toEqual(expectedAcceptanceCheckIds);
    expect(acceptanceChecks.map(({ id }) => id)).toEqual(
      expectedAcceptanceCheckIds,
    );

    for (const family of routeFamilies) {
      expect(new Set(family.states).size).toBe(family.states.length);
      expect(family.states.length).toBeGreaterThan(0);
      expect(family.requiredChecks).toEqual(expectedAcceptanceCheckIds);
    }
  });

  it('pins confirmed paths and does not invent unresolved auth or admin paths', () => {
    const confirmed = Object.fromEntries(
      routeFamilies
        .filter(({ resolution }) => resolution.status === 'confirmed')
        .map(({ id, resolution }) => [id, resolution.pattern]),
    );

    expect(confirmed).toEqual({
      catalog: '/',
      'product-detail': '/product/[slug]',
      cart: '/cart',
      checkout: '/checkout',
      'account-profile': '/account/[id]',
      'admin-products': '/admin/products',
    });

    for (const family of routeFamilies) {
      if (family.resolution.status !== 'unresolved') {
        continue;
      }

      expect(family.resolution.pattern).toBeNull();
      expect(family.resolution.decisionGate.length).toBeGreaterThan(0);
    }
  });

  it('separates missing sessions from authenticated forbidden access', () => {
    const accountAndAdminFamilyIds = routeFamilies
      .filter(({ id }) => id.startsWith('account-') || id.startsWith('admin-'))
      .map(({ id }) => id);

    expect(protectedRouteFamilyIds).toEqual(accountAndAdminFamilyIds);

    for (const familyId of protectedRouteFamilyIds) {
      const family = routeFamilies.find(({ id }) => id === familyId);

      expect(family).toBeDefined();
      expect(family?.states).toEqual(
        expect.arrayContaining([...protectedRouteAccessStates]),
      );
      expect(family?.states).not.toContain('forbidden-or-redirect');
      expect(family?.states).not.toContain('forbidden');
      expect(family?.states).not.toContain('unauthorized');
    }
  });

  it('pins WCAG, overflow, axe and focus thresholds', () => {
    expect(wcag22AAThresholds).toEqual({
      conformanceTarget: 'WCAG 2.2 Level AA',
      contrastRatio: {
        largeText: 3,
        meaningfulNonText: 3,
        normalText: 4.5,
      },
      reflow: { equivalentZoomPercent: 400, viewportWidthCssPx: 320 },
      targetSize: { heightCssPx: 24, widthCssPx: 24 },
    });
    expect(qualityGates.axe).toEqual({
      maximumCriticalViolations: 0,
      maximumSeriousViolations: 0,
    });
    expect(qualityGates.focus).toEqual({
      indicatorContrastRatio: 3,
      minimumIndicatorThicknessCssPx: 3,
      obscuredFocusedControlAllowed: false,
      wcagFloorIndicatorThicknessCssPx: 2,
    });
    expect(qualityGates.overflow).toEqual({
      exemptTwoDimensionalContentRequiresDocumentedReason: true,
      maximumUnexpectedHorizontalOverflowCssPx: 1,
    });
    expect(qualityGates.pointerTarget).toEqual({
      minimumHeightCssPx: 44,
      minimumWidthCssPx: 44,
      wcagFloorCssPx: 24,
    });
  });

  it('aligns the reduced-motion gate with the accepted D1 CSS', () => {
    const css = readFileSync(tokenCssPath, 'utf8');

    expect(qualityGates.reducedMotion).toEqual({
      maximumTokenDurationMs: 0,
      mediaQuery: '(prefers-reduced-motion: reduce)',
      scrollBehavior: 'auto',
    });
    expect(css).toContain(`@media ${qualityGates.reducedMotion.mediaQuery}`);
    expect(css).toMatch(/--hb-duration-fast:\s*0ms/);
    expect(css).toMatch(/--hb-duration-normal:\s*0ms/);
    expect(css).toMatch(/html\s*{\s*scroll-behavior:\s*auto/);
  });

  it('keeps evidence and per-slice maintenance fail-closed', () => {
    expect(evidenceChannels).toEqual(['vitest', 'axe', 'playwright', 'manual']);
    expect(evidenceStatuses).toEqual([
      'not-run',
      'pass',
      'fail',
      'blocked',
      'not-applicable',
    ]);
    expect(closureAcceptedEvidenceStatuses).toEqual(['pass', 'not-applicable']);
    expect(sliceMaintenanceRequirements).toEqual([
      'identify-affected-route-states',
      'resolve-path-only-from-approved-ticket',
      'update-contract-before-new-state',
      'add-fast-component-evidence',
      'add-axe-evidence-for-rendered-dom',
      'add-playwright-evidence-for-user-path',
      'add-responsive-browser-evidence',
      'record-manual-evidence',
      'record-blockers-and-not-applicable-reasons',
      'require-independent-closure-review',
    ]);

    for (const check of acceptanceChecks) {
      expect(check.automatedBy.length).toBeGreaterThan(0);
      expect(check.manualConfirmationRequired).toBe(true);
    }
  });

  it('accepts only evidenced passes and reviewer-approved exclusions', () => {
    const passingEvidence: AcceptanceEvidence = {
      artifact: 'test-results/catalog-keyboard.xml',
      channel: 'playwright',
      checkedAt: '2026-08-14T17:45:00.000Z',
      note: 'Catalog keyboard path at the compact viewport.',
      status: 'pass',
    };
    const notApplicableEvidence: AcceptanceEvidence = {
      artifact: null,
      channel: 'manual',
      checkedAt: '2026-08-14T17:46:00Z',
      note: 'No form exists in this read-only state.',
      reason: 'Error-message checks do not apply to this read-only state.',
      reviewerAgreementTrace: 'review://q1/catalog-ready/error-messaging',
      status: 'not-applicable',
    };
    const notApplicableWithArtifact: AcceptanceEvidence = {
      artifact: 'reviews/q1/catalog-ready.md',
      channel: 'manual',
      checkedAt: '2026-08-14T17:47:00Z',
      note: 'Reviewer documented why the check does not apply.',
      reason: 'The state has no form or mutable control.',
      reviewerAgreementTrace: 'review://q1/catalog-ready/form-errors',
      status: 'not-applicable',
    };

    expect(isClosureAcceptedEvidence(passingEvidence)).toBe(true);
    expect(isClosureAcceptedEvidence(notApplicableEvidence)).toBe(true);
    expect(isClosureAcceptedEvidence(notApplicableWithArtifact)).toBe(true);
  });

  it.each([
    {
      artifact: null,
      channel: 'vitest',
      checkedAt: '2026-08-14T17:45:00Z',
      note: '',
      status: 'pass',
    },
    {
      artifact: '   ',
      channel: 'vitest',
      checkedAt: '2026-08-14T17:45:00Z',
      note: '',
      status: 'pass',
    },
    {
      artifact: 'test-results/unit.xml',
      channel: 'vitest',
      checkedAt: 'not-a-timestamp',
      note: '',
      status: 'pass',
    },
    {
      artifact: null,
      channel: 'manual',
      checkedAt: '2026-08-14T17:45:00Z',
      note: '',
      reason: ' ',
      reviewerAgreementTrace: 'review://q1/trace',
      status: 'not-applicable',
    },
    {
      artifact: 42,
      channel: 'manual',
      checkedAt: '2026-08-14T17:45:00Z',
      note: '',
      reason: 'This check cannot apply.',
      reviewerAgreementTrace: 'review://q1/trace',
      status: 'not-applicable',
    },
    {
      channel: 'manual',
      checkedAt: '2026-08-14T17:45:00Z',
      note: '',
      reason: 'This check cannot apply.',
      reviewerAgreementTrace: 'review://q1/trace',
      status: 'not-applicable',
    },
    {
      artifact: { path: 'reviews/q1.md' },
      channel: 'manual',
      checkedAt: '2026-08-14T17:45:00Z',
      note: '',
      reason: 'This check cannot apply.',
      reviewerAgreementTrace: 'review://q1/trace',
      status: 'not-applicable',
    },
    {
      artifact: '   ',
      channel: 'manual',
      checkedAt: '2026-08-14T17:45:00Z',
      note: '',
      reason: 'This check cannot apply.',
      reviewerAgreementTrace: 'review://q1/trace',
      status: 'not-applicable',
    },
    {
      artifact: null,
      channel: 'manual',
      checkedAt: '2026-08-14T17:45:00Z',
      note: '',
      reason: 'This check cannot apply.',
      reviewerAgreementTrace: '',
      status: 'not-applicable',
    },
    {
      artifact: null,
      channel: 'manual',
      checkedAt: 'invalid',
      note: '',
      reason: 'This check cannot apply.',
      reviewerAgreementTrace: 'review://q1/trace',
      status: 'not-applicable',
    },
    {
      artifact: null,
      channel: 'manual',
      checkedAt: null,
      note: '',
      status: 'not-run',
    },
    {
      artifact: 'test-results/failure.xml',
      channel: 'playwright',
      checkedAt: '2026-08-14T17:45:00Z',
      note: 'Assertion failed.',
      status: 'fail',
    },
    {
      artifact: null,
      channel: 'manual',
      checkedAt: null,
      note: 'Awaiting screen-reader review.',
      status: 'blocked',
    },
  ])('rejects non-closing or malformed evidence %#', (evidence) => {
    expect(isClosureAcceptedEvidence(evidence)).toBe(false);
  });
});
