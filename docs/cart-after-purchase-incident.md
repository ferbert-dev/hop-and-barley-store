# CART1: adding products after a completed guest purchase

## Observed failure

On 2026-10-13, a returning visitor could not add products to an empty cart.
The storefront displayed `Your cart was refreshed after the change could not
be completed.` This message is a generic mutation-failure fallback, not an
indication that the API restarted or that the cart was repaired.

Read-only production checks established:

- The storefront, product API and cart read endpoint returned HTTP 200.
- `/api/v1/health/ready` reported the database up; all four application
  containers were healthy.
- Access logs between 14:27 and 14:33 UTC showed successful CSRF reads,
  HTTP 422 responses to `POST /api/v1/cart/items`, and successful cart reloads.
  The rejected mutations completed in milliseconds, not at the client timeout.
- Centennial Hops was available. Its 0.7 kg quantity complied with the
  product's 0.1 kg minimum and step; stock was not the blocker.
- Aggregate database inspection found two unexpired guest carts associated
  with PAID orders and SUCCEEDED payment attempts; both carts were empty.
  No personal information, cookies or credentials were retained in this report.
- The visitor confirmed that Chrome failed after completing a purchase and
  leaving a Like, while a fresh Brave session could add products normally.

## Cause and impact

`CartService.lockCart` rejects mutations whenever any order references the
cart. This deliberately protects checkout history. Successful Stripe capture
removes purchased cart lines, but guest authentication still resolves the
browser's cookie to that same historical cart. Consequently the empty cart
loads normally and its CSRF token works, while every subsequent add is rejected.

This affects returning guests retaining a completed-purchase cart capability,
not every fresh visitor. The screenshot and production request sequence match
this defect; the visitor's private cookie was not inspected.

## Repair boundary

Provide a new shopping cart on the next valid add after a completed purchase.
Atomically move the existing shopping capability to the replacement cart and
archive the old cart's capability. Preserve historical cart contents, orders,
checkout drafts and Like rows. After the visitor explicitly resumes shopping,
the old guest checkout is no longer accessible through the current cart;
existing Likes remain counted. A subsequent checkout gets its own draft.
Preserve Origin/CSRF checks and keep unpaid/in-progress order protection.
Do not blindly retry ambiguous mutations or change payment, stock or Like data.

The browser also records a server-confirmed successful payment handoff so that
its obsolete session-storage record does not block the next checkout after
rollover. Pending or unconfirmed handoffs and network failures remain protected.
An older unmarked handoff cannot safely be inferred successful: revisit the
original success page before resuming shopping, or use its Continue shopping
action to clear that handoff.

The pull request must include regression evidence for this lifecycle, including
invalid input and historical-order preservation. Production inspection was
read-only. No production repair, release or deployment is part of this ticket.

## Verification

The isolated local stack passed the completed-purchase-to-new-cart browser
flow: server-confirmed success, header navigation retaining the handoff,
adding 0.7 kg Centennial Hops, cart reload, and saving a new checkout draft.
The old Order and PurchaseLike row fingerprints remained unchanged. PostgreSQL
regressions cover simultaneous rollover adds, stale pre-resolved access,
invalid-add rollback, pending-payment protection and independent next checkout.

Formatting, types, lint, production builds and all API/web unit tests passed.
The selected connected cart/checkout/quantity browser suite passed, including
keyboard/reflow/accessibility checks. Exact-head remote CI and independent
review remain required before any merge.

## Rollback

Revert the ticket-owned change and redeploy through the normal approved release
process. No database migration or destructive restoration is planned.
