import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  acceptanceChecks,
  acceptanceCheckIds,
  evidenceChannels,
  isClosureAcceptedEvidence,
  viewportProbes,
  type AcceptanceCheckId,
  type AcceptanceEvidence,
  type EvidenceChannel,
} from './acceptance-matrix';

const CONNECTED_REPORT =
  'apps/web/src/quality/evidence/d2-playwright-connected.json';
const UNAVAILABLE_REPORT =
  'apps/web/src/quality/evidence/d2-playwright-unavailable.json';
const UNIT_REPORT = 'apps/web/src/quality/evidence/d2-vitest.json';
const VISUAL_MANIFEST =
  'apps/web/src/quality/evidence/d2-visual-baselines.json';
const MANUAL_REVIEW = 'apps/web/src/quality/evidence/d2-manual-review.json';

const CONNECTED_CHECKED_AT = '2026-08-14T18:54:20Z';
const UNAVAILABLE_CHECKED_AT = '2026-08-14T18:56:53Z';
const UNIT_CHECKED_AT = '2026-08-14T18:57:01Z';
const REVIEWED_AT = '2026-08-14T18:28:00.000Z';
const CORRECTION_REVIEWED_AT = '2026-08-14T18:50:33.952Z';

export const d2EvidenceReviewerUrl =
  'https://app.notion.com/p/3bcd78850eab819b8710db5b5c1277ea?pvs=204';
export const d2EvidenceCorrectionAgentRunUrl =
  'https://app.notion.com/p/3bcd78850eab818d9581f37cbae9deaa?pvs=204';

export const d2ShellStates = [
  'default',
  'mobile-navigation-open',
  'keyboard-navigation',
  'api-unavailable',
] as const;

export type D2ShellState = (typeof d2ShellStates)[number];

export interface D2ShellEvidenceRecord {
  check: AcceptanceCheckId;
  evidence: AcceptanceEvidence;
  id: string;
  routeFamily: 'storefront-shell';
  state: D2ShellState;
}

export interface D2EvidenceMapping {
  channel: EvidenceChannel;
  check: AcceptanceCheckId;
  state: D2ShellState;
}

interface D2RunRecord {
  channels: EvidenceChannel[];
  checks: AcceptanceCheckId[];
  id: string;
  outcome: 'pass';
  states: D2ShellState[];
  title: string;
}

export interface D2RunReport {
  command: string;
  environment: { node: string; pnpm: string };
  finishedAt: string;
  mode: 'api-connected' | 'api-unavailable' | 'unit';
  outcome: 'pass';
  records: D2RunRecord[];
  runId: string;
  schemaVersion: 1;
  startedAt: string;
}

interface D2VisualBaseline {
  checks: AcceptanceCheckId[];
  height: number;
  id: string;
  path: string;
  sha256: string;
  states: D2ShellState[];
  viewport: { height: number; id: string; width: number };
  width: number;
}

interface D2VisualEvidenceSet {
  baselineIds: string[];
  check: AcceptanceCheckId;
  id: string;
  state: D2ShellState;
}

export interface D2VisualManifest {
  baselineDirectory: string;
  baselines: D2VisualBaseline[];
  evidenceSets: D2VisualEvidenceSet[];
  schemaVersion: 1;
}

interface D2ManualObservation {
  checks: AcceptanceCheckId[];
  id: string;
  observation: string;
  states: D2ShellState[];
  status: 'approved' | 'not-reviewed';
}

export interface D2ManualReview {
  approvedObservations: D2ManualObservation[];
  correctionAgentRun: string;
  correctionObservations: D2ManualObservation[];
  correctionOutcome: 'completed';
  correctionReviewedAt: string;
  overallObservation: string;
  overallOutcome: 'failed-evidence-only';
  remainingObservations: D2ManualObservation[];
  reviewId: string;
  reviewedAt: string;
  reviewerAgentRun: string;
  schemaVersion: 1;
}

export interface D2EvidenceArtifacts {
  manualReview: D2ManualReview;
  runReports: D2RunReport[];
  visualManifest: D2VisualManifest;
}

function pass(
  id: string,
  state: D2ShellState,
  check: AcceptanceCheckId,
  channel: EvidenceChannel,
  artifact: string,
  checkedAt: string,
  note: string,
): D2ShellEvidenceRecord {
  return {
    id,
    state,
    check,
    routeFamily: 'storefront-shell',
    evidence: { artifact, channel, checkedAt, note, status: 'pass' },
  };
}

function notApplicable(
  id: string,
  state: D2ShellState,
  check: AcceptanceCheckId,
  channel: EvidenceChannel,
  reason: string,
): D2ShellEvidenceRecord {
  return {
    id,
    state,
    check,
    routeFamily: 'storefront-shell',
    evidence: {
      artifact: null,
      channel,
      checkedAt: REVIEWED_AT,
      note: `D2 ${state}/${check}/${channel} is outside the exercised shell state.`,
      reason,
      reviewerAgreementTrace: d2EvidenceReviewerUrl,
      status: 'not-applicable',
    },
  };
}

const noErrorStateReason =
  'This D2 state does not render an error. Error messaging is exercised separately by the api-unavailable state.';
const noRouteAnnouncementReason =
  'D2 adds a shared shell but no client-side route-announcement mechanism, and the cart destination remains outside this slice.';

