#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
container_name="hop-barley-m2-postgres-${$}"
database_user='hopbarley_m2'
database_password='hopbarley_m2_fixture'

cleanup() {
  docker stop "$container_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --rm --detach \
  --name "$container_name" \
  --env POSTGRES_DB=fresh_m2 \
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
docker exec "$container_name" pg_isready -U "$database_user" -d fresh_m2 >/dev/null
published_address=$(docker port "$container_name" 5432/tcp)
database_port=${published_address##*:}
fresh_url="postgresql://${database_user}:${database_password}@127.0.0.1:${database_port}/fresh_m2?schema=public"

DATABASE_URL="$fresh_url" pnpm --dir "$repo_root" --filter @hop-and-barley/api db:migrate:deploy
DATABASE_URL="$fresh_url" pnpm --dir "$repo_root" --filter @hop-and-barley/api db:seed

schema_state=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname fresh_m2 \
  --command "SELECT (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Product' AND column_name IN ('activeFrom', 'activeUntil') AND data_type = 'timestamp with time zone' AND datetime_precision = 3 AND is_nullable = 'YES' AND column_default IS NULL) || ':' || (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.\"Product\"'::regclass AND conname = 'Product_activity_window_check') || ':' || (SELECT count(*) FROM \"Product\" WHERE \"activeFrom\" IS NULL AND \"activeUntil\" IS NULL);")
test "$schema_state" = '2:1:12'

docker exec "$container_name" createdb -U "$database_user" \
  --template fresh_m2 rollback_m2
rollback_path="$repo_root/apps/api/prisma/migrations/20260828153000_add_product_activity_window/rollback.sql"

docker exec "$container_name" psql --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname rollback_m2 \
  --command 'CREATE VIEW "ProductActivityWindow" AS SELECT "id", "activeFrom" FROM "Product";' >/dev/null
if docker exec --interactive "$container_name" psql --no-psqlrc \
  --set ON_ERROR_STOP=1 --username "$database_user" --dbname rollback_m2 \
  < "$rollback_path" >/dev/null 2>&1; then
  echo 'Expected M2 rollback to fail while a view depends on activeFrom' >&2
  exit 1
fi

rollback_failure_state=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname rollback_m2 \
  --command "SELECT (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Product' AND column_name IN ('activeFrom', 'activeUntil')) || ':' || (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.\"Product\"'::regclass AND conname = 'Product_activity_window_check') || ':' || (SELECT count(*) FROM \"Product\");")
test "$rollback_failure_state" = '2:1:12'

docker exec "$container_name" psql --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname rollback_m2 \
  --command 'DROP VIEW "ProductActivityWindow";' >/dev/null
docker exec --interactive "$container_name" psql --no-psqlrc \
  --set ON_ERROR_STOP=1 --username "$database_user" --dbname rollback_m2 \
  < "$rollback_path"

rollback_state=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname rollback_m2 \
  --command "SELECT (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Product' AND column_name IN ('activeFrom', 'activeUntil')) || ':' || (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.\"Product\"'::regclass AND conname = 'Product_activity_window_check') || ':' || (SELECT count(*) FROM \"Product\");")
test "$rollback_state" = '0:0:12'

DATABASE_URL="$fresh_url" NODE_OPTIONS='--experimental-vm-modules' \
  RUN_M2_POSTGRES_INTEGRATION=1 \
  pnpm --dir "$repo_root" --filter @hop-and-barley/api exec jest \
  --config ./test/jest-e2e.json --runInBand --watchman=false \
  test/m2-postgres.e2e-spec.ts

cleanup
trap - EXIT
if docker ps -a --format '{{.Names}}' | grep -Fxq "$container_name"; then
  echo 'M2 disposable PostgreSQL container cleanup failed' >&2
  exit 1
fi

echo 'M2 disposable PostgreSQL apply/check/rollback/API gate: PASS (cleanup verified)'
