# O0 forward recovery

This migration is additive. If the cart runtime must be rolled back after it is
applied, disable `CartModule`, clear both supported cart cookie names at the
edge/application boundary, and leave `Cart` and `CartItem` in place. Correct the
schema or data with a new forward migration after inspecting affected rows.

Do not edit the applied migration, reset a database, drop shared data, or use
`db push`. Before a later destructive cleanup, prove that no deployed version
still reads these tables and take the environment's approved backup.