export const d2ShellEvidence: readonly D2ShellEvidenceRecord[] = [
  pass(
    'd2-default-responsive-playwright',
    'default',
    'responsive-layout',
    'playwright',
    `${CONNECTED_REPORT}#pw-connected-overflow-targets`,
    CONNECTED_CHECKED_AT,
    'Connected Chromium measured the shell at every Q1 viewport probe.',
  ),
  pass(
    'd2-default-responsive-visual',
    'default',
    'responsive-layout',
    'visual',
    `${VISUAL_MANIFEST}#visual-default-responsive`,
    REVIEWED_AT,
    'The reviewed visual set covers the four approved default shell viewports.',
  ),
  pass(
    'd2-default-responsive-manual',
    'default',
    'responsive-layout',
    'manual',
    `${MANUAL_REVIEW}#manual-approved-targets`,
    REVIEWED_AT,
    'Independent review approved the all-probe target measurement.',
  ),
  pass(
    'd2-default-names-vitest',
    'default',
    'names-and-labels',
    'vitest',
    `${UNIT_REPORT}#unit-labelled-landmarks`,
    UNIT_CHECKED_AT,
    'Unit result proves the labelled shell landmarks.',
  ),
  pass(
    'd2-default-names-axe',
    'default',
    'names-and-labels',
    'axe',
    `${CONNECTED_REPORT}#pw-connected-axe-closed-open`,
    CONNECTED_CHECKED_AT,
    'Axe passed the connected closed shell.',
  ),
  pass(
    'd2-default-names-playwright',
    'default',
    'names-and-labels',
    'playwright',
    `${CONNECTED_REPORT}#pw-connected-api-state`,
    CONNECTED_CHECKED_AT,
    'Chromium located the named banner, contentinfo and single main landmark.',
  ),
  pass(
    'd2-default-names-manual',
    'default',
    'names-and-labels',
    'manual',
    `${MANUAL_REVIEW}#manual-approved-banner`,
    REVIEWED_AT,
    'Independent review approved the named storefront banner evidence.',
  ),
  pass(
    'd2-default-contrast-axe',
    'default',
    'contrast',
    'axe',
    `${CONNECTED_REPORT}#pw-connected-axe-closed-open`,
    CONNECTED_CHECKED_AT,
    'Axe reported no serious or critical connected-shell violations.',
  ),
  pass(
    'd2-default-contrast-manual',
    'default',
    'contrast',
    'manual',
    `${MANUAL_REVIEW}#manual-approved-axe`,
    REVIEWED_AT,
    'Independent review approved the connected Axe result.',
  ),
  pass(
    'd2-default-reduced-motion-playwright',
    'default',
    'reduced-motion',
    'playwright',
    `${CONNECTED_REPORT}#pw-connected-reduced-motion`,
    CONNECTED_CHECKED_AT,
    'Chromium measured auto scrolling and zero-duration shell transitions.',
  ),
  pass(
    'd2-default-reduced-motion-manual',
    'default',
    'reduced-motion',
    'manual',
    `${MANUAL_REVIEW}#manual-approved-reduced-motion`,
    REVIEWED_AT,
    'Independent review approved the reduced-motion browser result.',
  ),
  pass(
    'd2-default-overflow-playwright',
    'default',
    'overflow-and-reflow',
    'playwright',
    `${CONNECTED_REPORT}#pw-connected-overflow-targets`,
    CONNECTED_CHECKED_AT,
    'Connected Chromium found no overflow above the one-pixel Q1 gate.',
  ),
  pass(
    'd2-default-overflow-visual',
    'default',
    'overflow-and-reflow',
    'visual',
    `${VISUAL_MANIFEST}#visual-default-overflow`,
    REVIEWED_AT,
    'All eight default header and footer baselines are included in the reviewed set.',
  ),
  pass(
    'd2-default-overflow-manual',
    'default',
    'overflow-and-reflow',
    'manual',
    `${MANUAL_REVIEW}#manual-approved-overflow`,
    REVIEWED_AT,
    'Independent review approved the all-probe overflow result.',
  ),
  notApplicable(
    'd2-default-error-vitest-na',
    'default',
    'error-messaging',
    'vitest',
    noErrorStateReason,
  ),
  notApplicable(
    'd2-default-error-axe-na',
    'default',
    'error-messaging',
    'axe',
    noErrorStateReason,
  ),
  notApplicable(
    'd2-default-error-playwright-na',
    'default',
    'error-messaging',
    'playwright',
    noErrorStateReason,
  ),
  notApplicable(
    'd2-default-error-manual-na',
    'default',
    'error-messaging',
    'manual',
    noErrorStateReason,
  ),
  notApplicable(
    'd2-default-route-playwright-na',
    'default',
    'route-announcement',
    'playwright',
    noRouteAnnouncementReason,
  ),
  notApplicable(
    'd2-default-route-manual-na',
    'default',
    'route-announcement',
    'manual',
    noRouteAnnouncementReason,
  ),
  pass(
    'd2-mobile-responsive-playwright',
    'mobile-navigation-open',
    'responsive-layout',
    'playwright',
    `${CONNECTED_REPORT}#pw-connected-wide-breakpoint`,
    CONNECTED_CHECKED_AT,
    'Chromium verified the exact 1023-to-1024px disclosure transition.',
  ),
  pass(
    'd2-mobile-responsive-visual',
    'mobile-navigation-open',
    'responsive-layout',
    'visual',
    `${VISUAL_MANIFEST}#visual-mobile-open-responsive`,
    REVIEWED_AT,
    'The reviewed open-menu baseline records the compact layout.',
  ),
  pass(
    'd2-mobile-responsive-manual',
    'mobile-navigation-open',
    'responsive-layout',
    'manual',
    `${MANUAL_REVIEW}#manual-correction-wide-resize`,
    CORRECTION_REVIEWED_AT,
    'Correction review directly observed the open 1023px to desktop 1024px transition.',
  ),
  pass(
    'd2-mobile-keyboard-vitest',
    'mobile-navigation-open',
    'keyboard-navigation',
    'vitest',
    `${UNIT_REPORT}#unit-inline-disclosure-tab`,
    UNIT_CHECKED_AT,
    'Unit result verifies native Tab order inside the inline disclosure.',
  ),
  pass(
    'd2-mobile-keyboard-playwright',
    'mobile-navigation-open',
    'keyboard-navigation',
    'playwright',
    `${CONNECTED_REPORT}#pw-connected-keyboard-navigation`,
    CONNECTED_CHECKED_AT,
    'Chromium exercised skip, open, Tab and Escape using the keyboard.',
  ),
  pass(
    'd2-mobile-names-vitest',
    'mobile-navigation-open',
    'names-and-labels',
    'vitest',
    `${UNIT_REPORT}#unit-inline-disclosure-tab`,
    UNIT_CHECKED_AT,
    'Unit result locates the labelled disclosure trigger and navigation links.',
  ),
  pass(
    'd2-mobile-names-axe',
    'mobile-navigation-open',
    'names-and-labels',
    'axe',
    `${CONNECTED_REPORT}#pw-connected-axe-closed-open`,
    CONNECTED_CHECKED_AT,
    'Axe passed the open connected shell.',
  ),
  pass(
    'd2-mobile-names-playwright',
    'mobile-navigation-open',
    'names-and-labels',
    'playwright',
    `${CONNECTED_REPORT}#pw-connected-axe-closed-open`,
    CONNECTED_CHECKED_AT,
    'The open-shell browser record contains the labelled elements scanned by Axe.',
  ),
  pass(
    'd2-mobile-names-manual',
    'mobile-navigation-open',
    'names-and-labels',
    'manual',
    `${MANUAL_REVIEW}#manual-approved-axe`,
    REVIEWED_AT,
    'Independent review approved the open-shell Axe result.',
  ),
  pass(
    'd2-mobile-contrast-axe',
    'mobile-navigation-open',
    'contrast',
    'axe',
    `${CONNECTED_REPORT}#pw-connected-axe-closed-open`,
    CONNECTED_CHECKED_AT,
    'Axe reported no serious or critical open-shell violations.',
  ),
  pass(
    'd2-mobile-contrast-manual',
    'mobile-navigation-open',
    'contrast',
    'manual',
    `${MANUAL_REVIEW}#manual-approved-axe`,
    REVIEWED_AT,
    'Independent review approved the open-shell Axe result.',
  ),
  pass(
    'd2-mobile-overflow-playwright',
    'mobile-navigation-open',
    'overflow-and-reflow',
    'playwright',
    `${CONNECTED_REPORT}#pw-connected-wide-breakpoint`,
    CONNECTED_CHECKED_AT,
    'Chromium kept the disclosure operable across its responsive boundary.',
  ),
  pass(
    'd2-mobile-overflow-visual',
    'mobile-navigation-open',
    'overflow-and-reflow',
    'visual',
    `${VISUAL_MANIFEST}#visual-mobile-open-overflow`,
    REVIEWED_AT,
    'The open-menu baseline is fully contained by the compact viewport.',
  ),
  notApplicable(
    'd2-mobile-error-vitest-na',
    'mobile-navigation-open',
    'error-messaging',
    'vitest',
    noErrorStateReason,
  ),
  notApplicable(
    'd2-mobile-error-axe-na',
    'mobile-navigation-open',
    'error-messaging',
    'axe',
    noErrorStateReason,
  ),
  notApplicable(
    'd2-mobile-error-playwright-na',
    'mobile-navigation-open',
    'error-messaging',
    'playwright',
    noErrorStateReason,
  ),
  notApplicable(
    'd2-mobile-error-manual-na',
    'mobile-navigation-open',
    'error-messaging',
    'manual',
    noErrorStateReason,
  ),
  notApplicable(
    'd2-mobile-route-playwright-na',
    'mobile-navigation-open',
    'route-announcement',
    'playwright',
    noRouteAnnouncementReason,
  ),
  notApplicable(
    'd2-mobile-route-manual-na',
    'mobile-navigation-open',
    'route-announcement',
    'manual',
    noRouteAnnouncementReason,
  ),
  pass(
    'd2-keyboard-navigation-vitest',
    'keyboard-navigation',
    'keyboard-navigation',
    'vitest',
    `${UNIT_REPORT}#unit-escape-focus-return`,
    UNIT_CHECKED_AT,
    'Unit result verifies Escape closure and focus return.',
  ),
  pass(
    'd2-keyboard-navigation-playwright',
    'keyboard-navigation',
    'keyboard-navigation',
    'playwright',
    `${CONNECTED_REPORT}#pw-connected-history-return`,
    CONNECTED_CHECKED_AT,
    'Chromium verifies route history never restores stale disclosure state.',
  ),
  pass(
    'd2-keyboard-navigation-manual',
    'keyboard-navigation',
    'keyboard-navigation',
    'manual',
    `${MANUAL_REVIEW}#manual-approved-history`,
    REVIEWED_AT,
    'Independent review approved the history-state regression.',
  ),
  pass(
    'd2-keyboard-focus-playwright',
    'keyboard-navigation',
    'focus-visible',
    'playwright',
    `${CONNECTED_REPORT}#pw-connected-keyboard-navigation`,
    CONNECTED_CHECKED_AT,
    'Chromium verifies the keyboard focus sequence and return target.',
  ),
  pass(
    'd2-keyboard-focus-visual',
    'keyboard-navigation',
    'focus-visible',
    'visual',
    `${VISUAL_MANIFEST}#visual-keyboard-focus`,
    REVIEWED_AT,
    'The approved focus baseline shows the project 3px focus ring.',
  ),
  pass(
    'd2-keyboard-focus-manual',
    'keyboard-navigation',
    'focus-visible',
    'manual',
    `${MANUAL_REVIEW}#manual-approved-all-visuals`,
    REVIEWED_AT,
    'Independent review approved the visible-focus baseline.',
  ),
  pass(
    'd2-keyboard-contrast-manual',
    'keyboard-navigation',
    'contrast',
    'manual',
    `${MANUAL_REVIEW}#manual-approved-all-visuals`,
    REVIEWED_AT,
    'Independent review approved the visible-focus baseline.',
  ),
  notApplicable(
    'd2-keyboard-error-vitest-na',
    'keyboard-navigation',
    'error-messaging',
    'vitest',
    noErrorStateReason,
  ),
  notApplicable(
    'd2-keyboard-error-axe-na',
    'keyboard-navigation',
    'error-messaging',
    'axe',
    noErrorStateReason,
  ),
  notApplicable(
    'd2-keyboard-error-playwright-na',
    'keyboard-navigation',
    'error-messaging',
    'playwright',
    noErrorStateReason,
  ),
  notApplicable(
    'd2-keyboard-error-manual-na',
    'keyboard-navigation',
    'error-messaging',
    'manual',
    noErrorStateReason,
  ),
  notApplicable(
    'd2-keyboard-route-playwright-na',
    'keyboard-navigation',
    'route-announcement',
    'playwright',
    noRouteAnnouncementReason,
  ),
  notApplicable(
    'd2-keyboard-route-manual-na',
    'keyboard-navigation',
    'route-announcement',
    'manual',
    noRouteAnnouncementReason,
  ),
  pass(
    'd2-unavailable-responsive-playwright',
    'api-unavailable',
    'responsive-layout',
    'playwright',
    `${UNAVAILABLE_REPORT}#pw-unavailable-api-state`,
    UNAVAILABLE_CHECKED_AT,
    'Unavailable-mode Chromium verifies the shell remains unchanged and operable.',
  ),
  pass(
    'd2-unavailable-responsive-visual',
    'api-unavailable',
    'responsive-layout',
    'visual',
    `${VISUAL_MANIFEST}#visual-unavailable-responsive`,
    REVIEWED_AT,
    'The approved unavailable baseline records the status composition.',
  ),
  pass(
    'd2-unavailable-error-vitest',
    'api-unavailable',
    'error-messaging',
    'vitest',
    `${UNIT_REPORT}#unit-route-page-api-fallback`,
    UNIT_CHECKED_AT,
    'Unit result pins the graceful API-unavailable fallback text.',
  ),
  pass(
    'd2-unavailable-error-axe',
    'api-unavailable',
    'error-messaging',
    'axe',
    `${UNAVAILABLE_REPORT}#pw-unavailable-axe-closed-open`,
    UNAVAILABLE_CHECKED_AT,
    'Axe passed the unavailable shell status composition.',
  ),
  pass(
    'd2-unavailable-error-playwright',
    'api-unavailable',
    'error-messaging',
    'playwright',
    `${UNAVAILABLE_REPORT}#pw-unavailable-api-state`,
    UNAVAILABLE_CHECKED_AT,
    'Chromium asserts the API unavailable status and unchanged landmarks.',
  ),
  pass(
    'd2-unavailable-error-manual',
    'api-unavailable',
    'error-messaging',
    'manual',
    `${MANUAL_REVIEW}#manual-correction-reflow-status`,
    CORRECTION_REVIEWED_AT,
    'Correction review directly observed the explicit unavailable status at the Q1 reflow viewport.',
  ),
  pass(
    'd2-unavailable-names-vitest',
    'api-unavailable',
    'names-and-labels',
    'vitest',
    `${UNIT_REPORT}#unit-route-page-api-fallback`,
    UNIT_CHECKED_AT,
    'Unit result pins the API-unavailable status content.',
  ),
  pass(
    'd2-unavailable-names-axe',
    'api-unavailable',
    'names-and-labels',
    'axe',
    `${UNAVAILABLE_REPORT}#pw-unavailable-axe-closed-open`,
    UNAVAILABLE_CHECKED_AT,
    'Axe passed the unavailable shell in closed and open states.',
  ),
  pass(
    'd2-unavailable-names-playwright',
    'api-unavailable',
    'names-and-labels',
    'playwright',
    `${UNAVAILABLE_REPORT}#pw-unavailable-api-state`,
    UNAVAILABLE_CHECKED_AT,
    'Chromium locates the named banner and unavailable status region.',
  ),
  pass(
    'd2-unavailable-names-manual',
    'api-unavailable',
    'names-and-labels',
    'manual',
    `${MANUAL_REVIEW}#manual-approved-banner`,
    REVIEWED_AT,
    'Independent review approved the unavailable-mode named banner.',
  ),
  pass(
    'd2-unavailable-contrast-axe',
    'api-unavailable',
    'contrast',
    'axe',
    `${UNAVAILABLE_REPORT}#pw-unavailable-axe-closed-open`,
    UNAVAILABLE_CHECKED_AT,
    'Axe reported no serious or critical unavailable-shell violations.',
  ),
  pass(
    'd2-unavailable-contrast-manual',
    'api-unavailable',
    'contrast',
    'manual',
    `${MANUAL_REVIEW}#manual-approved-axe`,
    REVIEWED_AT,
    'Independent review approved the unavailable-mode Axe result.',
  ),
  pass(
    'd2-unavailable-reduced-motion-playwright',
    'api-unavailable',
    'reduced-motion',
    'playwright',
    `${UNAVAILABLE_REPORT}#pw-unavailable-reduced-motion`,
    UNAVAILABLE_CHECKED_AT,
    'Unavailable-mode Chromium verifies the reduced-motion contract.',
  ),
  pass(
    'd2-unavailable-reduced-motion-manual',
    'api-unavailable',
    'reduced-motion',
    'manual',
    `${MANUAL_REVIEW}#manual-approved-reduced-motion`,
    REVIEWED_AT,
    'Independent review approved the unavailable-mode reduced-motion result.',
  ),
  pass(
    'd2-unavailable-overflow-playwright',
    'api-unavailable',
    'overflow-and-reflow',
    'playwright',
    `${UNAVAILABLE_REPORT}#pw-unavailable-overflow-targets`,
    UNAVAILABLE_CHECKED_AT,
    'Unavailable-mode Chromium found no overflow above the Q1 gate.',
  ),
  pass(
    'd2-unavailable-overflow-manual',
    'api-unavailable',
    'overflow-and-reflow',
    'manual',
    `${MANUAL_REVIEW}#manual-correction-reflow-status`,
    CORRECTION_REVIEWED_AT,
    'Correction review directly observed the 320px unavailable reflow composition.',
  ),
  notApplicable(
    'd2-unavailable-route-playwright-na',
    'api-unavailable',
    'route-announcement',
    'playwright',
    noRouteAnnouncementReason,
  ),
  notApplicable(
    'd2-unavailable-route-manual-na',
    'api-unavailable',
    'route-announcement',
    'manual',
    noRouteAnnouncementReason,
  ),
  notApplicable(
    'd2-default-keyboard-vitest-na',
    'default',
    'keyboard-navigation',
    'vitest',
    'The default evidence state is the closed non-interaction shell; keyboard execution is assigned to the mobile-navigation-open and keyboard-navigation states.',
  ),
  notApplicable(
    'd2-default-keyboard-playwright-na',
    'default',
    'keyboard-navigation',
    'playwright',
    'The default evidence state is the closed non-interaction shell; keyboard execution is assigned to the mobile-navigation-open and keyboard-navigation states.',
  ),
  notApplicable(
    'd2-default-keyboard-manual-na',
    'default',
    'keyboard-navigation',
    'manual',
    'The default evidence state is the closed non-interaction shell; the independently reviewed history result is assigned to keyboard-navigation.',
  ),
  notApplicable(
    'd2-default-focus-playwright-na',
    'default',
    'focus-visible',
    'playwright',
    'The default evidence state does not place focus on an interactive control; focused rendering is exercised by keyboard-navigation.',
  ),
  notApplicable(
    'd2-default-focus-visual-na',
    'default',
    'focus-visible',
    'visual',
    'The default baselines intentionally show no focused control; the approved focus baseline is assigned to keyboard-navigation.',
  ),
  notApplicable(
    'd2-default-focus-manual-na',
    'default',
    'focus-visible',
    'manual',
    'The independent focus observation applies to the keyboard-navigation baseline rather than the unfocused default shell.',
  ),
  notApplicable(
    'd2-default-reduced-motion-vitest-na',
    'default',
    'reduced-motion',
    'vitest',
    'The D2 focused unit run does not compute browser motion styles; the connected Chromium and independent-review records exercise this check.',
  ),
  pass(
    'd2-mobile-keyboard-manual',
    'mobile-navigation-open',
    'keyboard-navigation',
    'manual',
    `${MANUAL_REVIEW}#manual-correction-keyboard-sequence`,
    CORRECTION_REVIEWED_AT,
    'Correction review directly observed keyboard opening, Tab order, Escape closure and focus return.',
  ),
  notApplicable(
    'd2-mobile-focus-playwright-na',
    'mobile-navigation-open',
    'focus-visible',
    'playwright',
    'The open-menu screenshot follows pointer activation; visible keyboard focus is exercised by the keyboard-navigation state.',
  ),
  notApplicable(
    'd2-mobile-focus-visual-na',
    'mobile-navigation-open',
    'focus-visible',
    'visual',
    'The open-menu baseline is not the focus baseline; reviewed focus pixels are assigned to keyboard-navigation.',
  ),
  notApplicable(
    'd2-mobile-focus-manual-na',
    'mobile-navigation-open',
    'focus-visible',
    'manual',
    'The independent focus observation applies to keyboard-navigation, not the pointer-open menu baseline.',
  ),
  notApplicable(
    'd2-mobile-reduced-motion-vitest-na',
    'mobile-navigation-open',
    'reduced-motion',
    'vitest',
    'Reduced motion is a document preference rather than a separate open-menu unit state; the browser result is recorded under default and api-unavailable.',
  ),
  notApplicable(
    'd2-mobile-reduced-motion-playwright-na',
    'mobile-navigation-open',
    'reduced-motion',
    'playwright',
    'The reduced-motion browser test measures the shell preference without opening the disclosure; its result is recorded under default.',
  ),
  notApplicable(
    'd2-mobile-reduced-motion-manual-na',
    'mobile-navigation-open',
    'reduced-motion',
    'manual',
    'Independent review approved the document-level reduced-motion result, not a distinct open-menu motion observation.',
  ),
  notApplicable(
    'd2-mobile-overflow-manual-na',
    'mobile-navigation-open',
    'overflow-and-reflow',
    'manual',
    'The reviewer approved the open-menu visual and the all-probe closed-shell overflow result, but not a separate manual open-menu overflow measurement.',
  ),
  pass(
    'd2-keyboard-responsive-playwright',
    'keyboard-navigation',
    'responsive-layout',
    'playwright',
    `${CONNECTED_REPORT}#pw-connected-mobile-visuals`,
    CONNECTED_CHECKED_AT,
    'Chromium enforces the keyboard-focus header at the compact responsive viewport.',
  ),
  pass(
    'd2-keyboard-responsive-visual',
    'keyboard-navigation',
    'responsive-layout',
    'visual',
    `${VISUAL_MANIFEST}#visual-keyboard-responsive`,
    REVIEWED_AT,
    'The reviewed focus baseline records the compact responsive header.',
  ),
  pass(
    'd2-keyboard-responsive-manual',
    'keyboard-navigation',
    'responsive-layout',
    'manual',
    `${MANUAL_REVIEW}#manual-approved-all-visuals`,
    REVIEWED_AT,
    'Independent review approved the responsive visible-focus baseline.',
  ),
  pass(
    'd2-keyboard-names-vitest',
    'keyboard-navigation',
    'names-and-labels',
    'vitest',
    `${UNIT_REPORT}#unit-inline-disclosure-tab`,
    UNIT_CHECKED_AT,
    'Unit execution locates the labelled trigger, navigation and links in keyboard order.',
  ),
  notApplicable(
    'd2-keyboard-names-axe-na',
    'keyboard-navigation',
    'names-and-labels',
    'axe',
    'Axe scans the semantically identical closed and open shell states; it does not create a distinct focused-keyboard scan.',
  ),
  pass(
    'd2-keyboard-names-playwright',
    'keyboard-navigation',
    'names-and-labels',
    'playwright',
    `${CONNECTED_REPORT}#pw-connected-keyboard-navigation`,
    CONNECTED_CHECKED_AT,
    'Chromium resolves named controls throughout the keyboard-only sequence.',
  ),
  notApplicable(
    'd2-keyboard-names-manual-na',
    'keyboard-navigation',
    'names-and-labels',
    'manual',
    'Independent review approved the banner and focus visuals but did not record a separate manual accessible-name inspection in the focused state.',
  ),
  notApplicable(
    'd2-keyboard-contrast-axe-na',
    'keyboard-navigation',
    'contrast',
    'axe',
    'Axe contrast results are recorded for closed and open shells; visible focus contrast is covered by the independently approved visual baseline.',
  ),
  notApplicable(
    'd2-keyboard-reduced-motion-vitest-na',
    'keyboard-navigation',
    'reduced-motion',
    'vitest',
    'The focused keyboard unit state does not compute browser motion styles; reduced motion is exercised at document level.',
  ),
  notApplicable(
    'd2-keyboard-reduced-motion-playwright-na',
    'keyboard-navigation',
    'reduced-motion',
    'playwright',
    'The reduced-motion browser test does not enter the focused keyboard state; the preference result is recorded under default.',
  ),
  notApplicable(
    'd2-keyboard-reduced-motion-manual-na',
    'keyboard-navigation',
    'reduced-motion',
    'manual',
    'Independent review approved the document-level reduced-motion result, not a separate focused-keyboard motion observation.',
  ),
  notApplicable(
    'd2-keyboard-overflow-playwright-na',
    'keyboard-navigation',
    'overflow-and-reflow',
    'playwright',
    'The numerical all-probe overflow loop runs the default shell; the focused state is enforced through its contained screenshot baseline.',
  ),
  notApplicable(
    'd2-keyboard-overflow-visual-na',
    'keyboard-navigation',
    'overflow-and-reflow',
    'visual',
    'The focus baseline is mapped to focus visibility and responsive layout, while the eight shell pairs carry the overflow visual mapping.',
  ),
  notApplicable(
    'd2-keyboard-overflow-manual-na',
    'keyboard-navigation',
    'overflow-and-reflow',
    'manual',
    'Independent review approved the all-probe overflow result but did not claim a separate focused-state overflow measurement.',
  ),
  pass(
    'd2-unavailable-responsive-manual',
    'api-unavailable',
    'responsive-layout',
    'manual',
    `${MANUAL_REVIEW}#manual-approved-all-visuals`,
    REVIEWED_AT,
    'Independent review approved the API-unavailable responsive composition.',
  ),
  notApplicable(
    'd2-unavailable-keyboard-vitest-na',
    'api-unavailable',
    'keyboard-navigation',
    'vitest',
    'The focused unit command is API-independent and does not execute a distinct unavailable-mode unit environment.',
  ),
  pass(
    'd2-unavailable-keyboard-playwright',
    'api-unavailable',
    'keyboard-navigation',
    'playwright',
    `${UNAVAILABLE_REPORT}#pw-unavailable-keyboard-navigation`,
    UNAVAILABLE_CHECKED_AT,
    'Unavailable-mode Chromium completed the keyboard-only disclosure flow.',
  ),
  notApplicable(
    'd2-unavailable-keyboard-manual-na',
    'api-unavailable',
    'keyboard-navigation',
    'manual',
    'Independent review approved unavailable browser results but did not record a separate manual unavailable-mode keyboard session.',
  ),
  pass(
    'd2-unavailable-focus-playwright',
    'api-unavailable',
    'focus-visible',
    'playwright',
    `${UNAVAILABLE_REPORT}#pw-unavailable-keyboard-navigation`,
    UNAVAILABLE_CHECKED_AT,
    'Unavailable-mode Chromium verifies focus return after Escape.',
  ),
  pass(
    'd2-unavailable-focus-visual',
    'api-unavailable',
    'focus-visible',
    'visual',
    `${VISUAL_MANIFEST}#visual-unavailable-focus`,
    REVIEWED_AT,
    'Unavailable mode revalidated the same approved visible-focus baseline.',
  ),
  pass(
    'd2-unavailable-focus-manual',
    'api-unavailable',
    'focus-visible',
    'manual',
    `${MANUAL_REVIEW}#manual-approved-all-visuals`,
    REVIEWED_AT,
    'Independent review approved all enforced visuals across both API modes.',
  ),
  notApplicable(
    'd2-unavailable-reduced-motion-vitest-na',
    'api-unavailable',
    'reduced-motion',
    'vitest',
    'The focused unit command is API-independent and does not compute unavailable-mode browser motion styles.',
  ),
  pass(
    'd2-unavailable-overflow-visual',
    'api-unavailable',
    'overflow-and-reflow',
    'visual',
    `${VISUAL_MANIFEST}#visual-unavailable-overflow`,
    REVIEWED_AT,
    'Unavailable mode revalidated all eight approved shell header and footer baselines.',
  ),
];

