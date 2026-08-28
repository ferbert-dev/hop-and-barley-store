#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
container_name="hop-barley-m1-postgres-${$}"
database_user='hopbarley_m1'
database_password='hopbarley_m1_fixture'

cleanup() {
  docker stop "$container_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --rm --detach \
  --name "$container_name" \
  --env POSTGRES_DB=fresh_m1 \
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
docker exec "$container_name" pg_isready -U "$database_user" -d fresh_m1 >/dev/null
published_address=$(docker port "$container_name" 5432/tcp)
database_port=${published_address##*:}
database_url="postgresql://${database_user}:${database_password}@127.0.0.1:${database_port}/fresh_m1?schema=public"

DATABASE_URL="$database_url" pnpm --dir "$repo_root" --filter @hop-and-barley/api db:migrate:deploy
DATABASE_URL="$database_url" pnpm --dir "$repo_root" --filter @hop-and-barley/api db:generate
DATABASE_URL="$database_url" NODE_OPTIONS='--experimental-vm-modules' \
  RUN_M1_POSTGRES_INTEGRATION=1 \
  pnpm --dir "$repo_root" --filter @hop-and-barley/api exec jest \
  --config ./test/jest-e2e.json --runInBand --watchman=false \
  test/m1-postgres.e2e-spec.ts

echo 'M1 disposable PostgreSQL gate: PASS'
