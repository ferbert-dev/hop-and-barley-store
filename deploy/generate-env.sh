#!/bin/sh
set -eu

usage() {
  echo "Usage: $0 OUTPUT_FILE RELEASE_ID WEB_IMAGE API_IMAGE MIGRATE_IMAGE" >&2
  exit 2
}

[ "$#" -eq 5 ] || usage

output_file=$1
release_id=$2
web_image=$3
api_image=$4
migrate_image=$5

[ -n "$release_id" ] && [ -n "$web_image" ] && [ -n "$api_image" ] && \
  [ -n "$migrate_image" ] || usage

if [ -e "$output_file" ]; then
  echo "Refusing to overwrite existing environment file: $output_file" >&2
  exit 1
fi

output_dir=$(dirname "$output_file")
[ -d "$output_dir" ] || {
  echo "Output directory does not exist: $output_dir" >&2
  exit 1
}

command -v openssl >/dev/null 2>&1 || {
  echo "openssl is required" >&2
  exit 1
}

umask 077
postgres_password=$(openssl rand -hex 32)
auth_csrf=$(openssl rand -hex 32)
cart_csrf=$(openssl rand -hex 32)
temporary_file=$(mktemp "$output_dir/.hopbarley-env.XXXXXX")
trap 'rm -f "$temporary_file"' EXIT HUP INT TERM

{
  printf 'COMPOSE_PROJECT_NAME=hopbarley\n'
  printf 'RELEASE_ID=%s\n' "$release_id"
  printf 'WEB_IMAGE=%s\n' "$web_image"
  printf 'API_IMAGE=%s\n' "$api_image"
  printf 'MIGRATE_IMAGE=%s\n' "$migrate_image"
  printf 'POSTGRES_IMAGE=postgres:17.6-alpine\n'
  printf 'CADDY_IMAGE=caddy:2.10.2-alpine\n'
  printf 'POSTGRES_DB=hopbarley\n'
  printf 'POSTGRES_USER=hopbarley\n'
  printf 'POSTGRES_PASSWORD=%s\n' "$postgres_password"
  printf 'DATABASE_URL=postgresql://hopbarley:%s@postgres:5432/hopbarley?schema=public\n' "$postgres_password"
  printf 'AUTH_CSRF_KEYRING=v1:%s\n' "$auth_csrf"
  printf 'CART_CSRF_KEYRING=v1:%s\n' "$cart_csrf"
} >"$temporary_file"

chmod 600 "$temporary_file"
mv "$temporary_file" "$output_file"
trap - EXIT HUP INT TERM
echo "Created protected environment file: $output_file"