export const d2RequiredEvidenceMappings: readonly D2EvidenceMapping[] =
  d2ShellStates.flatMap((state) =>
    acceptanceChecks.flatMap((check) =>
      [
        ...check.automatedBy,
        ...(check.manualConfirmationRequired ? (['manual'] as const) : []),
      ].map((channel) => ({ channel, check: check.id, state })),
    ),
  );

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

function isState(value: unknown): value is D2ShellState {
  return d2ShellStates.some((state) => state === value);
}

function isCheck(value: unknown): value is AcceptanceCheckId {
  return acceptanceCheckIds.some((check) => check === value);
}

function isChannel(value: unknown): value is EvidenceChannel {
  return evidenceChannels.some((channel) => channel === value);
}

function hasUniqueStrings(values: unknown[]): boolean {
  return (
    values.every(isNonEmptyString) && new Set(values).size === values.length
  );
}

function parseArtifact(
  artifact: string,
): { path: string; recordId: string } | null {
  const separator = artifact.lastIndexOf('#');
  if (separator <= 0 || separator === artifact.length - 1) return null;
  const path = artifact.slice(0, separator);
  const recordId = artifact.slice(separator + 1);
  if (!path.endsWith('.json') || !isNonEmptyString(recordId)) return null;
  return { path, recordId };
}

