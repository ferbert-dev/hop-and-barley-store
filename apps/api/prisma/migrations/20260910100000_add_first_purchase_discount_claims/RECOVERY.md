# O2D recovery

This migration is additive for historical orders. Existing rows receive the
explicit `NONE`, zero-discount, `no-discount-v1` snapshot and retain their
original subtotal, shipping, total, currency, ownership, and payment outcome.

If deployment fails before the migration commits, PostgreSQL rolls the entire
transaction back. Fix the failure and deploy again.

After successful deployment, prefer disabling creation of new discounted
payment attempts in application code. Do not delete attempt, item, claim, or
order history: unresolved attempts and claimed discounts must remain available
for later reconciliation. A code rollback may leave the additive tables and
columns in place because old code does not read them.

Do not reverse this migration while any `PaymentAttempt` or
`FirstPurchaseDiscountClaim` rows exist. Export and reconcile those records
before a separately reviewed destructive rollback.
