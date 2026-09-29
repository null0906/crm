#!/usr/bin/env bash

set -euo pipefail

CRM_APP_DB_PASSWORD="${CRM_APP_DB_PASSWORD:-crm_app_password}"
LOCAL_ADMIN_USER="${LOCAL_ADMIN_USER:-crm_user}"
LOCAL_DB_NAME="${LOCAL_DB_NAME:-seccomply_crm}"
LOCAL_DATABASE_URL="${LOCAL_DATABASE_URL:-postgresql://crm_app:${CRM_APP_DB_PASSWORD}@127.0.0.1:5434/${LOCAL_DB_NAME}}"

if [[ "${CONFIRM_PRODUCTION_CLONE:-}" != "YES" ]]; then
  cat <<'MSG'
Refusing to copy production data without explicit confirmation.

This creates a local copy containing production data. Keep it off shared devices,
do not expose port 5434, and do not use it for external demos.

Run with:
  CONFIRM_PRODUCTION_CLONE=YES npm run db:local:clone

Or pass a source connection explicitly:
  CONFIRM_PRODUCTION_CLONE=YES PRODUCTION_DATABASE_URL="postgresql://..." npm run db:local:clone
MSG
  exit 1
fi

if [[ -z "${PRODUCTION_DATABASE_URL:-}" ]]; then
  PRODUCTION_DATABASE_URL="$(node -e "const { loadEnvConfig } = require('@next/env'); const env = loadEnvConfig(process.cwd(), true).combinedEnv; process.stdout.write(env.DATABASE_URL || '')")"
fi

: "${PRODUCTION_DATABASE_URL:?Set DATABASE_URL in .env.local or pass PRODUCTION_DATABASE_URL explicitly.}"

docker compose up -d postgres

until docker compose exec -T postgres pg_isready -U "$LOCAL_ADMIN_USER" -d "$LOCAL_DB_NAME" >/dev/null 2>&1; do
  printf 'Waiting for local Postgres...\n'
  sleep 1
done

printf 'Copying production data into local Postgres...\n'
# Railway may run a newer PostgreSQL release than the local Docker image. Remove
# only the unsupported session setting while preserving all schema and data.
#
# Restored as the ADMIN role, never as crm_app. `pg_dump --clean` emits
#   DROP EXTENSION IF EXISTS pg_trgm;
#   COMMENT ON EXTENSION pg_trgm IS '...';
# both of which require ownership of the extension, and crm_app can never own it
# because PostgreSQL has no `ALTER EXTENSION ... OWNER TO`. That failure is also
# intermittent: on a fresh volume the DROP no-ops and crm_app becomes the extension
# owner, so it passes; on an existing volume it aborts under ON_ERROR_STOP=1.
#
# Piped into the container's own psql so the client version always matches the server.
# Note the dump contains no DROP SCHEMA public, so the local `eops`, `auth` and
# `eops_migrations` schemas survive a clone untouched.
pg_dump --format=plain --clean --if-exists --no-owner --no-privileges "$PRODUCTION_DATABASE_URL" \
  | sed '/^SET transaction_timeout = 0;$/d' \
  | docker compose exec -T postgres \
      psql --set ON_ERROR_STOP=1 -U "$LOCAL_ADMIN_USER" -d "$LOCAL_DB_NAME"

# The restore recreated every object owned by the admin role, and --no-privileges
# dropped the eops_app read grants. Hand both back.
bash src/scripts/bootstrap-db-roles.sh

printf 'Local production copy is ready at %s\n' "$LOCAL_DATABASE_URL"
