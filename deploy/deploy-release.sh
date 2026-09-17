#!/bin/sh
set -eu

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
compose_file="$script_dir/compose.prod.yaml"

usage() {
  echo "Usage: $0 ENV_FILE [--seed-initial]" >&2
  exit 2
}

[ "$#" -ge 1 ] && [ "$#" -le 2 ] || usage
env_file=$1
seed_initial=false
release_dir=$(dirname "$env_file")
state_dir="$release_dir/.deploy-state"

if [ "$#" -eq 2 ]; then
  [ "$2" = '--seed-initial' ] || usage
  seed_initial=true
fi

[ -f "$env_file" ] || {
  echo "Environment file not found: $env_file" >&2
  exit 1
}

permissions=$(stat -c '%a' "$env_file")
[ "$permissions" = '600' ] || {
  echo "Environment file must have mode 600 (found $permissions): $env_file" >&2
  exit 1
}

mark_complete() {
  marker=$1
  temporary=$(mktemp "$state_dir/.marker.XXXXXX")
  chmod 600 "$temporary"
  mv "$temporary" "$marker"
}

if [ "$seed_initial" = true ]; then
  initial_owner="$release_dir/initial-owner.json"
  [ -f "$initial_owner" ] || {
    echo "Initial seed requires protected release ownership state." >&2
    exit 1
  }
  [ "$(stat -c '%a' "$initial_owner")" = '600' ] || {
      echo "Initial release ownership state must have mode 600." >&2
      exit 1
    }
  mkdir -p "$state_dir"
  chmod 700 "$state_dir"
fi

compose() {
  docker compose --env-file "$env_file" -f "$compose_file" "$@"
}

compose config --quiet
compose up --detach --wait postgres

# A migrated schema proves that this is an existing database. Back it up before
# every later migration, regardless of the operator's seed flag.
# shellcheck disable=SC2016
existing_database=$(
  compose exec -T postgres sh -eu -c \
    'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --tuples-only --no-align --command="SELECT CASE WHEN to_regclass(\$\$public.\"_prisma_migrations\"\$\$) IS NULL THEN 0 ELSE 1 END;"'
)
existing_database=$(printf '%s' "$existing_database" | tr -d '[:space:]')
case "$existing_database" in
  0 | 1) ;;
  *)
    echo "Could not determine whether the database is initialized." >&2
    exit 1
    ;;
esac

compose stop caddy web api

if [ "$existing_database" = '1' ]; then
  backup_dir=$(dirname "$env_file")/backups
  mkdir -p "$backup_dir"
  chmod 700 "$backup_dir"

  # shellcheck disable=SC2016
  database_bytes=$(
    compose exec -T postgres sh -eu -c \
      'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --tuples-only --no-align --command="SELECT pg_database_size(current_database());"'
  )
  database_bytes=$(printf '%s' "$database_bytes" | tr -d '[:space:]')
  case "$database_bytes" in
    '' | *[!0-9]*)
      echo "Could not determine the database size for backup." >&2
      exit 1
      ;;
  esac

  available_kb=$(df -Pk "$backup_dir" | awk 'NR == 2 { print $4 }')
  case "$available_kb" in
    '' | *[!0-9]*)
      echo "Could not determine free space for backup." >&2
      exit 1
      ;;
  esac
  required_kb=$((database_bytes * 2 / 1024 + 102400))
  [ "$available_kb" -ge "$required_kb" ] || {
    echo "Insufficient free space for a protected pre-migration backup." >&2
    exit 1
  }

  backup_file=$(mktemp "$backup_dir/hopbarley-pre-migrate-$(date -u +%Y%m%dT%H%M%SZ).dump.XXXXXX")
  chmod 600 "$backup_file"
  # shellcheck disable=SC2016
  if ! compose exec -T postgres sh -eu -c \
    'PGPASSWORD="$POSTGRES_PASSWORD" exec pg_dump --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --format=custom' \
    >"$backup_file"; then
    rm -f "$backup_file"
    echo "Pre-migration database backup failed." >&2
    exit 1
  fi
  [ -s "$backup_file" ] || {
    rm -f "$backup_file"
    echo "Pre-migration database backup is empty." >&2
    exit 1
  }
  echo "Created protected pre-migration backup: $backup_file"
fi

compose --profile operations run --rm migrate

if [ "$seed_initial" = true ]; then
  migrations_complete="$state_dir/migrations-complete"
  seed_started="$state_dir/seed-started"
  seed_complete="$state_dir/seed-complete"
  [ -f "$migrations_complete" ] || mark_complete "$migrations_complete"

  query_catalog_state() {
    # Variables expand inside the container, not in this operator process.
    # shellcheck disable=SC2016
    compose exec -T postgres sh -eu -c \
      'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --tuples-only --no-align --command="SELECT CASE WHEN (SELECT count(*) FROM \"Product\") = 0 AND (SELECT count(*) FROM \"Category\") = 6 AND NOT EXISTS (SELECT 1 FROM \"Category\" WHERE (\"id\"::text, \"slug\") NOT IN (VALUES (\$\$10000000-0000-4000-8000-000000000001\$\$, \$\$hops\$\$), (\$\$10000000-0000-4000-8000-000000000002\$\$, \$\$malts\$\$), (\$\$10000000-0000-4000-8000-000000000003\$\$, \$\$yeast\$\$), (\$\$10000000-0000-4000-8000-000000000004\$\$, \$\$adjuncts\$\$), (\$\$10000000-0000-4000-8000-000000000005\$\$, \$\$kits\$\$), (\$\$10000000-0000-4000-8000-000000000999\$\$, \$\$legacy-foundation\$\$))) THEN \$\$baseline\$\$ WHEN (SELECT count(*) FROM \"Category\") > 0 AND (SELECT count(*) FROM \"Product\") > 0 THEN \$\$populated\$\$ ELSE \$\$inconsistent\$\$ END;"'
  }
  catalog_state=$(query_catalog_state)
  catalog_state=$(printf '%s' "$catalog_state" | tr -d '[:space:]')
  case "$catalog_state" in
    baseline | populated | inconsistent) ;;
    *)
      echo "Could not determine initial catalog state." >&2
      exit 1
      ;;
  esac

  if [ -f "$seed_complete" ]; then
    : # A completed seed is never run again over operational catalog data.
  elif [ -f "$seed_started" ]; then
    if [ "$catalog_state" = 'populated' ]; then
      # The seed is one database transaction. Both tables populated after a
      # started attempt proves that transaction committed before interruption.
      mark_complete "$seed_complete"
    elif [ "$catalog_state" = 'baseline' ]; then
      compose --profile operations run --rm seed
    else
      echo "Initial seed recovery refused: catalog state is inconsistent." >&2
      exit 1
    fi
  else
    [ "$catalog_state" = 'baseline' ] || {
      echo "Initial seed refused: catalog differs from the reviewed migration baseline." >&2
      exit 1
    }
    mark_complete "$seed_started"
    compose --profile operations run --rm seed
  fi

  if [ ! -f "$seed_complete" ]; then
    catalog_state=$(query_catalog_state)
    catalog_state=$(printf '%s' "$catalog_state" | tr -d '[:space:]')
    if [ "$catalog_state" = 'populated' ]; then
      mark_complete "$seed_complete"
    else
      echo "Initial seed did not populate both catalog tables." >&2
      exit 1
    fi
  fi
fi

compose up --detach --wait api web caddy
compose ps
