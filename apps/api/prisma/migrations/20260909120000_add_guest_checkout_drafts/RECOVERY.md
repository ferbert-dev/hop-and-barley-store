# O2G forward recovery

O2G is additive: it creates private pre-payment draft tables and an enum. It
does not rewrite users, carts, orders, order items, inventory, or historical
ownership. The safest runtime rollback is to disable the checkout-draft routes
and restore the last compatible API image while retaining the additive schema.

Before a runtime rollback, stop new checkout-draft writes and record draft and
idempotency-request counts. Existing cart and authenticated order flows ignore
the O2G tables. Do not expose stored contact or delivery data during diagnosis.

If the schema must later be removed, first prove the O2G runtime is no longer
deployed and no payment/order workflow references a draft. Export only the
minimum operational counts required by policy, then use a separately reviewed
forward migration to drop `CheckoutDraftRequest`, `CheckoutDraft`, and finally
`CheckoutDraftStatus`. This deliberately deletes abandoned pre-payment PII but
must never delete carts or orders.

Never edit this applied migration, reset PostgreSQL, use `db push`, delete a
volume, make expired guest capabilities valid again, or copy capability digests
into logs or responses.
