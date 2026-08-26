# O2 forward recovery

The migration is additive. Runtime rollback means disabling the order route and
restoring the last O1B-compatible application image while keeping `Order`,
`OrderItem`, the new enums and `CartReservation.orderId` in place.

Do not drop O2 schema after any order exists. Orders own immutable customer,
price and reservation-consumption history; destructive rollback could restore
stock incorrectly or erase financial records.

## Before runtime rollback

1. Stop new order finalization and drain in-flight order requests.
2. Record counts grouped by `Order.paymentMethod`, `Order.paymentState` and
   `Order.status` plus counts of linked `OrderItem` and consumed reservations.
3. Verify every consumed reservation has exactly one order and every order has
   at least one item and one consumed reservation.
4. Deploy the last compatible runtime. Cart flows continue to ignore the
   additive O2 tables and column.
5. Keep order finalization disabled until the O2 runtime is restored or a new
   forward migration and compatible runtime are reviewed together.

Use a new forward migration for any correction. Never use `db push`, edit the
applied migration, turn consumed reservations back to active, or increment
stock from an order row without an approved cancellation/refund design.
