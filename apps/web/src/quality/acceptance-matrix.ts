import type { BreakpointName } from '../design-system/tokens';

export const acceptanceCheckIds = [
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

export type AcceptanceCheckId = (typeof acceptanceCheckIds)[number];

export const evidenceChannels = [
  'vitest',
  'axe',
  'playwright',
  'visual',
  'manual',
] as const;

export type EvidenceChannel = (typeof evidenceChannels)[number];

export const evidenceStatuses = [
  'not-run',
  'pass',
  'fail',
  'blocked',
  'not-applicable',
] as const;

export type EvidenceStatus = (typeof evidenceStatuses)[number];

export const closureAcceptedEvidenceStatuses = [
  'pass',
  'not-applicable',
] as const satisfies readonly EvidenceStatus[];

interface EvidenceBase {
  channel: EvidenceChannel;
  note: string;
}

interface PassingEvidence extends EvidenceBase {
  artifact: string;
  checkedAt: string;
  status: 'pass';
}

interface NotApplicableEvidence extends EvidenceBase {
  artifact: string | null;
  checkedAt: string;
  reason: string;
  reviewerAgreementTrace: string;
  status: 'not-applicable';
}

interface NotRunEvidence extends EvidenceBase {
  artifact: null;
  checkedAt: null;
  status: 'not-run';
}

interface BlockedEvidence extends EvidenceBase {
  artifact: string | null;
  checkedAt: string | null;
  status: 'blocked';
}

interface FailedEvidence extends EvidenceBase {
  artifact: string | null;
  checkedAt: string | null;
  status: 'fail';
}

export type AcceptanceEvidence =
  | BlockedEvidence
  | FailedEvidence
  | NotApplicableEvidence
  | NotRunEvidence
  | PassingEvidence;

export type ClosureAcceptedEvidence = Extract<
  AcceptanceEvidence,
  { status: 'not-applicable' | 'pass' }
>;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidUtcIsoTimestamp(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
  ) {
    return false;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  const normalizedInput = value.includes('.')
    ? value
    : value.replace(/Z$/, '.000Z');

  return parsed.toISOString() === normalizedInput;
}

export function isClosureAcceptedEvidence(
  value: unknown,
): value is ClosureAcceptedEvidence {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const evidence = value as Record<string, unknown>;
  const hasValidBase =
    evidenceChannels.some((channel) => channel === evidence.channel) &&
    typeof evidence.note === 'string';

  if (!hasValidBase || !isValidUtcIsoTimestamp(evidence.checkedAt)) {
    return false;
  }

  if (evidence.status === 'pass') {
    return isNonEmptyString(evidence.artifact);
  }

  if (evidence.status === 'not-applicable') {
    return (
      (evidence.artifact === null || isNonEmptyString(evidence.artifact)) &&
      isNonEmptyString(evidence.reason) &&
      isNonEmptyString(evidence.reviewerAgreementTrace)
    );
  }

  return false;
}

interface ViewportProbe {
  boundary?: {
    breakpoint: BreakpointName;
    position: 'at' | 'before';
  };
  core: boolean;
  height: number;
  id: string;
  tier: 'canvas' | 'compact' | 'desktop' | 'mobile' | 'reflow' | 'tablet';
  visualBaseline: boolean;
  width: number;
}

export const viewportProbes: readonly ViewportProbe[] = [
  {
    id: 'reflow-320',
    tier: 'reflow',
    width: 320,
    height: 800,
    core: false,
    visualBaseline: false,
  },
  {
    id: 'compact-mobile-360',
    tier: 'mobile',
    width: 360,
    height: 800,
    core: true,
    visualBaseline: true,
  },
  {
    id: 'mobile-375',
    tier: 'mobile',
    width: 375,
    height: 812,
    core: false,
    visualBaseline: false,
  },
  {
    id: 'compact-before',
    tier: 'compact',
    width: 479,
    height: 900,
    core: false,
    visualBaseline: false,
    boundary: { breakpoint: 'compact', position: 'before' },
  },
  {
    id: 'compact-at',
    tier: 'compact',
    width: 480,
    height: 900,
    core: false,
    visualBaseline: false,
    boundary: { breakpoint: 'compact', position: 'at' },
  },
  {
    id: 'medium-before',
    tier: 'tablet',
    width: 767,
    height: 1024,
    core: false,
    visualBaseline: false,
    boundary: { breakpoint: 'medium', position: 'before' },
  },
  {
    id: 'tablet-768',
    tier: 'tablet',
    width: 768,
    height: 1024,
    core: true,
    visualBaseline: true,
    boundary: { breakpoint: 'medium', position: 'at' },
  },
  {
    id: 'wide-before',
    tier: 'desktop',
    width: 1023,
    height: 900,
    core: false,
    visualBaseline: false,
    boundary: { breakpoint: 'wide', position: 'before' },
  },
  {
    id: 'wide-at',
    tier: 'desktop',
    width: 1024,
    height: 900,
    core: false,
    visualBaseline: false,
    boundary: { breakpoint: 'wide', position: 'at' },
  },
  {
    id: 'desktop-1280',
    tier: 'desktop',
    width: 1280,
    height: 900,
    core: true,
    visualBaseline: true,
  },
  {
    id: 'canvas-before',
    tier: 'canvas',
    width: 1439,
    height: 900,
    core: false,
    visualBaseline: false,
    boundary: { breakpoint: 'canvas', position: 'before' },
  },
  {
    id: 'canvas-at',
    tier: 'canvas',
    width: 1440,
    height: 900,
    core: true,
    visualBaseline: true,
    boundary: { breakpoint: 'canvas', position: 'at' },
  },
];

export const wcag22AAThresholds = {
  conformanceTarget: 'WCAG 2.2 Level AA',
  contrastRatio: {
    largeText: 3,
    meaningfulNonText: 3,
    normalText: 4.5,
  },
  reflow: {
    equivalentZoomPercent: 400,
    viewportWidthCssPx: 320,
  },
  targetSize: {
    heightCssPx: 24,
    widthCssPx: 24,
  },
} as const;

export const qualityGates = {
  axe: {
    maximumCriticalViolations: 0,
    maximumSeriousViolations: 0,
  },
  errors: {
    associatedWithInvalidControl: true,
    colorOnlyAllowed: false,
    visibleTextRequired: true,
  },
  focus: {
    indicatorContrastRatio: 3,
    minimumIndicatorThicknessCssPx: 3,
    obscuredFocusedControlAllowed: false,
    wcagFloorIndicatorThicknessCssPx: 2,
  },
  overflow: {
    exemptTwoDimensionalContentRequiresDocumentedReason: true,
    maximumUnexpectedHorizontalOverflowCssPx: 1,
  },
  pointerTarget: {
    minimumHeightCssPx: 44,
    minimumWidthCssPx: 44,
    wcagFloorCssPx: 24,
  },
  reducedMotion: {
    maximumTokenDurationMs: 0,
    mediaQuery: '(prefers-reduced-motion: reduce)',
    scrollBehavior: 'auto',
  },
  visualRegression: {
    animations: 'disabled',
    caret: 'hide',
    maximumDiffPixelRatio: 0.01,
    perPixelThreshold: 0.2,
  },
} as const;

interface AcceptanceCheck {
  automatedBy: readonly EvidenceChannel[];
  id: AcceptanceCheckId;
  manualConfirmationRequired: boolean;
}

export const acceptanceChecks = [
  {
    id: 'responsive-layout',
    automatedBy: ['playwright', 'visual'],
    manualConfirmationRequired: true,
  },
  {
    id: 'keyboard-navigation',
    automatedBy: ['vitest', 'playwright'],
    manualConfirmationRequired: true,
  },
  {
    id: 'focus-visible',
    automatedBy: ['playwright', 'visual'],
    manualConfirmationRequired: true,
  },
  {
    id: 'names-and-labels',
    automatedBy: ['vitest', 'axe', 'playwright'],
    manualConfirmationRequired: true,
  },
  {
    id: 'contrast',
    automatedBy: ['axe'],
    manualConfirmationRequired: true,
  },
  {
    id: 'error-messaging',
    automatedBy: ['vitest', 'axe', 'playwright'],
    manualConfirmationRequired: true,
  },
  {
    id: 'reduced-motion',
    automatedBy: ['vitest', 'playwright'],
    manualConfirmationRequired: true,
  },
  {
    id: 'overflow-and-reflow',
    automatedBy: ['playwright', 'visual'],
    manualConfirmationRequired: true,
  },
  {
    id: 'route-announcement',
    automatedBy: ['playwright'],
    manualConfirmationRequired: true,
  },
] as const satisfies readonly AcceptanceCheck[];

type RouteResolution =
  | {
      pattern: `/${string}` | '/';
      status: 'confirmed';
    }
  | {
      decisionGate: string;
      pattern: null;
      status: 'unresolved';
    }
  | {
      pattern: null;
      status: 'shared-surface';
    };

interface RouteFamily {
  id: string;
  label: string;
  requiredChecks: readonly AcceptanceCheckId[];
  resolution: RouteResolution;
  states: readonly [string, ...string[]];
}

export const protectedRouteAccessStates = [
  'missing-session-redirect',
  'authenticated-forbidden',
] as const;

export const protectedRouteFamilyIds = [
  'account-profile',
  'account-orders',
  'admin-products',
  'admin-product-create',
  'admin-product-edit',
  'admin-dashboard',
] as const;

export const routeFamilies = [
  {
    id: 'storefront-shell',
    label: 'Shared storefront shell and navigation',
    resolution: { status: 'shared-surface', pattern: null },
    states: [
      'default',
      'mobile-navigation-open',
      'keyboard-navigation',
      'api-unavailable',
    ],
    requiredChecks: acceptanceCheckIds,
  },
  {
    id: 'catalog',
    label: 'Catalog and discovery',
    resolution: { status: 'confirmed', pattern: '/' },
    states: ['loading', 'ready', 'filtered', 'empty', 'error'],
    requiredChecks: acceptanceCheckIds,
  },
  {
    id: 'product-detail',
    label: 'Product detail, reviews and add to cart',
    resolution: { status: 'confirmed', pattern: '/product/[slug]' },
    states: [
      'loading',
      'ready-in-stock',
      'ready-out-of-stock',
      'not-found',
      'api-error',
      'reviews-empty',
      'reviews-populated',
      'review-validation-error',
      'add-to-cart-error',
    ],
    requiredChecks: acceptanceCheckIds,
  },
  {
    id: 'cart',
    label: 'Cart and required order form',
    resolution: { status: 'confirmed', pattern: '/cart' },
    states: [
      'empty',
      'populated',
      'quantity-validation-error',
      'api-error',
      'submitting-order',
    ],
    requiredChecks: acceptanceCheckIds,
  },
  {
    id: 'checkout',
    label: 'Checkout review and confirmation',
    resolution: { status: 'confirmed', pattern: '/checkout' },
    states: [
      'review',
      'submitting',
      'success',
      'validation-error',
      'order-error',
    ],
    requiredChecks: acceptanceCheckIds,
  },
  {
    id: 'auth-entry',
    label: 'Registration, sign in and sign out',
    resolution: {
      status: 'unresolved',
      pattern: null,
      decisionGate:
        'A0/A1C must confirm browser auth paths after auth ownership.',
    },
    states: [
      'sign-in',
      'register',
      'validation-error',
      'invalid-credentials',
      'session-expired',
      'google-unconfigured',
    ],
    requiredChecks: acceptanceCheckIds,
  },
  {
    id: 'auth-recovery',
    label: 'Account recovery',
    resolution: {
      status: 'unresolved',
      pattern: null,
      decisionGate: 'A3 must confirm recovery request and reset paths.',
    },
    states: [
      'request',
      'request-success',
      'reset',
      'invalid-or-expired-token',
      'validation-error',
    ],
    requiredChecks: acceptanceCheckIds,
  },
  {
    id: 'account-profile',
    label: 'Protected customer account and profile',
    resolution: { status: 'confirmed', pattern: '/account/[id]' },
    states: [
      'loading',
      'ready',
      'edit',
      'validation-error',
      ...protectedRouteAccessStates,
      'api-error',
    ],
    requiredChecks: acceptanceCheckIds,
  },
  {
    id: 'account-orders',
    label: 'Customer order history',
    resolution: {
      status: 'unresolved',
      pattern: null,
      decisionGate: 'A5 must confirm how order history maps under the account.',
    },
    states: [
      'loading',
      'populated',
      'empty',
      'pagination',
      ...protectedRouteAccessStates,
      'api-error',
    ],
    requiredChecks: acceptanceCheckIds,
  },
  {
    id: 'admin-products',
    label: 'Admin product list and search',
    resolution: { status: 'confirmed', pattern: '/admin/products' },
    states: [
      'loading',
      'populated',
      'search-empty',
      ...protectedRouteAccessStates,
      'api-error',
    ],
    requiredChecks: acceptanceCheckIds,
  },
  {
    id: 'admin-product-create',
    label: 'Admin product creation',
    resolution: {
      status: 'unresolved',
      pattern: null,
      decisionGate: 'M3 must confirm the create-product path.',
    },
    states: [
      'ready',
      'validation-error',
      'saving',
      'success',
      ...protectedRouteAccessStates,
      'api-error',
    ],
    requiredChecks: acceptanceCheckIds,
  },
  {
    id: 'admin-product-edit',
    label: 'Admin product edit, visibility and retirement',
    resolution: {
      status: 'unresolved',
      pattern: null,
      decisionGate: 'M4/M5 must confirm edit and retirement path behavior.',
    },
    states: [
      'loading',
      'ready',
      'validation-error',
      'saving',
      'visibility-updated',
      'retirement-blocked',
      'retired',
      ...protectedRouteAccessStates,
      'api-error',
    ],
    requiredChecks: acceptanceCheckIds,
  },
  {
    id: 'admin-dashboard',
    label: 'Optional admin dashboard',
    resolution: {
      status: 'unresolved',
      pattern: null,
      decisionGate: 'M6 is P2 and must confirm a path before implementation.',
    },
    states: [
      'loading',
      'ready',
      'empty',
      ...protectedRouteAccessStates,
      'api-error',
    ],
    requiredChecks: acceptanceCheckIds,
  },
] as const satisfies readonly RouteFamily[];

export const sliceMaintenanceRequirements = [
  'identify-affected-route-states',
  'resolve-path-only-from-approved-ticket',
  'update-contract-before-new-state',
  'add-fast-component-evidence',
  'add-axe-evidence-for-rendered-dom',
  'add-playwright-evidence-for-user-path',
  'add-responsive-and-visual-evidence',
  'record-manual-evidence',
  'record-blockers-and-not-applicable-reasons',
  'require-independent-closure-review',
] as const;
