#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
container_name="hop-barley-o2p-postgres-${$}"
database_user='hopbarley_o2p'
database_password='hopbarley_o2p_fixture'
migration_name='20260910120000_add_stripe_sandbox_orchestration'
migration_path="$repo_root/apps/api/prisma/migrations/$migration_name/migration.sql"

cleanup() {
  docker stop "$container_name" >/dev/null 2>&1 || true
  for _ in $(seq 1 50); do
    if ! docker inspect "$container_name" >/dev/null 2>&1; then return 0; fi
    sleep 0.1
  done
  echo "Disposable O2P container was not removed: $container_name" >&2
  return 1
}
trap cleanup EXIT INT TERM

docker run --rm --detach --name "$container_name" \
  --memory 1g --memory-swap 1g \
  --env POSTGRES_DB=fresh_o2p --env POSTGRES_PASSWORD="$database_password" \
  --env POSTGRES_USER="$database_user" --publish 127.0.0.1::5432 \
  postgres:17.6-alpine >/dev/null
test "$(docker inspect --format '{{.HostConfig.Memory}}:{{.HostConfig.MemorySwap}}' "$container_name")" = \
  '1073741824:1073741824'

ready_count=0
for _ in $(seq 1 60); do
  ready_count=$(docker logs "$container_name" 2>&1 | \
    grep -c 'database system is ready to accept connections' || true)
  if ((ready_count >= 2)); then break; fi
  sleep 0.5
done
test "$ready_count" -ge 2
docker exec "$container_name" pg_isready \
  --username "$database_user" --dbname fresh_o2p >/dev/null
database_port=$(docker port "$container_name" 5432/tcp)
database_port=${database_port##*:}

database_url() {
  printf 'postgresql://%s:%s@127.0.0.1:%s/%s?schema=public' \
    "$database_user" "$database_password" "$database_port" "$1"
}

apply_prior_migrations() {
  local database_name=$1
  local directory
  for directory in "$repo_root"/apps/api/prisma/migrations/*; do
    if test "$(basename "$directory")" = "$migration_name"; then break; fi
    if test -f "$directory/migration.sql"; then
      docker exec --interactive "$container_name" psql --no-psqlrc \
        --set ON_ERROR_STOP=1 --username "$database_user" \
        --dbname "$database_name" < "$directory/migration.sql" >/dev/null
    fi
  done
}

query_scalar() {
  docker exec "$container_name" psql --no-psqlrc --tuples-only --no-align \
    --username "$database_user" --dbname "$1" --command "$2"
}

docker exec "$container_name" createdb -U "$database_user" atomic_o2p
apply_prior_migrations atomic_o2p
if awk '/^COMMIT;$/ { print "SELECT 1 / 0;" } { print }' "$migration_path" | \
  docker exec --interactive "$container_name" psql --no-psqlrc \
    --set ON_ERROR_STOP=1 --username "$database_user" \
    --dbname atomic_o2p >/dev/null 2>&1; then
  echo 'Expected injected O2P migration failure' >&2
  exit 1
fi
atomic_shape=$(query_scalar atomic_o2p "
  SELECT
    to_regclass('public.\"PaymentAllocation\"') IS NULL,
    to_regclass('public.\"StripeWebhookReceipt\"') IS NULL,
    NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'PaymentAttempt'
        AND column_name = 'providerSessionId'
    );
")
test "$atomic_shape" = 't|t|t'

fresh_url=$(database_url fresh_o2p)
DATABASE_URL="$fresh_url" pnpm --dir "$repo_root" \
  --filter @hop-and-barley/api db:migrate:deploy
DATABASE_URL="$fresh_url" pnpm --dir "$repo_root" \
  --filter @hop-and-barley/api db:seed >/dev/null

fresh_shape=$(query_scalar fresh_o2p "
  SELECT
    to_regclass('public.\"PaymentAllocation\"') IS NOT NULL,
    to_regclass('public.\"StripeWebhookReceipt\"') IS NOT NULL,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Order'
        AND column_name = 'userId' AND is_nullable = 'YES'
    ),
    to_regclass('public.\"PaymentAllocation_orderId_key\"') IS NOT NULL;
")
test "$fresh_shape" = 't|t|t|t'

DATABASE_URL="$fresh_url" NODE_OPTIONS='--experimental-vm-modules' \
  RUN_O2P_POSTGRES_INTEGRATION=1 pnpm --dir "$repo_root" \
  --filter @hop-and-barley/api exec jest --config ./test/jest-e2e.json \
  --runInBand --watchman=false test/o2p-postgres.e2e-spec.ts

cleanup
trap - EXIT INT TERM
if docker inspect "$container_name" >/dev/null 2>&1; then
  echo "Disposable O2P container still exists: $container_name" >&2
  exit 1
fi
echo 'O2P disposable PostgreSQL gate: PASS'
