-- F5 adds a stored search document so public catalog search uses PostgreSQL
-- full-text search without rebuilding the vector at request time.

BEGIN;

ALTER TABLE "Product"
ADD COLUMN "searchDocument" tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', coalesce("name", '')), 'A') ||
  setweight(to_tsvector('simple', coalesce("teaser", '')), 'B') ||
  setweight(to_tsvector('simple', coalesce("description", '')), 'C')
) STORED;

CREATE INDEX "Product_searchDocument_idx"
ON "Product" USING GIN ("searchDocument");

COMMIT;
