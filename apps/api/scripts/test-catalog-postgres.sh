#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
container_name="hop-barley-c1-postgres-${$}"
database_user='hopbarley_c1'
database_password='hopbarley_c1_fixture'

cleanup() {
  docker stop "$container_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --rm --detach \
  --name "$container_name" \
  --env POSTGRES_DB=fresh_catalog \
  --env POSTGRES_PASSWORD="$database_password" \
  --env POSTGRES_USER="$database_user" \
  --publish 127.0.0.1::5432 \
  postgres:17.6-alpine >/dev/null

ready_count=0
for _ in $(seq 1 60); do
  ready_count=$(docker logs "$container_name" 2>&1 | grep -c 'database system is ready to accept connections' || true)
  if (( ready_count >= 2 )); then
    break
  fi
  sleep 0.5
done

test "$ready_count" -ge 2
docker exec "$container_name" pg_isready -U "$database_user" -d fresh_catalog >/dev/null
published_address=$(docker port "$container_name" 5432/tcp)
database_port=${published_address##*:}
fresh_url="postgresql://${database_user}:${database_password}@127.0.0.1:${database_port}/fresh_catalog?schema=public"
upgrade_url="postgresql://${database_user}:${database_password}@127.0.0.1:${database_port}/upgrade_catalog?schema=public"

docker exec "$container_name" createdb -U "$database_user" upgrade_catalog
docker exec "$container_name" createdb -U "$database_user" unknown_catalog

docker exec --interactive "$container_name" psql \
  --set ON_ERROR_STOP=1 --username "$database_user" --dbname upgrade_catalog \
  < "$repo_root/apps/api/prisma/migrations/20260814104924_init/migration.sql"

docker exec --interactive "$container_name" psql \
  --set ON_ERROR_STOP=1 --username "$database_user" --dbname upgrade_catalog <<'SQL'
INSERT INTO "Product" ("id", "name", "slug", "description", "priceMinor", "currency", "updatedAt")
VALUES
  ('00000000-0000-4000-8000-000000000001', 'House Lager', 'house-lager', 'Clean, crisp and brewed for long afternoons.', 499, 'EUR', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000002', 'Citrus Pale Ale', 'citrus-pale-ale', 'Citrus-forward pale ale with a balanced finish.', 549, 'EUR', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000003', 'Citra Hops', 'citra-hops', 'Approved target row present before C1.', 599, 'USD', CURRENT_TIMESTAMP);
SQL

docker exec --interactive "$container_name" psql \
  --set ON_ERROR_STOP=1 --username "$database_user" --dbname upgrade_catalog \
  < "$repo_root/apps/api/prisma/migrations/20260814153000_expand_catalog/migration.sql"

upgrade_backfill=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname upgrade_catalog \
  --command 'SELECT count(*) || '"'"':'"'"' || count(*) FILTER (WHERE NOT "isActive") || '"'"':'"'"' || (SELECT count(*) FROM "Category" WHERE "slug" = '"'"'legacy-foundation'"'"') FROM "Product";')
test "$upgrade_backfill" = '3:3:1'

docker exec --interactive "$container_name" psql \
  --set ON_ERROR_STOP=1 --username "$database_user" --dbname unknown_catalog \
  < "$repo_root/apps/api/prisma/migrations/20260814104924_init/migration.sql"
docker exec "$container_name" psql --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname unknown_catalog \
  --command 'INSERT INTO "Product" ("id", "name", "slug", "description", "priceMinor", "currency", "updatedAt") VALUES ('"'"'00000000-0000-4000-8000-000000000099'"'"', '"'"'Unknown'"'"', '"'"'unknown-product'"'"', '"'"'Must fail closed.'"'"', 1, '"'"'USD'"'"', CURRENT_TIMESTAMP);' >/dev/null
if docker exec --interactive "$container_name" psql \
  --set ON_ERROR_STOP=1 --username "$database_user" --dbname unknown_catalog \
  < "$repo_root/apps/api/prisma/migrations/20260814153000_expand_catalog/migration.sql" >/dev/null 2>&1; then
  echo 'Expected C1 migration to reject an unknown pre-C1 product slug' >&2
  exit 1
fi

seed_twice_and_verify() {
  local database_url=$1
  local database_name=$2

  DATABASE_URL="$database_url" pnpm --dir "$repo_root" --filter @hop-and-barley/api db:seed
  local first_ids
  first_ids=$(docker exec "$container_name" psql --tuples-only --no-align \
    --username "$database_user" --dbname "$database_name" \
    --command 'SELECT string_agg("id"::text || '"'"':'"'"' || "slug", '"'"','"'"' ORDER BY "slug") FROM "Product";')

  DATABASE_URL="$database_url" pnpm --dir "$repo_root" --filter @hop-and-barley/api db:seed
  local second_ids
  second_ids=$(docker exec "$container_name" psql --tuples-only --no-align \
    --username "$database_user" --dbname "$database_name" \
    --command 'SELECT string_agg("id"::text || '"'"':'"'"' || "slug", '"'"','"'"' ORDER BY "slug") FROM "Product";')

  test "$first_ids" = "$second_ids"
  local final_state
  final_state=$(docker exec "$container_name" psql --tuples-only --no-align \
    --username "$database_user" --dbname "$database_name" \
    --command 'SELECT (SELECT count(*) FROM "Product") || '"'"':'"'"' || (SELECT count(*) FROM "Category") || '"'"':'"'"' || (SELECT count(*) FROM "Category" WHERE "slug" = '"'"'legacy-foundation'"'"') || '"'"':'"'"' || (SELECT count(*) FROM "Product" WHERE "slug" IN ('"'"'house-lager'"'"', '"'"'citrus-pale-ale'"'"')) || '"'"':'"'"' || (SELECT count(*) FROM "Product" WHERE "currency" = '"'"'USD'"'"' AND "stockQuantity" = 100 AND "isActive");')
  test "$final_state" = '12:5:0:0:12'
}

seed_twice_and_verify "$upgrade_url" upgrade_catalog
upgrade_citra_id=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname upgrade_catalog \
  --command 'SELECT "id" FROM "Product" WHERE "slug" = '"'"'citra-hops'"'"';')
