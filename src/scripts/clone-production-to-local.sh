#!/usr/bin/env bash

set -euo pipefail

LOCAL_DATABASE_URL="${LOCAL_DATABASE_URL:-postgresql://crm_user:crm_password@127.0.0.1:5433/seccomply_crm}"

if [[ "${CONFIRM_PRODUCTION_CLONE:-}" != "YES" ]]; then
  cat <<'EOF'
Refusing to copy production data without explicit confirmation.

This creates a local copy containing production data. Keep it off shared devices,
do not expose port 5433, and do not use it for external demos.

Run with:
  CONFIRM_PRODUCTION_CLONE=YES npm run db:local:clone

Or pass a source connection explicitly:
  CONFIRM_PRODUCTION_CLONE=YES PRODUCTION_DATABASE_URL="postgresql://..." npm run db:local:clone
EOF
  exit 1
fi

if [[ -z "${PRODUCTION_DATABASE_URL:-}" ]]; then
  PRODUCTION_DATABASE_URL="$(node -e "const { loadEnvConfig } = require('@next/env'); const env = loadEnvConfig(process.cwd(), true).combinedEnv; process.stdout.write(env.DATABASE_URL || '')")"
fi

: "${PRODUCTION_DATABASE_URL:?Set DATABASE_URL in .env.local or pass PRODUCTION_DATABASE_URL explicitly.}"

docker compose up -d postgres

until docker compose exec -T postgres pg_isready -U crm_user -d seccomply_crm >/dev/null 2>&1; do
  printf 'Waiting for local Postgres...\n'
  sleep 1
done

printf 'Copying production data into local Postgres...\n'
# Railway may run a newer PostgreSQL release than the local Docker image. Remove
# only the unsupported session setting while preserving all schema and data.
pg_dump --format=plain --clean --if-exists --no-owner --no-privileges "$PRODUCTION_DATABASE_URL" \
  | sed '/^SET transaction_timeout = 0;$/d' \
  | psql --set ON_ERROR_STOP=1 "$LOCAL_DATABASE_URL"

printf 'Local production copy is ready at %s\n' "$LOCAL_DATABASE_URL"
