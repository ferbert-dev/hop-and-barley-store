# ADR 0003: Guard the M1 admin route in a nested server layout

- **Status:** Accepted — evolved by M2/M3 leaf-route authorization
- **Date:** 2026-08-28
- **Decision owner:** M1 root orchestrator
- **Scope:** `/admin/**` route ownership, server authorization, and M1 shell navigation

## Context and evidence

**Implemented:** the root Next.js layout owns `CartProvider` and
`StorefrontShell`; that shell renders the shared header, one `main` landmark,
and the storefront footer. A nested layout cannot remove that inherited chrome.

**Implemented:** Nest owns the current opaque session and current user role.
`GET /api/v1/admin/capabilities` is an administrator-only capability endpoint.
The session and capability responses are private and no-store.

**Confirmed by Figma:** nodes `33:734` and `33:1520` establish the Product
Management/Dashboard tab structure and an admin content shell. They do not
define admin error, loading, access-denied, or CRUD behavior.

## Decision

M1 keeps the root shell intact and introduces a nested `/admin` layout only for
server authorization. Reworking every existing storefront route into a new
route group solely to remove the inherited footer is deferred: it would be a
cross-route migration outside this authorization ticket.

```text
app/layout.tsx (root HTML + CartProvider + StorefrontShell)
└── admin/layout.tsx (server capability authorization)
    ├── admin/page.tsx → /admin/products after authorization
    └── admin/products/page.tsx → M1 static shell
```

The admin layout reads the incoming host-only session cookie only on the server
and calls the generated-client capability endpoint with `cache: 'no-store'`.
It handles results as follows:

| Capability result                                                 | Route behavior                                 |
| ----------------------------------------------------------------- | ---------------------------------------------- |
| `401` / no session                                                | Let the leaf choose its exact safe `next` path |
| `200` with the expected capability                                | Render the nested route                        |
| `403`, malformed body, cache-policy failure, or transport failure | `notFound()` — fail closed without role detail |

From M3 onward, the parent layout still performs the Nest capability check but
does not choose one return destination for every child. An anonymous request is
allowed to reach the leaf so `/admin/products` can redirect to
`/login?next=%2Fadmin%2Fproducts` and `/admin/add` can redirect to
`/login?next=%2Fadmin%2Fadd`. A customer, malformed private response, cache
failure or transport failure remains a neutral `notFound()` at the parent.
`/admin` redirects to `/admin/products`; that leaf owns its anonymous redirect.
`/admin/products` contains no product list, CRUD, upload, inventory, schedule,
or dashboard metrics. Its Product Management tab is current; Dashboard is
visible but `aria-disabled` and non-interactive until M6.

The shared header may show `Product Management` only for a current
Nest-verified `ADMIN` session. This is a navigation convenience; entering an
admin URL is always checked again by the nested server layout and Nest.

Nest registers the administrator guard globally. Every request whose path is
the exact `/api/v1/admin` namespace or a child of it requires a current active
`ADMIN` principal even when a controller author accidentally omits
`@AdminOnly()`. The decorator remains useful for OpenAPI documentation and for
explicitly protecting an administrator operation outside that namespace, but
it is not what activates the namespace boundary.

There is no M1-specific loading or error presentation because the static shell
has no independent data state. The root shell owns the shared landmarks; the
nested layout owns the authorization redirect/not-found boundary.

## Alternatives considered

1. **Client-side role check:** rejected because it exposes a route before Nest
   authorization and can become stale after a role change.
2. **Move storefront routes into a route group:** deferred. It can exclude the
   footer but moves existing authenticated, catalog, cart, and product routes,
   their layouts, and their tests outside M1's vertical scope.
3. **Custom customer-denied screen:** rejected. Figma does not define one;
   `notFound()` provides a neutral, non-enumerating response.

## Consequences

**Positive:** the actual Nest authorization boundary is reached on every admin
render, role/status changes take effect on the next request, and M1 does not
invent product behavior or role-specific UI.

**Negative:** admin inherits the existing storefront footer until a dedicated,
reviewed route-shell redesign changes the root ownership. This is intentional
documented drift, not evidence that the Figma frame defines a footer.

## Verification and rollback

Tests cover anonymous redirect, customer/unavailable neutral denial, verified
admin shell rendering, disabled Dashboard semantics, header visibility, and
the nested layout's authorization matrix. Browser verification must cover the
anonymous/customer/admin paths against the real Nest capability endpoint.

Rollback removes the nested `app/admin` routes, the admin capability transport
and static shell, and the conditional header link. It does not alter existing
storefront route ownership or session authority.
