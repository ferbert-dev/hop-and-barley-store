# Responsive and accessibility acceptance matrix

This is the cross-cutting quality gate for every Hop & Barley UI slice. It
starts with the accepted D1 design foundation and must be updated as each route
or state becomes implementable. It does not assert that planned routes already
exist.

The machine-readable source of truth is
`src/quality/acceptance-matrix.ts`. This document explains how to apply it and
how to record evidence.

## Evidence boundary

- **Implemented:** D1 breakpoints at 480, 768, 1024 and 1440 CSS pixels, plus
  reduced-motion duration tokens and `scroll-behavior: auto`.
- **Decided:** catalog uses `/`; product detail uses `/product/[slug]`; the
  required order form begins at `/cart`; review/confirmation uses `/checkout`;
  the protected customer route is `/account/[id]`; the admin product list uses
  `/admin/products`.
- **Planned:** the route families and states in the matrix below.
- **Unresolved:** final auth, recovery, account-order, admin create/edit and
  admin-dashboard paths. Their implementation tickets must resolve them. Q1
  deliberately stores `null`, never a guessed URL.

Sources: the Q1 ticket, verified system architecture, Complete Local MVP plan,
the domain Epics and the accepted D1 design foundation. Next.js route
announcements use the document title, then the page `h1`, then the URL, so every
implemented page needs a unique descriptive title and heading.

## Required viewport probes

Every completed route state runs at the 320-pixel reflow width and the four core
viewport widths. A slice that changes layout at a D1 breakpoint also runs the
matching before/at pair. The 375-pixel sample is supplemental and never replaces
the approved 360-pixel compact-mobile probe.

| Probe                | Viewport    | Purpose                                    | Visual baseline |
| -------------------- | ----------- | ------------------------------------------ | --------------- |
| Reflow               | `320×800`   | WCAG 2.2 AA reflow equivalent at 400% zoom | No              |
| Compact mobile/core  | `360×800`   | Approved compact phone experience          | Yes             |
| Mobile sample        | `375×812`   | Supplemental common-device probe           | No              |
| Compact boundary     | `479/480`   | D1 compact gutter boundary                 | When affected   |
| Tablet boundary/core | `767/768`   | D1 medium and tablet layout boundary       | At 768          |
| Wide boundary        | `1023/1024` | D1 desktop navigation/grid boundary        | When affected   |
| Desktop              | `1280×900`  | Normal desktop experience                  | Yes             |
| Canvas boundary      | `1439/1440` | D1 maximum design-canvas boundary          | At 1440         |

Boundary heights are defined in the TypeScript contract. The before probe is
exactly one CSS pixel below its D1 breakpoint; the at probe is exactly the
breakpoint.

## Route and state matrix

All nine checks are required for every state: responsive layout, keyboard
navigation, visible focus, names/labels, contrast, error messaging, reduced
motion, overflow/reflow and route announcement. A check can be marked
`not-applicable` only with a written reason and reviewer agreement.

| Family                                   | Route policy                | Required states                                                                                                                                  |
| ---------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shared storefront shell                  | Shared across routes        | default; mobile navigation open; keyboard navigation; API unavailable                                                                            |
| Catalog and discovery                    | Confirmed `/`               | loading; ready; filtered; empty; error                                                                                                           |
| Product detail/reviews/cart action       | Confirmed `/product/[slug]` | loading; in stock; out of stock; not found; empty/populated reviews; review validation error; cart error                                         |
| Cart and required order form             | Confirmed `/cart`           | empty; populated; quantity validation error; API error; submitting order                                                                         |
| Checkout review/confirmation             | Confirmed `/checkout`       | review; submitting; success; validation error; order error                                                                                       |
| Registration/sign-in/sign-out            | Unresolved until A0/A1C     | sign in; register; validation error; invalid credentials; expired session; Google unconfigured                                                   |
| Account recovery                         | Unresolved until A3         | request; request success; reset; invalid/expired token; validation error                                                                         |
| Customer account/profile                 | Confirmed `/account/[id]`   | loading; ready; edit; validation error; missing-session redirect; authenticated forbidden; API error                                             |
| Customer order history                   | Unresolved until A5         | loading; populated; empty; pagination; missing-session redirect; authenticated forbidden; API error                                              |
| Admin product list/search                | Confirmed `/admin/products` | loading; populated; empty search; missing-session redirect; authenticated forbidden; API error                                                   |
| Admin product creation                   | Unresolved until M3         | ready; validation error; saving; success; missing-session redirect; authenticated forbidden; API error                                           |
| Admin product edit/visibility/retirement | Unresolved until M4/M5      | loading; ready; validation; saving; visibility updated; retirement blocked/retired; missing-session redirect; authenticated forbidden; API error |
| Optional admin dashboard                 | Unresolved, P2 M6           | loading; ready; empty; missing-session redirect; authenticated forbidden; API error                                                              |

Success, error, empty and loading states are separate evidence rows. Every
protected account/admin family also separates a missing-session redirect from
an authenticated-but-forbidden response. A happy-path screenshot cannot close
either access-control state.

## Numeric gates

The conformance target is WCAG 2.2 Level AA:

