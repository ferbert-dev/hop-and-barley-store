#!/bin/sh
set -eu

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
temporary_dir=$(mktemp -d)
trap 'rm -rf "$temporary_dir"' EXIT HUP INT TERM
env_file="$temporary_dir/env"
rendered_file="$temporary_dir/compose.json"

cat >"$env_file" <<'EOF'
COMPOSE_PROJECT_NAME=hopbarley
RELEASE_ID=0123456789abcdef0123456789abcdef01234567
WEB_IMAGE=hopbarley/web:0123456789abcdef0123456789abcdef01234567
API_IMAGE=hopbarley/api:0123456789abcdef0123456789abcdef01234567
MIGRATE_IMAGE=hopbarley/migrate:0123456789abcdef0123456789abcdef01234567
POSTGRES_IMAGE=postgres:17.6-alpine
CADDY_IMAGE=caddy:2.10.2-alpine
POSTGRES_DB=hopbarley
POSTGRES_USER=hopbarley
POSTGRES_PASSWORD=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
DATABASE_URL=postgresql://hopbarley:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@postgres:5432/hopbarley?schema=public
AUTH_CSRF_KEYRING=v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
CART_CSRF_KEYRING=v1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
EOF
chmod 600 "$env_file"

docker compose --env-file "$env_file" -f "$script_dir/compose.prod.yaml" \
  --profile operations config --format json >"$rendered_file"

jq -e '
  .name == "hopbarley" and
  (.services | keys | sort) == ["api", "caddy", "migrate", "postgres", "seed", "web"] and
  (.services.caddy.ports | map(.published) | sort) == ["443", "80"] and
  ([.services.api, .services.web, .services.postgres, .services.migrate, .services.seed] | all(has("ports") | not)) and
  (.services.postgres.networks | keys) == ["backend"] and
  (.services.web.networks | keys) == ["edge"] and
  (.services.api.networks | keys | sort) == ["backend", "edge"] and
  .networks.backend.internal == true and
  .services.api.environment.AUTH_SESSIONS_ENABLED == "true" and
  .services.api.environment.AUTH_COOKIE_MODE == "secure-https" and
  .services.api.environment.CART_COOKIE_MODE == "secure-https" and
  .services.api.environment.STRIPE_PAYMENTS_ENABLED == "false" and
  .services.web.environment.NEXT_PUBLIC_API_URL == "https://hopbarley.shop" and
  .services.web.environment.API_INTERNAL_URL == "http://api:3001/api/v1" and
  .services.migrate.profiles == ["operations"] and
  .services.seed.profiles == ["operations"] and
  (.volumes | keys | sort) == ["caddy-config", "caddy-data", "postgres-data", "product-assets"]
' "$rendered_file" >/dev/null

docker run --rm --entrypoint caddy \
  -v "$script_dir/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2.10.2-alpine validate --config /etc/caddy/Caddyfile

echo 'Production Compose and Caddy configuration passed.'
