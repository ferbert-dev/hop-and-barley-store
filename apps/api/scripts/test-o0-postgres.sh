#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
container_name="hop-barley-o0-postgres-${$}"
database_user='hopbarley_o0'
database_password='hopbarley_o0_fixture'

cleanup() {
  docker stop "$container_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --rm --detach \
  --name "$container_name" \
  --env POSTGRES_DB=fresh_o0 \
  --env POSTGRES_PASSWORD="$database_password" \
  --env POSTGRES_USER="$database_user" \
  --publish 127.0.0.1::5432 \
  postgres:17.6-alpine >/dev/null

ready_count=0
for _ in $(seq 1 60); do
  ready_count=$(docker logs "$container_name" 2>&1 | grep -c 'database system is ready to accept connections' || true)
  if (( ready_count >= 2 )); then break; fi
  sleep 0.5
done
test "$ready_count" -ge 2
docker exec "$container_name" pg_isready -U "$database_user" -d fresh_o0 >/dev/null
published_address=$(docker port "$container_name" 5432/tcp)
database_port=${published_address##*:}
fresh_url="postgresql://${database_user}:${database_password}@127.0.0.1:${database_port}/fresh_o0?schema=public"

docker exec "$container_name" createdb -U "$database_user" upgrade_o0
for migration in \
  20260814104924_init \
  20260814153000_expand_catalog \
  20260822013000_add_secure_registration \
  20260822113000_add_auth_sessions \
  20260822150000_add_guest_carts; do
  docker exec --interactive "$container_name" psql \
    --set ON_ERROR_STOP=1 --username "$database_user" --dbname upgrade_o0 \
    < "$repo_root/apps/api/prisma/migrations/$migration/migration.sql"
done

upgrade_tables=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname upgrade_o0 \
  --command "SELECT count(*) FROM pg_class WHERE relname IN ('Cart', 'CartItem') AND relkind = 'r';")
upgrade_constraints=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname upgrade_o0 \
  --command "SELECT count(*) FROM pg_constraint WHERE conname IN ('Cart_tokenDigest_length_check', 'Cart_expiry_check', 'CartItem_quantity_check', 'CartItem_cartId_fkey', 'CartItem_productId_fkey');")
upgrade_indexes=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname upgrade_o0 \
  --command "SELECT count(*) FROM pg_indexes WHERE indexname IN ('Cart_tokenDigest_key', 'Cart_expiresAt_idx', 'CartItem_cartId_productId_key', 'CartItem_cartId_idx', 'CartItem_productId_idx');")
test "$upgrade_tables:$upgrade_constraints:$upgrade_indexes" = '2:5:5'

DATABASE_URL="$fresh_url" pnpm --dir "$repo_root" --filter @hop-and-barley/api db:migrate:deploy
DATABASE_URL="$fresh_url" pnpm --dir "$repo_root" --filter @hop-and-barley/api db:seed

DATABASE_URL="$fresh_url" \
  NODE_OPTIONS='--experimental-vm-modules' \
  RUN_O0_POSTGRES_INTEGRATION=1 \
  pnpm --dir "$repo_root" --filter @hop-and-barley/api exec jest \
  --config ./test/jest-e2e.json --runInBand --watchman=false \
  test/o0-postgres.e2e-spec.ts

echo 'O0 disposable PostgreSQL gate: PASS'
