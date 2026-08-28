# ADR 0004: Persist product lifecycle windows for administrator listing

- **Status:** Accepted — M2 execution contract
- **Date:** 2026-08-28
- **Decision owner:** M2 root orchestrator
- **Scope:** Product lifecycle fields and the administrator product listing

## Context

The Figma administrator product frame (`admin/products`, node `33:734`)
defines a Product Management tab, an Add Product control, Edit controls on
rows, and a populated product table with pagination. It does not define a
complete lifecycle vocabulary, window editing flow, or storefront visibility
rule. M2 therefore needs a durable read/listing contract without taking on
the product mutation or public-catalog work assigned to later tickets.

## Decision

`Product` gains two nullable `timestamptz(3)` fields:

- `activeFrom`
- `activeUntil`

Neither field has a default and existing rows are not backfilled. When both
values are non-null, the database enforces `activeUntil > activeFrom`.
`isActive` remains the manual enable/disable flag.

The administrator listing derives one display status using a captured `now`
instant and this precedence:

1. `DISABLED` when `isActive` is false.
2. `SCHEDULED` when `activeFrom > now`.
3. `EXPIRED` when `activeUntil <= now`.
4. `ACTIVE` otherwise.

The listing may show the lifecycle status and the nullable window values in a
human-readable form. It must not expose credentials, `imagePath`, or internal
filesystem/path text. The administrator page retains the approved Product
Management/Dashboard tabs, a product table/list, price, category, human stock
information, Add Product and Edit links, and pagination when the fixture has
more than one page.

The public catalog continues its current `isActive`-only behavior in M2.
M4 owns lifecycle mutations and storefront window enforcement. The admin
listing is read-only for this decision; M2 does not assume that Add or Edit
destinations are implemented or submit either form. Navigation follows the
only add/edit form route named by the supplied Figma: create links use
`/admin/add`, while a row's edit link carries its encoded product identifier as
`/admin/add?productId=<id>`. M3/M4 own interpreting that intent and all form or
mutation behavior.

## Alternatives considered

1. **Overload `isActive` and persist no window:** rejected. It cannot represent
   a future activation or an expiry while retaining manual disablement, and it
   would discard the lifecycle intent needed by later mutation work.
2. **Change public visibility in M2:** rejected. It couples an administrator
   listing/read contract to storefront behavior and expands the ticket's
   blast radius before M4's mutation and enforcement contract exists.
3. **Create a separate lifecycle table:** rejected. It adds joins and a second
   lifecycle authority for a pair of attributes that belong to `Product`, with
   no current need for history or multiple windows.

## Consequences

The schema can represent future, active, expired, and manually disabled
products without changing the existing public catalog contract. Capturing one
`now` value for a listing makes boundary classification deterministic and
prevents a row crossing a time boundary during one response from receiving
different interpretations.

The temporary negative consequence is intentional: direct data setup and tests
can hold lifecycle windows before M4, but the storefront ignores those windows
until that ticket ships. M2 also cannot create or edit windows from the UI; the
listing exposes the read model while mutation ownership remains with M4.

## Verification

- Schema/migration tests prove nullable fields, no default/backfill, and the
  `activeUntil > activeFrom` check.
- Administrator API tests prove the captured-now precedence and a neutral
  authorization boundary.
- Connected browser acceptance covers anonymous redirect, customer neutral
  denial, verified administrator listing content, human price/category/stock
  and lifecycle/window values, Add/Edit links, pagination where the fixture
  permits, keyboard focus, responsive overflow, storage-zero behavior, and
  serious/critical Axe findings.
- Unavailable API runs remain fail-closed/neutral and do not require a
  fabricated M2 screen.

## Rollback

Remove the M2 administrator listing adapter and its route-owned tests. A schema
rollback may remove only the two nullable lifecycle columns and their check
constraint after confirming no later migration depends on them; restore the
M1 static admin shell and the existing `isActive`-only public catalog. Do not
change the session authority or M1 nested route authorization.
