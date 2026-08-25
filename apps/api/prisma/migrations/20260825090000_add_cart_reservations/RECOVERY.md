# O1B forward recovery

This migration is additive and preserves existing carts and cart lines. If the
reservation runtime must be rolled back after the migration is applied, deploy
a compatible application version that ignores `CartReservation` and
`CartItem.currentReservationId`, and leave the new schema and history in place.

Correct schema or data with a new forward migration after inspecting affected
rows. Do not edit the applied migration, reset a database, drop shared cart or
reservation data, or use `db push`. Before any later destructive cleanup, prove
that no deployed version reads these fields and take the environment's approved
backup.
