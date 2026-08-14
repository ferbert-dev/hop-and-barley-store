# Hop & Barley UI primitives

This D3 slice provides the smallest shared component set required by the
confirmed catalog, product, cart, checkout, authentication and account tickets.
It uses the accepted D1 tokens and Q1 acceptance gates; it does not implement
routes, data fetching or feature state.

## Public API

Import from `src/components/ui`:

| Primitive      | Intentional contract                                                                                                                                                                                                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Button`       | Renders a native `button`, or a native link when `href` is present. Confirmed variants are `primary`, `secondary` and `danger`. Native buttons support `disabled` and `pending`; unavailable links are omitted by their caller instead of pretending to be disabled links.                                                                                         |
| `Field`        | Native input with a required visible `label` and explicit `id`; optional description and error are wired through stable IDs, `aria-describedby`, `aria-errormessage` and `aria-invalid`. Void-element content props are excluded from its type and stripped at runtime.                                                                                            |
| `Select`       | The same labelled/error contract around a native select.                                                                                                                                                                                                                                                                                                           |
| `Card`         | Neutral visual container with no implied domain behavior.                                                                                                                                                                                                                                                                                                          |
| `ProductCard`  | Pure product surface accepting already-resolved media, name, href, price, description and optional badge slots. It performs no fetch and owns no inventory/cart rules.                                                                                                                                                                                             |
| `Price`        | Renders a semantic `data` value from safe-integer `minorUnits`, uppercase ISO currency and optional locale. Currency fraction digits come from `Intl.NumberFormat`; an exact decimal string avoids floating-point division, and unsupported runtimes fail closed. The default locale is `en-GB`. The formatter retains `formatPrice(minorUnits, currency)` for D2. |
| `Badge`        | Non-live inline label with `neutral`, `success`, `warning` and `danger` token-backed tones. Callers supply the status wording.                                                                                                                                                                                                                                     |
| `LoadingState` | Polite `status` with `aria-busy`; no motion is required to understand it.                                                                                                                                                                                                                                                                                          |
| `EmptyState`   | Polite `status` for a completed empty result.                                                                                                                                                                                                                                                                                                                      |
| `ErrorState`   | Assertive `alert` for a failed operation or load.                                                                                                                                                                                                                                                                                                                  |
| `Dialog`       | Controlled native modal dialog with explicit title/description IDs, a 44 px close control, native modal focus trapping and Escape cancellation, plus explicit trigger-focus restoration. A queued close event from an earlier lifecycle is ignored after an immediate reopen.                                                                                      |

All primitives except `Dialog` are pure components without a client directive.
`Dialog` is the sole client boundary because it synchronizes the native
`showModal()`/`close()` lifecycle with controlled React state. Native modal mode
provides the browser focus trap; the component handles Escape via `cancel` and
restores the element focused before opening.

## Accessibility and visual contract

- Interactive controls have a `44×44` CSS-pixel minimum target.
- Keyboard focus uses a 3 px visible outline with an offset.
- Text, surfaces, borders, semantic tones and the modal backdrop use D1
  variables only.
- Transitions use D1 duration tokens and are explicitly removed for
  `prefers-reduced-motion: reduce`.
- Field errors are visible text and never color-only.
- Loading, empty and error announcements are distinct; a badge is not a live
  region by default.
- Product imagery is a caller-provided slot so downstream routes can use the D1
  asset manifest with `next/image` and the correct responsive `sizes` value.

## Deliberate deferrals

D3 does not add a theme engine, Storybook, form library, icon library, dialog
dependency, axe dependency, generic polymorphic `as` API, route-aware link
wrapper, animation system, feature hooks or data clients. D2 owns the shell;
catalog/product/cart/checkout/auth/account/admin tickets own their routes,
backend calls, permissions and business state. Those slices must add axe,
Playwright, visual and manual Q1 evidence when real route states exist.

Rollback is limited to removing `src/components/ui`, this document and the D3
tests, plus restoring the previous `formatPrice` signature.