- normal text contrast is at least `4.5:1`; large text is at least `3:1`;
- meaningful graphics, control boundaries and state/focus cues are at least
  `3:1` against adjacent colours;
- project pointer targets are at least `44×44` CSS pixels. `24×24` is only the
  WCAG 2.2 AA floor; a smaller target requires a documented WCAG exception;
- content reflows without lost information or two-dimensional scrolling at 320
  CSS pixels (equivalent to a 1280-pixel viewport at 400% zoom), except for a
  documented intrinsically two-dimensional region;
- unexpected horizontal overflow is at most `1` CSS pixel, allowing only
  subpixel rounding;
- axe reports zero `critical` and zero `serious` violations for every rendered
  state;
- the project focus gate is a visible indicator at least `3` CSS pixels thick,
  at least `3:1` against adjacent colours, and not fully obscured. `2` CSS
  pixels is retained only as the WCAG floor;
- input errors identify the field and describe the problem in visible text;
  colour alone never communicates an error;
- under `prefers-reduced-motion: reduce`, D1 motion-token durations are `0ms`
  and HTML scrolling is `auto`; no content or function can depend on motion;
- visual snapshots disable animations and hide the caret, use a per-pixel
  threshold of `0.2`, and allow at most a `0.01` differing-pixel ratio. This
  keeps the approved preflight tolerance and avoids brittle cross-platform
  failures while still failing a one-percent regression.

Primary WCAG references: [Contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html),
[Non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html),
[Target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html),
[Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) and
[Error identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html).
Ratios are thresholds and must not be rounded up.

## Evidence ownership

| Channel                  | Automated responsibility                                                                                                                                 | What remains manual                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Vitest + Testing Library | component/state rendering, keyboard interactions, accessible names, labels, errors and the matrix invariants                                             | Whether wording is clear and focus order matches the task                     |
| axe                      | programmatically detectable WCAG violations in each rendered DOM state; zero critical/serious                                                            | Contrast over images, meaningful alternative text and screen-reader usability |
| Playwright               | real route/state path, keyboard-only critical action, focus movement, reduced-motion emulation, overflow measurements, title/h1 and deterministic errors | Assistive-technology announcement quality and platform-specific behaviour     |
| Visual screenshots       | mobile/tablet/desktop/canvas composition, clipping and visible focus/error states with the pinned diff gate                                              | Whether a deliberate design change is acceptable                              |
| Manual                   | 400% zoom/reflow, logical focus order, route/error announcements, contrast over imagery, labels/instructions and reduced-motion experience               | The signed evidence itself                                                    |

Vitest cannot prove async Server Components work; those states require
Playwright against a production build. Axe and screenshot tooling are not added
by Q1 because there is not yet a real UI state to scan or baseline. The first
slice that renders one must add the smallest suitable test integration and keep
these channel boundaries.

## Evidence record

Each affected route/state/check/channel record is a discriminated TypeScript
union. `channel` is one of `vitest`, `axe`, `playwright`, `visual` or `manual`;
`note` records the state/fixture or blocker.

| Status           | Required closure evidence                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pass`           | Non-empty artifact path/URL and a valid UTC ISO timestamp.                                                                     |
| `not-applicable` | Artifact is `null` or a non-empty string; non-empty reason, reviewer-agreement trace and valid UTC ISO timestamp are required. |
| `not-run`        | Artifact and timestamp remain `null`; never closes.                                                                            |
| `blocked`        | Blocker is recorded in the note, with optional partial artifact/timestamp; never closes.                                       |
| `fail`           | Failure evidence may be attached, but the status never closes.                                                                 |

`isClosureAcceptedEvidence` is the exported runtime gate for data loaded from
JSON, reports or future evidence stores. It accepts only a well-evidenced
`pass` or reviewer-approved `not-applicable`; status text alone cannot close a
row.

## Per-slice maintenance rule

Every future UI slice must complete these steps in the same change:

1. Identify every affected route family and state. Add a missing state to the
   TypeScript contract before implementing it.
2. Resolve a `null` route only from its approved ticket/decision, update this
   document and add a path assertion. Never infer a path from a mockup filename.
3. Add fast Vitest/Testing Library evidence for component semantics,
   keyboard behaviour, labels and errors where the component can be tested
   synchronously.
4. Add axe coverage for each deterministic rendered DOM state and require zero
   critical/serious violations.
5. Add Playwright coverage for the real user path, including negative states,
   keyboard/focus, overflow and reduced-motion emulation.
6. Run the mandatory 320-pixel reflow probe and all four core viewports. Add
   relevant breakpoint before/at probes when layout changes there, and approve
   visual baselines at 360, 768, 1280 and 1440 pixels.
7. Record manual evidence and any genuine `not-applicable` reason plus its
   reviewer-agreement trace. Unknown or unavailable evidence is `not-run` or
   `blocked`, never `pass`.
8. Require independent closure review. Any required row outside `pass` or a
   justified `not-applicable` prevents Done.

Rollback for Q1 itself is removal of this document, its TypeScript contract and
its invariant test. A later slice must not roll back failed evidence; it fixes
the regression or remains open.
