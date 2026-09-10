# Provider-neutral payment-attempt boundary

O2D prepares an immutable payment snapshot before any provider integration. A
snapshot owns exact product lines, contact and delivery details, EUR subtotal,
discount policy, undiscounted EUR 5 shipping, and total. Only lifecycle fields
may change after the creation transaction seals at least one exact line and
commits. PostgreSQL rejects unsealed commits, later item insertion/update/delete,
attempt deletion, and replacement of an attached provider reference. No route
in this module contacts Stripe or enables a card payment; O2P owns that provider
boundary.

Eligible authenticated customers acquire one durable `CLAIMED`
first-purchase-discount row when an attempt is prepared. A PostgreSQL partial
unique index allows only one `CLAIMED` or `CONSUMED` row per account. Existing
`PAID` orders in any currency disqualify the account. Guest attempts never have
a claim. Cash on Delivery is not treated as a completed paid purchase by this
policy because its current lifecycle has no canonical paid transition.

The claim stays attached through `PREPARED`, `PENDING`, and
`RECONCILIATION_REQUIRED`. Only a definitive failed or cancelled-unpaid outcome
releases it. A successful, exact-match paid order consumes it in the same
transaction as the attempt transition. Exact match includes the account,
provider reference, every item snapshot field, and all financial fields; callers
that create the order in O2P must call `markPaymentAttemptSucceeded` with their
existing Prisma transaction. Deferred database checks enforce the same final
attempt, claim, and order state from every mutation direction, including later
changes to the linked order or its items. A successful order therefore cannot be
created in one transaction and linked to the attempt in another; idempotent
settlement replays may call the helper again with a new transaction.
Account deactivation does not block settlement of an already captured payment,
but it does block preparation of a new attempt.

Rollback disables new discounted attempt preparation while preserving attempts,
items, claims, orders, and reconciliation processing. See the migration recovery
file for the database boundary.
