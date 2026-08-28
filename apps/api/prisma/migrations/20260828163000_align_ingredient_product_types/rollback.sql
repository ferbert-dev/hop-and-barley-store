-- C1A rollback restores only the previous visible label.

BEGIN;

UPDATE "Category"
SET "name" = 'Malts', "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = '10000000-0000-4000-8000-000000000002'
  AND "slug" = 'malts';

COMMIT;
