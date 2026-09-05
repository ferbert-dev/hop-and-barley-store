# Product detail

P1 delivers `/product/[slug]` as a server-first Next.js route backed by the
generated NestJS client. One shared template renders every accepted C1 product;
there is no product-specific page code or copied template markup.

## Data and rendering contract

- NestJS owns public visibility and returns only active EUR products.
- Unknown, inactive and non-EUR slugs share one generic not-found result.
- Exact stock stays private; the page receives only `in-stock` or
  `out-of-stock`.
- Ordered JSON specifications are validated by the API, generated contract and
  web adapter before rendering.
- `imagePath` must exactly match the typed local asset manifest for the slug;
  mismatches fail closed through the route error boundary.
- Next fetches through `@hop-and-barley/api-client` with a 60-second public
  revalidation hint and a one-second upstream timeout.
- `generateMetadata` uses the same request-scoped cached loader as the page.
- The production-runtime contract proves one upstream read for page plus
  metadata, independent cache entries per slug, an exact 60-second fetch-cache
  value, and no cache entry for a failed upstream response so recovery can be
  retried immediately.

## Route states

| State        | User outcome                                    |
| ------------ | ----------------------------------------------- |
| Loading      | Polite `Loading product details` status         |
| In stock     | Full detail with an `In stock` success badge    |
| Out of stock | Same template with no exact quantity disclosure |
| Not found    | Safe explanation and `Back to products` link    |
| API error    | Assertive safe error with a route-bound retry   |

The route uses the shared storefront shell, D1 assets/tokens and D3 UI
primitives. It reflows from one content column to a two-column media/summary
layout at the accepted 48rem boundary; the technical specification list remains
readable at 320px without horizontal overflow.

The accepted D1 asset manifest and local HTML reference are the reproducible
design evidence for this slice. The shared Figma file was not readable through
the connector during preflight, so P1 makes no frame-specific Figma-fidelity
claim.

## Verification and scope

Unit tests lock generated-client transport, malformed-response handling,
ordered specifications, asset matching, availability and the shared template.
API HTTP/OpenAPI tests lock the public DTO and generic 404. A disposable
PostgreSQL 17.6 suite proves the real 12-product data path, while Playwright
opens every seeded detail page and exercises loading, in-stock, out-of-stock,
not-found and API-error states in Chromium. A separate isolated production
Next.js run checks server HTML and cache behavior without using the shared
Compose stack.

P1 verification is intentionally lightweight. Unit, API, PostgreSQL and
Chromium tests report their pass/fail result through the pull-request checks.
The browser suite verifies responsive layout, overflow, focus visibility,
reduced motion, accessible names and recovery behavior with executable
assertions. It does not create or commit screenshots, visual baselines, traces
or generated evidence ledgers.

P1 deliberately does not implement reviews or add-to-cart. Those controls are
absent rather than disabled placeholders and arrive through later vertical
slices with their own backend rules and acceptance evidence.