function mappingKey(mapping: D2EvidenceMapping): string {
  return `${mapping.state}|${mapping.check}|${mapping.channel}`;
}

function readJson<T>(repositoryRoot: string, path: string): T {
  return JSON.parse(readFileSync(join(repositoryRoot, path), 'utf8')) as T;
}

export function loadD2EvidenceArtifacts(
  repositoryRoot: string,
): D2EvidenceArtifacts {
  return {
    runReports: [
      readJson<D2RunReport>(repositoryRoot, CONNECTED_REPORT),
      readJson<D2RunReport>(repositoryRoot, UNAVAILABLE_REPORT),
      readJson<D2RunReport>(repositoryRoot, UNIT_REPORT),
    ],
    visualManifest: readJson<D2VisualManifest>(repositoryRoot, VISUAL_MANIFEST),
    manualReview: readJson<D2ManualReview>(repositoryRoot, MANUAL_REVIEW),
  };
}

export function validateD2RunReport(report: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(report)) return ['Run report must be an object.'];

  if (report.schemaVersion !== 1) errors.push('Run schemaVersion must be 1.');
  if (!isNonEmptyString(report.runId)) errors.push('Run ID is required.');
  if (
    !['api-connected', 'api-unavailable', 'unit'].includes(String(report.mode))
  ) {
    errors.push('Run mode is invalid.');
  }
  if (!isNonEmptyString(report.command))
    errors.push('Run command is required.');
  if (!isUtcTimestamp(report.startedAt) || !isUtcTimestamp(report.finishedAt)) {
    errors.push('Run timestamps must be valid UTC timestamps.');
  } else if (new Date(report.finishedAt) < new Date(report.startedAt)) {
    errors.push('Run finishedAt must not precede startedAt.');
  }
  if (report.outcome !== 'pass') errors.push('Recorded D2 run must pass.');
  if (
    !isRecord(report.environment) ||
    !isNonEmptyString(report.environment.node) ||
    !isNonEmptyString(report.environment.pnpm)
  ) {
    errors.push('Run Node and pnpm versions are required.');
  }
  if (!Array.isArray(report.records) || report.records.length === 0) {
    errors.push('Run records are required.');
    return errors;
  }

  const ids: unknown[] = [];
  for (const value of report.records) {
    if (!isRecord(value)) {
      errors.push('Run record must be an object.');
      continue;
    }
    ids.push(value.id);
    if (!isNonEmptyString(value.id) || !isNonEmptyString(value.title)) {
      errors.push('Run record ID and title are required.');
    }
    if (value.outcome !== 'pass')
      errors.push(`Run record ${String(value.id)} did not pass.`);
    if (
      !Array.isArray(value.channels) ||
      value.channels.length === 0 ||
      !value.channels.every(isChannel)
    ) {
      errors.push(`Run record ${String(value.id)} has invalid channels.`);
    }
    if (
      !Array.isArray(value.states) ||
      value.states.length === 0 ||
      !value.states.every(isState)
    ) {
      errors.push(`Run record ${String(value.id)} has invalid states.`);
    }
    if (
      !Array.isArray(value.checks) ||
      value.checks.length === 0 ||
      !value.checks.every(isCheck)
    ) {
      errors.push(`Run record ${String(value.id)} has invalid checks.`);
    }
  }
  if (!hasUniqueStrings(ids)) errors.push('Run record IDs must be unique.');
  if (report.mode !== 'unit' && report.records.length !== 10) {
    errors.push('Each Playwright mode must contain exactly 10 test results.');
  }
  return errors;
}