test "$upgrade_citra_id" = '20000000-0000-4000-8000-000000000001'

DATABASE_URL="$fresh_url" pnpm --dir "$repo_root" --filter @hop-and-barley/api db:migrate:deploy
seed_twice_and_verify "$fresh_url" fresh_catalog

DATABASE_URL="$fresh_url" NODE_OPTIONS='--experimental-vm-modules' \
  RUN_CATALOG_POSTGRES_INTEGRATION=1 \
  pnpm --dir "$repo_root" --filter @hop-and-barley/api exec jest \
  --config ./test/jest-e2e.json --runInBand --watchman=false \
  test/catalog-postgres.e2e-spec.ts

rollback_path="$repo_root/apps/api/prisma/migrations/20260814153000_expand_catalog/rollback.sql"

run_rollback() {
  # Do not pass --single-transaction: rollback.sql must provide its own atomicity.
  docker exec --interactive "$container_name" psql --no-psqlrc \
    --set ON_ERROR_STOP=1 --username "$database_user" --dbname fresh_catalog
}

docker exec "$container_name" psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname fresh_catalog \
  --command 'CREATE TABLE "RollbackDependency" ("id" INTEGER PRIMARY KEY, "categoryId" UUID NOT NULL, CONSTRAINT "RollbackDependency_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id"));' >/dev/null

if run_rollback < "$rollback_path" >/dev/null 2>&1; then
  echo 'Expected the C1 rollback to fail while Category has an unexpected dependency' >&2
  exit 1
fi

rollback_failure_state=$(docker exec "$container_name" psql --no-psqlrc --tuples-only --no-align \
  --username "$database_user" --dbname fresh_catalog \
  --command 'SELECT (to_regclass('"'"'public."Category"'"'"') IS NOT NULL)::int || '"'"':'"'"' || (SELECT count(*) FROM information_schema.columns WHERE table_schema = '"'"'public'"'"' AND table_name = '"'"'Product'"'"' AND column_name IN ('"'"'teaser'"'"', '"'"'priceQualifier'"'"', '"'"'stockQuantity'"'"', '"'"'isActive'"'"', '"'"'imagePath'"'"', '"'"'specifications'"'"', '"'"'categoryId'"'"')) || '"'"':'"'"' || (SELECT count(*) FROM pg_constraint WHERE conrelid = '"'"'public."Product"'"'"'::regclass AND conname IN ('"'"'Product_categoryId_fkey'"'"', '"'"'Product_active_content_check'"'"', '"'"'Product_specifications_array_check'"'"', '"'"'Product_imagePath_local_check'"'"', '"'"'Product_currency_iso_check'"'"', '"'"'Product_stockQuantity_nonnegative_check'"'"', '"'"'Product_priceMinor_nonnegative_check'"'"', '"'"'Product_slug_format_check'"'"')) || '"'"':'"'"' || (SELECT count(*) FROM pg_indexes WHERE schemaname = '"'"'public'"'"' AND tablename = '"'"'Product'"'"' AND indexname IN ('"'"'Product_categoryId_isActive_idx'"'"', '"'"'Product_isActive_priceMinor_idx'"'"')) || '"'"':'"'"' || (SELECT count(*) FROM "Product");')
if [[ "$rollback_failure_state" != '1:7:8:2:12' ]]; then
  echo "Rollback failure was not atomic; got state $rollback_failure_state" >&2
  exit 1
fi

docker exec "$container_name" psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname fresh_catalog \
  --command 'DROP TABLE "RollbackDependency";' >/dev/null

run_rollback < "$rollback_path"
rollback_state=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname fresh_catalog \
  --command 'SELECT (SELECT count(*) FROM "Product") || '"'"':'"'"' || (to_regclass('"'"'public."Category"'"'"') IS NULL)::int || '"'"':'"'"' || (SELECT count(*) FROM information_schema.columns WHERE table_schema = '"'"'public'"'"' AND table_name = '"'"'Product'"'"' AND column_name IN ('"'"'teaser'"'"', '"'"'priceQualifier'"'"', '"'"'stockQuantity'"'"', '"'"'isActive'"'"', '"'"'imagePath'"'"', '"'"'specifications'"'"', '"'"'categoryId'"'"'));')
test "$rollback_state" = '12:1:0'
