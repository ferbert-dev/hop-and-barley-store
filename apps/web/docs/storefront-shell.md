# Responsive storefront shell

D2 moves the shared storefront frame into the root App Router layout without
changing cart behaviour or backend ownership. C2 now routes catalog reads
through the generated `@hop-and-barley/api-client` path and the shared
compatibility normalizer. C3 owns the public catalog route and supplies typed
query parameters with a 60-second Next revalidation hint. It renders either
`API connected`, `API unavailable`, or `API not contacted` in a status region;
it contains no raw fetch DTO or cast. Authenticated/private requests remain
outside this public caching contract and must use `private, no-store`.

## Component boundary

- `StorefrontShell` is a synchronous Server Component. It owns the skip link,
  the single `main#main-content` landmark and the shared footer.
- `SiteFooter` is a Server Component with a labelled `contentinfo` landmark.
- `SiteHeader` is the only client component in this shell. It uses
  `usePathname` to key a disclosure instance per route. Route changes unmount
  the old state, so browser Back/Forward cannot restore a stale open menu.
- Navigation contains only confirmed routes: Products (`/`, also current for
  `/product/*`) and Shopping cart (`/cart`). No auth/account routes are
  inferred by this slice.

The header and footer use `brandMark`, `cartIcon` and `footerHops` from the D1
typed local asset manifest. They do not load fonts, icons or images from a CDN.

## Responsive and input behaviour

- Below `64rem`, the navigation is an inline disclosure. Its trigger is at
  least 44 by 44 CSS pixels and exposes `aria-controls` and `aria-expanded`.
- The brand/home link is also at least 44 CSS pixels high at every Q1 probe.
- Native Tab order moves from the trigger into the disclosed links. Escape
  closes the disclosure and returns focus to the trigger.
- Link activation and pathname changes close it. Crossing to `64rem` or wider
  also closes it, then CSS exposes the desktop navigation and hides the trigger.
- D1 page gutters change at 30, 48 and 64rem. Q1 probes cover 320, 360, 375,
  breakpoint edges, 768, 1280 and 1440 CSS pixels.
- The reduced-motion media query removes shell transition duration and keeps
  document scrolling `auto`.
- The banner is named `Hop and Barley storefront`. Cart links disable prefetch
  until the `/cart` route is implemented by its own vertical slice.

## Automated evidence

Vitest/React Testing Library covers landmarks, the manifest paths, active-route
mapping, disclosure state, Tab, Escape with focus return, link/pathname/resize
closure and the 64rem/44px CSS invariants.

Playwright checks keyboard-only use, every Q1 viewport for at most one CSS pixel
of unexpected horizontal overflow, reduced motion, both mobile-menu states with
axe, the exact open `/` → `/cart` → Back `/` regression, a 44px brand target at
all probes, API-unavailable rendering and one main landmark.

Visual comparisons are real `toHaveScreenshot` assertions. The global
Playwright contract is `threshold: 0.2`, `maxDiffPixelRatio: 0.01`, disabled
animations, hidden carets and CSS-pixel scale. Baselines live at
`apps/e2e/tests/__screenshots__/storefront-shell.spec.ts/`:

- `compact-mobile-360-shell-{header,footer}.png`
- `tablet-768-shell-{header,footer}.png`
- `desktop-1280-shell-{header,footer}.png`
- `canvas-at-shell-{header,footer}.png`
- `mobile-navigation-open.png`
- `mobile-visible-focus.png`
- `api-unavailable-hero.png`

The four shell pairs hide only `main` during capture. This isolates the shared
D2 shell from future catalog content and makes the same baseline valid for both
connected and unavailable API runs. The unavailable regression reuses the
desktop header/footer pair; `api-unavailable-hero.png` is retained as the
historical D2 route-content reference, while C3 owns the current loading and
error catalog baselines. `visual-stability.css` changes only scroll behaviour
during screenshot capture. It does not alter rendered appearance.

The machine-readable evidence contract is deliberately not a cartesian
state/check/channel pass generator. Its 108 explicit evidence records match an
independently derived Q1 required set across `default`, `mobile-navigation-open`,
`keyboard-navigation` and `api-unavailable`:

- `d2-playwright-connected.json` and `d2-playwright-unavailable.json` contain
  the exact command, mode, UTC interval, Node/pnpm versions and ten named test
  outcomes for each browser run.
- `d2-vitest.json` records the exact focused unit command and its eleven named
  outcomes.
- `d2-visual-baselines.json` contains every one of the eleven PNG paths,
  dimensions, SHA-256 values, Q1 viewports, states and check mappings. Evidence
  sets reference all eleven baselines without inventing source-file fragments.
- `d2-manual-review.json` records only observations explicitly approved by the
  independent repeat review and separately lists observations it did not claim
  to perform.

Every passing ledger artifact has the form `JSON path#record ID`. The validator
loads the record, proves its state/check/channel mapping and timestamp, and
recomputes PNG bytes and dimensions. It rejects source-only references,
checklists, missing or duplicate mappings and unknown record IDs. The 46
non-applicable records cover state/channel combinations the D2 runs do not
exercise, including errors in states with no error and route announcements
outside this slice. Each has a null artifact, a precise reason and the
independent review URL as reviewer agreement; none is disguised as a pass.

`@axe-core/playwright@4.13.0` is the only D2 test dependency and is recorded in
the workspace lockfile. The suite runs the distinct WCAG 2.0 A/AA, 2.1 A/AA and
2.2 AA tags and fails on serious or critical violations. Axe's WCAG 2.2 target
size rule is disabled upstream by default, so the stricter project 44px target
is asserted directly at all twelve Q1 probes.

## Independent manual-review result

The repeat reviewer Agent Run is
`https://app.notion.com/p/3bcd78850eab819b8710db5b5c1277ea?pvs=204`.
It failed the old fabricated ledger while explicitly approving all eleven
visuals, the all-probe target measurements, history-state regression, banner
name, Axe, overflow, reduced motion and visual-mismatch failure behaviour.

The correction Agent Run then performed and recorded a real Chromium keyboard
session at 360px, an open-menu 1023-to-1024px transition, and a 320px
API-unavailable reflow/status inspection. Those completed observations have
their own timestamp and record IDs. The only remaining observation is operating
the browser's native zoom control at 400 percent; the Q1 320px equivalent was
inspected, but the native-zoom item stays `not-reviewed` and is not referenced
by any closing evidence record.
