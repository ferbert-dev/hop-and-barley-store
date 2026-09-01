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

The canonical URL is the committed product-discovery state. The parser accepts
these keys in stable order:

1. `search`
2. `category`
3. `minPriceMinor`
4. `maxPriceMinor`
5. `sort`
6. `page`
7. `limit`

`category` may be repeated up to eight times; the API matches any selected
product type because each product has exactly one type. Every other parameter
must be scalar. The parser mirrors the API bounds, normalizes search text to
NFC, removes defaults from the canonical URL, rejects unknown parameters and
invalid repetitions, and redirects valid noncanonical URLs before contacting
the API. Invalid URLs render a safe recovery action and `API not contacted`;
they never become broad catalog queries accidentally.

The client discovery controls commit valid search text after a 300ms debounce,
without a submit button. The sort select commits immediately against the
current search and categories. Product-type checkboxes and the drawer sort
remain staged until `Apply filters`, which commits them, resets pagination, and
closes the drawer. Pagination links preserve the current filters and use a
deterministic first/last/current-window model. Browser Back and Forward restore
the exact URL and server-rendered view.

## Rendering boundary

- `app/(catalog)/page.tsx` parses, canonicalizes, loads, and delegates.
- `features/catalog/catalog-screen.tsx` maps paged, legacy, empty, and failure
  results to shared D3 primitives.
- `catalog-controls.tsx` is the focused client boundary for debounced search,
  the sort select, and the modal filter drawer. It renders API-owned category
  facets dynamically; categories are never hard-coded in the web app.
- `catalog-product.tsx` verifies every API image path against the typed D1 local
  asset manifest before rendering `next/image`.
- `catalog-pagination.tsx` emits 44px targets, an `aria-current` page, and
  noninteractive disabled boundaries.
- results remain server-rendered while the discovery controls and route
  `error.tsx` are client components.

The rollback normalizer is deliberately discriminated. A legacy six-field
array renders with an explicit filtering/paging-unavailable notice. The
immediate predecessor paged envelope also remains supported: its scalar/null
category is normalized to the equivalent zero-or-one item list, and missing
facet counts remain absent rather than being invented. A malformed payload
fails closed as an unavailable catalog.

## Responsive and accessibility contract

- below `48rem`: stacked discovery controls, a full-width filter drawer, and a
  one-column product grid;
- `48rem` through `63.999rem`: compact discovery controls, a right-side filter
  drawer, and a two-column product grid;
- at `64rem` and wider: compact discovery controls, a right-side filter drawer,
  and a four-column product grid;
- all Q1 probe widths allow at most one CSS pixel of unexpected horizontal
  overflow;
- every visible catalog link, button, input, and select is at least 44 CSS
  pixels high;
- labels, named navigation, live result counts, status/alert semantics, visible
  focus, reduced motion, and local image alt text are tested.

Playwright covers ready, filtered, empty, loading, and API-error states at all
Q1 probes. It checks layout columns, overflow, minimum target size, keyboard
navigation, visible focus, accessible names, Axe results, reduced motion,
titles, live announcements, URL history and recovery behavior directly in the
running application.

Test screenshots, traces, reports and generated evidence ledgers are temporary
diagnostics and are not retained in Git or uploaded by CI. Closure uses the
green exact-head checks, a concise PR/Agent Run summary and an independent
reviewer verdict.

## Verification and rollback

Unit tests lock URL grammar, generated-client transport, route behavior,
component semantics, local assets, and responsive CSS. Browser tests lock URL
navigation/history, server HTML, all Q1 widths, Axe serious/critical results,
loading/error behavior, focus visibility and responsive layout against the
running Docker stack.

Application rollback restores the predecessor catalog route and client. The
database migration may be rolled back separately with its checked `down.sql`;
the generated full-text-search column and GIN index contain derived data only.