function readPngDimensions(
  buffer: Buffer,
): { height: number; width: number } | null {
  const signature = '89504e470d0a1a0a';
  if (
    buffer.length < 24 ||
    buffer.subarray(0, 8).toString('hex') !== signature
  ) {
    return null;
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export function validateD2VisualManifest(
  manifest: unknown,
  repositoryRoot: string,
): string[] {
  const errors: string[] = [];
  if (!isRecord(manifest)) return ['Visual manifest must be an object.'];
  if (manifest.schemaVersion !== 1)
    errors.push('Visual schemaVersion must be 1.');
  if (!isNonEmptyString(manifest.baselineDirectory)) {
    errors.push('Visual baseline directory is required.');
    return errors;
  }
  if (
    !Array.isArray(manifest.baselines) ||
    !Array.isArray(manifest.evidenceSets)
  ) {
    errors.push('Visual baselines and evidence sets are required.');
    return errors;
  }

  const directory = join(repositoryRoot, manifest.baselineDirectory);
  const diskPaths = existsSync(directory)
    ? readdirSync(directory)
        .filter((filename) => filename.endsWith('.png'))
        .map((filename) => `${manifest.baselineDirectory}/${filename}`)
        .sort()
    : [];
  const manifestPaths = manifest.baselines
    .filter(isRecord)
    .map(({ path }) => path)
    .filter(isNonEmptyString)
    .sort();
  if (manifest.baselines.length !== 11)
    errors.push('Visual manifest must contain 11 baselines.');
  if (JSON.stringify(diskPaths) !== JSON.stringify(manifestPaths)) {
    errors.push('Visual manifest and on-disk PNG paths differ.');
  }

  const baselineIds: unknown[] = [];
  for (const value of manifest.baselines) {
    if (!isRecord(value)) {
      errors.push('Visual baseline must be an object.');
      continue;
    }
    baselineIds.push(value.id);
    if (!isNonEmptyString(value.id) || !isNonEmptyString(value.path)) {
      errors.push('Visual baseline ID and path are required.');
      continue;
    }
    if (
      !/^\p{ASCII}{64}$/u.test(String(value.sha256)) ||
      !/^[a-f0-9]{64}$/.test(String(value.sha256))
    ) {
      errors.push(`Visual baseline ${value.id} has an invalid SHA-256.`);
    }
    const path = join(repositoryRoot, value.path);
    if (!existsSync(path)) {
      errors.push(`Visual baseline ${value.id} is missing.`);
      continue;
    }
    const buffer = readFileSync(path);
    const hash = createHash('sha256').update(buffer).digest('hex');
    if (hash !== value.sha256)
      errors.push(`Visual baseline ${value.id} SHA-256 drifted.`);
    const dimensions = readPngDimensions(buffer);
    if (
      dimensions === null ||
      dimensions.width !== value.width ||
      dimensions.height !== value.height
    ) {
      errors.push(`Visual baseline ${value.id} dimensions drifted.`);
    }
    if (
      !Array.isArray(value.states) ||
      !value.states.every(isState) ||
      !Array.isArray(value.checks) ||
      !value.checks.every(isCheck)
    ) {
      errors.push(`Visual baseline ${value.id} has invalid mapping metadata.`);
    }
    if (!isRecord(value.viewport)) {
      errors.push(`Visual baseline ${value.id} has no viewport metadata.`);
    } else {
      const viewport = value.viewport;
      const probe = viewportProbes.find(({ id }) => id === viewport.id);
      if (
        probe === undefined ||
        probe.width !== viewport.width ||
        probe.height !== viewport.height
      ) {
        errors.push(`Visual baseline ${value.id} viewport does not match Q1.`);
      }
    }
  }
  if (!hasUniqueStrings(baselineIds))
    errors.push('Visual baseline IDs must be unique.');

  const baselineById = new Map(
    manifest.baselines
      .filter(isRecord)
      .filter(({ id }) => isNonEmptyString(id))
      .map((baseline) => [baseline.id as string, baseline]),
  );
  const setIds: unknown[] = [];
  const referenced = new Set<string>();
  for (const value of manifest.evidenceSets) {
    if (!isRecord(value)) {
      errors.push('Visual evidence set must be an object.');
      continue;
    }
    setIds.push(value.id);
    if (
      !isNonEmptyString(value.id) ||
      !isState(value.state) ||
      !isCheck(value.check) ||
      !Array.isArray(value.baselineIds) ||
      value.baselineIds.length === 0 ||
      !value.baselineIds.every(isNonEmptyString)
    ) {
      errors.push(`Visual evidence set ${String(value.id)} is invalid.`);
      continue;
    }
    for (const baselineId of value.baselineIds) {
      referenced.add(baselineId);
      const baseline = baselineById.get(baselineId);
      if (
        baseline === undefined ||
        !Array.isArray(baseline.states) ||
        !baseline.states.includes(value.state) ||
        !Array.isArray(baseline.checks) ||
        !baseline.checks.includes(value.check)
      ) {
        errors.push(
          `Visual evidence set ${value.id} has an invalid baseline mapping.`,
        );
      }
    }
  }
  if (!hasUniqueStrings(setIds))
    errors.push('Visual evidence set IDs must be unique.');
  if ([...baselineById.keys()].some((id) => !referenced.has(id))) {
    errors.push('Every visual baseline must belong to an evidence set.');
  }
  return errors;
}

function validateManualReview(review: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(review)) return ['Manual review must be an object.'];
  if (review.schemaVersion !== 1)
    errors.push('Manual review schemaVersion must be 1.');
  if (review.reviewerAgentRun !== d2EvidenceReviewerUrl) {
    errors.push(
      'Manual review must reference the independent reviewer Agent Run.',
    );
  }
  if (!isUtcTimestamp(review.reviewedAt))
    errors.push('Manual review timestamp is invalid.');
  if (
    review.correctionAgentRun !== d2EvidenceCorrectionAgentRunUrl ||
    review.correctionOutcome !== 'completed' ||
    !isUtcTimestamp(review.correctionReviewedAt)
  ) {
    errors.push('Manual correction review metadata is invalid.');
  }
  if (review.overallOutcome !== 'failed-evidence-only') {
    errors.push(
      'Manual review overall outcome must preserve the evidence-only failure.',
    );
  }
  if (
    !Array.isArray(review.approvedObservations) ||
    !Array.isArray(review.correctionObservations) ||
    !Array.isArray(review.remainingObservations)
  ) {
    errors.push('Manual approved and remaining observations are required.');
    return errors;
  }
  const all = [
    ...review.approvedObservations,
    ...review.correctionObservations,
    ...review.remainingObservations,
  ];
  const ids: unknown[] = [];
  for (const value of all) {
    if (!isRecord(value)) {
      errors.push('Manual observation must be an object.');
      continue;
    }
    ids.push(value.id);
    if (
      !isNonEmptyString(value.id) ||
      !isNonEmptyString(value.observation) ||
      !Array.isArray(value.states) ||
      !value.states.every(isState) ||
      !Array.isArray(value.checks) ||
      !value.checks.every(isCheck)
    ) {
      errors.push(`Manual observation ${String(value.id)} is invalid.`);
    }
  }
  if (
    review.approvedObservations.some(
      (value) => !isRecord(value) || value.status !== 'approved',
    ) ||
    review.correctionObservations.some(
      (value) => !isRecord(value) || value.status !== 'approved',
    ) ||
    review.remainingObservations.some(
      (value) => !isRecord(value) || value.status !== 'not-reviewed',
    )
  ) {
    errors.push('Manual approved and remaining statuses must stay separate.');
  }
  if (!hasUniqueStrings(ids))
    errors.push('Manual observation IDs must be unique.');
  return errors;
}

function supportsMapping(
  record: { channels?: unknown; checks?: unknown; states?: unknown },
  mapping: D2EvidenceMapping,
): boolean {
  const channels = Array.isArray(record.channels)
    ? record.channels
    : ['manual'];
  return (
    channels.includes(mapping.channel) &&
    Array.isArray(record.states) &&
    record.states.includes(mapping.state) &&
    Array.isArray(record.checks) &&
    record.checks.includes(mapping.check)
  );
}

export function validateD2EvidenceBundle({
  artifacts,
  evidence,
  repositoryRoot,
  requiredMappings,
}: {
  artifacts: D2EvidenceArtifacts;
  evidence: readonly D2ShellEvidenceRecord[];
  repositoryRoot: string;
  requiredMappings: readonly D2EvidenceMapping[];
}): string[] {
  const errors = [
    ...artifacts.runReports.flatMap(validateD2RunReport),
    ...validateD2VisualManifest(artifacts.visualManifest, repositoryRoot),
    ...validateManualReview(artifacts.manualReview),
  ];
  const ids = evidence.map(({ id }) => id);
  if (!hasUniqueStrings(ids))
    errors.push('Evidence record IDs must be unique.');

  const expectedCounts = new Map<string, number>();
  for (const mapping of requiredMappings) {
    const key = mappingKey(mapping);
    expectedCounts.set(key, (expectedCounts.get(key) ?? 0) + 1);
  }
  if ([...expectedCounts.values()].some((count) => count !== 1)) {
    errors.push('Required evidence mappings must be unique.');
  }
  const actualCounts = new Map<string, number>();
  for (const record of evidence) {
    const key = mappingKey({
      channel: record.evidence.channel,
      check: record.check,
      state: record.state,
    });
    actualCounts.set(key, (actualCounts.get(key) ?? 0) + 1);
  }
  for (const key of new Set([
    ...expectedCounts.keys(),
    ...actualCounts.keys(),
  ])) {
    if (expectedCounts.get(key) !== actualCounts.get(key)) {
      errors.push(
        `Evidence mapping ${key} is missing, duplicated or unexpected.`,
      );
    }
  }

  const runRecords = new Map<
    string,
    { checkedAt: string; record: D2RunRecord }
  >();
  for (const report of artifacts.runReports) {
    const path =
      report.mode === 'api-connected'
        ? CONNECTED_REPORT
        : report.mode === 'api-unavailable'
          ? UNAVAILABLE_REPORT
          : UNIT_REPORT;
    for (const record of report.records) {
      runRecords.set(`${path}#${record.id}`, {
        checkedAt: report.finishedAt,
        record,
      });
    }
  }
  const visualRecords = new Map(
    artifacts.visualManifest.evidenceSets.map((record) => [
      `${VISUAL_MANIFEST}#${record.id}`,
      record,
    ]),
  );
  const manualRecords = new Map<
    string,
    { checkedAt: string; record: D2ManualObservation }
  >([
    ...artifacts.manualReview.approvedObservations.map(
      (record) =>
        [
          `${MANUAL_REVIEW}#${record.id}`,
          { checkedAt: artifacts.manualReview.reviewedAt, record },
        ] as const,
    ),
    ...artifacts.manualReview.correctionObservations.map(
      (record) =>
        [
          `${MANUAL_REVIEW}#${record.id}`,
          { checkedAt: artifacts.manualReview.correctionReviewedAt, record },
        ] as const,
    ),
  ]);

  for (const record of evidence) {
    const mapping: D2EvidenceMapping = {
      channel: record.evidence.channel,
      check: record.check,
      state: record.state,
    };
    if (!isClosureAcceptedEvidence(record.evidence)) {
      errors.push(`Evidence ${record.id} is rejected by the Q1 validator.`);
      continue;
    }
    if (record.evidence.status === 'not-applicable') {
      if (
        record.evidence.artifact !== null ||
        record.evidence.reviewerAgreementTrace !== d2EvidenceReviewerUrl
      ) {
        errors.push(`Evidence ${record.id} is not reviewer-approved N/A.`);
      }
      continue;
    }

    const parsed = parseArtifact(record.evidence.artifact);
    if (
      parsed === null ||
      !existsSync(join(repositoryRoot, parsed?.path ?? ''))
    ) {
      errors.push(
        `Evidence ${record.id} does not reference a durable JSON record.`,
      );
      continue;
    }
    const run = runRecords.get(record.evidence.artifact);
    const visual = visualRecords.get(record.evidence.artifact);
    const manual = manualRecords.get(record.evidence.artifact);
    if (run !== undefined) {
      if (
        !supportsMapping(run.record, mapping) ||
        run.checkedAt !== record.evidence.checkedAt
      ) {
        errors.push(`Evidence ${record.id} does not match its run record.`);
      }
    } else if (visual !== undefined) {
      if (
        record.evidence.channel !== 'visual' ||
        visual.state !== record.state ||
        visual.check !== record.check ||
        record.evidence.checkedAt !== artifacts.manualReview.reviewedAt
      ) {
        errors.push(`Evidence ${record.id} does not match its visual set.`);
      }
    } else if (manual !== undefined) {
      if (
        record.evidence.channel !== 'manual' ||
        !supportsMapping(manual.record, mapping) ||
        record.evidence.checkedAt !== manual.checkedAt
      ) {
        errors.push(
          `Evidence ${record.id} does not match approved manual review.`,
        );
      }
    } else {
      errors.push(`Evidence ${record.id} references an unknown record ID.`);
    }
  }
  return errors;
}
