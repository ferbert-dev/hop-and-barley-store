#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
image_name="hop-barley-a1b-argon2-gate:${$}"

cleanup() {
  docker image rm "$image_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker build \
  --file "$repo_root/apps/api/Dockerfile" \
  --target api \
  --tag "$image_name" \
  "$repo_root" >/dev/null
docker run --rm \
  --cpus 1 \
  --memory 1g \
  --network none \
  --pids-limit 256 \
  --volume "$repo_root/apps/api/scripts/benchmark-a1b-argon2.mjs:/app/benchmark-a1b-argon2.mjs:ro" \
  "$image_name" \
  node /app/benchmark-a1b-argon2.mjs
