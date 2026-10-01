#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
container_name="hop-barley-o3l-postgres-${$}"
database_user='hopbarley_o3l'
database_password='hopbarley_o3l_fixture'

cleanup() {
  docker stop "$container_name" >/dev/null 2>&1 || true
  for _ in $(seq 1 50); do
    if ! docker inspect "$container_name" >/dev/null 2>&1; then return 0; fi
    sleep 0.1
  done
  echo "Disposable O3L container was not removed: $container_name" >&2
  return 1
}
trap cleanup EXIT INT TERM

docker run --rm --detach --name "$container_name" \
  --memory 1g --memory-swap 1g \
  --env POSTGRES_DB=fresh_o3l --env POSTGRES_PASSWORD="$database_password" \
  --env POSTGRES_USER="$database_user" --publish 127.0.0.1::5432 \
  postgres:17.6-alpine >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$container_name" pg_isready --username "$database_user" --dbname fresh_o3l >/dev/null 2>&1; then break; fi
  sleep 0.5
done
docker exec "$container_name" pg_isready --username "$database_user" --dbname fresh_o3l >/dev/null
database_port=$(docker port "$container_name" 5432/tcp)
database_port=${database_port##*:}
database_url="postgresql://$database_user:$database_password@127.0.0.1:$database_port/fresh_o3l?schema=public"

DATABASE_URL="$database_url" pnpm --dir "$repo_root" --filter @hop-and-barley/api db:migrate:deploy
DATABASE_URL="$database_url" pnpm --dir "$repo_root" --filter @hop-and-barley/api db:seed >/dev/null

shape=$(docker exec "$container_name" psql --no-psqlrc --tuples-only --no-align \
  --username "$database_user" --dbname fresh_o3l --command "
  SELECT to_regclass('public.\"PurchaseLike\"') IS NOT NULL,
    to_regclass('public.\"PurchaseLike_paymentAttemptId_key\"') IS NOT NULL,
    EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'PurchaseLike_eligible_payment_trigger' AND NOT tgisinternal);")
test "$shape" = 't|t|t'

DATABASE_URL="$database_url" NODE_OPTIONS='--experimental-vm-modules' RUN_O2P_POSTGRES_INTEGRATION=1 \
  pnpm --dir "$repo_root" --filter @hop-and-barley/api exec jest --config ./test/jest-e2e.json \
  --runInBand --watchman=false test/o2p-postgres.e2e-spec.ts

cleanup
trap - EXIT INT TERM
if docker inspect "$container_name" >/dev/null 2>&1; then
  echo "Disposable O3L container still exists: $container_name" >&2
  exit 1
fi
echo 'O3L disposable PostgreSQL gate: PASS'
