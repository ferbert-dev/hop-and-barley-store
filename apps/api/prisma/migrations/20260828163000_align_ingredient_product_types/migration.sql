-- C1A aligns the visible ingredient Product Type label with Figma while
-- preserving the stable `malts` identifier and the existing recipe-kit row.

BEGIN;

UPDATE "Category"
SET "name" = 'Malt', "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = '10000000-0000-4000-8000-000000000002'
  AND "slug" = 'malts';

COMMIT;
