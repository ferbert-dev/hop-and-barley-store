#!/bin/sh
set -eu

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
temporary_dir=$(mktemp -d)
trap 'rm -rf "$temporary_dir"' EXIT HUP INT TERM
default_env_file="$temporary_dir/default.env"
default_rendered_file="$temporary_dir/default-compose.json"
sandbox_env_file="$temporary_dir/sandbox.env"
sandbox_rendered_file="$temporary_dir/sandbox-compose.json"

cat >"$default_env_file" <<'EOF'
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
chmod 600 "$default_env_file"

env \
  -u STRIPE_PAYMENTS_ENABLED \
  -u STRIPE_SANDBOX_SECRET_KEY \
  -u STRIPE_SANDBOX_WEBHOOK_SECRET \
  -u STRIPE_PAYMENT_METHOD_CONFIGURATION_ID \
  -u STRIPE_CHECKOUT_SUCCESS_URL \
  -u STRIPE_CHECKOUT_CANCEL_URL \
  docker compose --env-file "$default_env_file" -f "$script_dir/compose.prod.yaml" \
  --profile operations config --format json >"$default_rendered_file"

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
  .services.api.environment.STRIPE_SANDBOX_SECRET_KEY == "" and
  .services.api.environment.STRIPE_SANDBOX_WEBHOOK_SECRET == "" and
  .services.api.environment.STRIPE_PAYMENT_METHOD_CONFIGURATION_ID == "" and
  .services.api.environment.STRIPE_CHECKOUT_SUCCESS_URL == "https://hopbarley.shop/checkout?payment=return" and
  .services.api.environment.STRIPE_CHECKOUT_CANCEL_URL == "https://hopbarley.shop/checkout?payment=cancelled" and
  .services.web.environment.NEXT_PUBLIC_API_URL == "https://hopbarley.shop" and
  .services.web.environment.API_INTERNAL_URL == "http://api:3001/api/v1" and
  .services.migrate.profiles == ["operations"] and
  .services.seed.profiles == ["operations"] and
  (.volumes | keys | sort) == ["caddy-config", "caddy-data", "postgres-data", "product-assets"]
' "$default_rendered_file" >/dev/null

cp "$default_env_file" "$sandbox_env_file"
cat >>"$sandbox_env_file" <<'EOF'
STRIPE_PAYMENTS_ENABLED=true
STRIPE_SANDBOX_SECRET_KEY=sandbox-secret-key-sentinel
STRIPE_SANDBOX_WEBHOOK_SECRET=sandbox-webhook-secret-sentinel
STRIPE_PAYMENT_METHOD_CONFIGURATION_ID=sandbox-payment-method-sentinel
STRIPE_CHECKOUT_SUCCESS_URL=https://hopbarley.shop/checkout?sandbox=return
STRIPE_CHECKOUT_CANCEL_URL=https://hopbarley.shop/checkout?sandbox=cancelled
EOF

env \
  -u STRIPE_PAYMENTS_ENABLED \
  -u STRIPE_SANDBOX_SECRET_KEY \
  -u STRIPE_SANDBOX_WEBHOOK_SECRET \
  -u STRIPE_PAYMENT_METHOD_CONFIGURATION_ID \
  -u STRIPE_CHECKOUT_SUCCESS_URL \
  -u STRIPE_CHECKOUT_CANCEL_URL \
  docker compose --env-file "$sandbox_env_file" -f "$script_dir/compose.prod.yaml" \
  --profile operations config --format json >"$sandbox_rendered_file"

jq -e '
  .services.api.environment.STRIPE_PAYMENTS_ENABLED == "true" and
  .services.api.environment.STRIPE_SANDBOX_SECRET_KEY == "sandbox-secret-key-sentinel" and
  .services.api.environment.STRIPE_SANDBOX_WEBHOOK_SECRET == "sandbox-webhook-secret-sentinel" and
  .services.api.environment.STRIPE_PAYMENT_METHOD_CONFIGURATION_ID == "sandbox-payment-method-sentinel" and
  .services.api.environment.STRIPE_CHECKOUT_SUCCESS_URL == "https://hopbarley.shop/checkout?sandbox=return" and
  .services.api.environment.STRIPE_CHECKOUT_CANCEL_URL == "https://hopbarley.shop/checkout?sandbox=cancelled"
' "$sandbox_rendered_file" >/dev/null

docker run --rm --entrypoint caddy \
  -v "$script_dir/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2.10.2-alpine validate --config /etc/caddy/Caddyfile

echo 'Production Compose and Caddy configuration passed.'
