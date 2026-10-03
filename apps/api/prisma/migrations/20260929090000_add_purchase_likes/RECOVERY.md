# O3L recovery

If this migration cannot be applied, leave all payment and order history intact
and keep the public Like action unavailable. Do not delete `PaymentAttempt` or
`Order` records to recover. Roll back only the new API route/module after
confirming no `PurchaseLike` row has been written. If rows already exist,
disable Like writes and preserve their positive counters and payment history;
do not reset or split the accumulated totals.
