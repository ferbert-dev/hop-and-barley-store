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

## Verification

Vitest/React Testing Library covers landmarks, manifest paths, active-route
mapping, disclosure state, Tab, Escape with focus return, link/pathname/resize
closure and the 64rem/44px CSS invariants.

Playwright verifies keyboard-only use, visible focus, every Q1 viewport for at
most one CSS pixel of unexpected horizontal overflow, loaded shell assets,
reduced motion, both mobile-menu states with axe, the exact open `/` → `/cart`
→ Back `/` regression, a 44px brand target at all probes, API-unavailable
rendering and one main landmark.

The repository intentionally retains no Playwright screenshots, traces,
reports or generated evidence ledgers. A completed PR records only the concise
check summary, exact head SHA, CI links and independent reviewer verdict in
GitHub and the linked Agent Run. Runtime product and design assets remain
tracked separately under `apps/web/public/assets`.
