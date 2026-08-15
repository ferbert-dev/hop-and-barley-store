# Catalog discovery

C3 implements the public `/` catalog as a server-rendered Next.js App Router
slice. NestJS remains the catalog authority; the web app owns URL parsing,
presentation, responsive layout, and safe user-facing states.

## Request and cache contract

The route calls `GET /api/v1/products` only through the generated
`@hop-and-barley/api-client`. `src/lib/catalog.ts` sends the validated typed
query and `requestInitExt.next.revalidate = 60`. Every canonical public query
therefore has its own 60-second Next cache key. The one-second abort bound keeps
an unavailable local API from hanging the page.

This cache policy applies only to public catalog data. Authenticated, account,
order, admin, session, and CSRF requests must use the private `no-store`
contract from ADR 0001.

## URL state

The URL is the only product-discovery state. The parser accepts these scalar
keys in stable order:

1. `search`
2. `category`
3. `minPriceMinor`
4. `maxPriceMinor`
5. `sort`
6. `page`
7. `limit`

It mirrors the API bounds, normalizes search text to NFC, removes defaults from
the canonical URL, rejects repeated/unknown/list parameters, and redirects
valid noncanonical URLs before contacting the API. Invalid URLs render a safe
recovery action and `API not contacted`; they never become broad catalog
queries accidentally.

The native GET form resets pagination by omitting `page`. Pagination links
preserve the current filters and use a deterministic first/last/current-window
model. Browser Back and Forward restore the exact URL and server-rendered view.

## Rendering boundary

- `app/(catalog)/page.tsx` parses, canonicalizes, loads, and delegates.
- `features/catalog/catalog-screen.tsx` maps paged, legacy, empty, and failure
  results to shared D3 primitives.
- `catalog-controls.tsx` renders labelled native controls and API-owned category
  facets; categories are never hard-coded in the web app.
- `catalog-product.tsx` verifies every API image path against the typed D1 local
  asset manifest before rendering `next/image`.
- `catalog-pagination.tsx` emits 44px targets, an `aria-current` page, and
  noninteractive disabled boundaries.
- only the route `error.tsx` is a client component; filters and results remain
  server-first.

The C2 rollback normalizer is deliberately discriminated. A legacy six-field
array renders with an explicit filtering/paging-unavailable notice and never
invents category, availability, or facet facts. A malformed payload fails
closed as an unavailable catalog.

## Responsive and accessibility contract

- below `48rem`: one-column form and one-column product grid;
- `48rem` through `63.999rem`: two-column form and product grid;
- at `64rem` and wider: filter sidebar plus three-column product grid;
- all Q1 probe widths allow at most one CSS pixel of unexpected horizontal
  overflow;
- every visible catalog link, button, input, and select is at least 44 CSS
  pixels high;
- labels, named navigation, live result counts, status/alert semantics, visible
  focus, reduced motion, and local image alt text are tested.

Playwright covers ready, filtered, empty, loading, and API-error states. The 24
catalog baselines comprise all five states at 360, 768, 1280, and 1440 CSS
pixels plus focused filter, pagination, empty-recovery, and error-retry regions.
Baselines are platform-specific in CI and use the repository-wide 0.2 channel
threshold and 1 percent pixel-difference gate.

The machine-readable C3 evidence scaffold validates the exact 135 Q1
state/check/channel mappings and recomputes all 24 PNG hashes and dimensions.
The current run and manual-review records deliberately remain `pending`: the
presence of local screenshots or test source does not close a mapping. Closure
requires durable passing run records plus an independent reviewer Agent Run URL
and visual/manual decision.

## Verification and rollback

Unit tests lock URL grammar, generated-client transport, route behavior,
component semantics, local assets, and responsive CSS. Browser tests lock URL
navigation/history, server HTML, all Q1 widths, Axe serious/critical results,
loading/error behavior, and visual baselines against the running Docker stack.

Rollback is atomic: restore the former root page, remove the `(catalog)` route
group and `features/catalog`, and restore the C2 no-store loader contract. No
database migration or data rollback belongs to C3.
