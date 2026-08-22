#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
container_name="hop-barley-a1b-postgres-${$}"
database_user='hopbarley_a1b'
database_password='hopbarley_a1b_fixture'

cleanup() {
  docker stop "$container_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --rm --detach \
  --name "$container_name" \
  --env POSTGRES_DB=fresh_a1b \
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
docker exec "$container_name" pg_isready -U "$database_user" -d fresh_a1b >/dev/null
published_address=$(docker port "$container_name" 5432/tcp)
database_port=${published_address##*:}
fresh_url="postgresql://${database_user}:${database_password}@127.0.0.1:${database_port}/fresh_a1b?schema=public"

docker exec "$container_name" createdb -U "$database_user" upgrade_a1b
for migration in \
  20260814104924_init \
  20260814153000_expand_catalog \
  20260822013000_add_secure_registration \
  20260822113000_add_auth_sessions; do
  docker exec --interactive "$container_name" psql \
    --set ON_ERROR_STOP=1 --username "$database_user" --dbname upgrade_a1b \
    < "$repo_root/apps/api/prisma/migrations/$migration/migration.sql"
done

upgrade_state=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname upgrade_a1b \
  --command 'SELECT (to_regclass('\''public."User"'\'') IS NOT NULL)::int || '\'':'\'' || (to_regclass('\''public."PasswordCredential"'\'') IS NOT NULL)::int || '\'':'\'' || (to_regclass('\''public."AuthSession"'\'') IS NOT NULL)::int;')
test "$upgrade_state" = '1:1:1'

docker exec "$container_name" createdb -U "$database_user" existing_a1b
for migration in \
  20260814104924_init \
  20260814153000_expand_catalog \
  20260822013000_add_secure_registration; do
  docker exec --interactive "$container_name" psql \
    --set ON_ERROR_STOP=1 --username "$database_user" --dbname existing_a1b \
    < "$repo_root/apps/api/prisma/migrations/$migration/migration.sql"
done

docker exec "$container_name" psql \
  --set ON_ERROR_STOP=1 --username "$database_user" --dbname existing_a1b \
  --command "INSERT INTO \"User\" (\"id\", \"email\", \"normalizedEmail\", \"updatedAt\") VALUES ('10000000-0000-4000-8000-000000000099', 'legacy@example.com', 'legacy@example.com', CURRENT_TIMESTAMP); INSERT INTO \"PasswordCredential\" (\"userId\", \"passwordHash\", \"algorithm\", \"version\", \"memoryCost\", \"timeCost\", \"parallelism\", \"hashLength\", \"saltLength\") VALUES ('10000000-0000-4000-8000-000000000099', '\$argon2id\$v=19\$m=65536,p=1,t=3\$c2FsdHNhbHRzYWx0MTIzNA\$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'argon2id', 19, 65536, 3, 1, 32, 16);" >/dev/null

if docker exec --interactive "$container_name" psql \
  --set ON_ERROR_STOP=1 --username "$database_user" --dbname existing_a1b \
  < "$repo_root/apps/api/prisma/migrations/20260822113000_add_auth_sessions/migration.sql" \
  >/dev/null 2>&1; then
  echo 'A1B migration unexpectedly accepted a legacy Argon2 credential' >&2
  exit 1
fi
DATABASE_URL="$fresh_url" pnpm --dir "$repo_root" --filter @hop-and-barley/api db:migrate:deploy
DATABASE_URL="$fresh_url" pnpm --dir "$repo_root" --filter @hop-and-barley/api db:generate
DATABASE_URL="$fresh_url" NODE_OPTIONS='--experimental-vm-modules' \
  RUN_A1B_POSTGRES_INTEGRATION=1 \
  pnpm --dir "$repo_root" --filter @hop-and-barley/api exec jest \
  --config ./test/jest-e2e.json --runInBand --watchman=false \
  test/a1b-postgres.e2e-spec.ts

echo 'A1B disposable PostgreSQL gate: PASS'
