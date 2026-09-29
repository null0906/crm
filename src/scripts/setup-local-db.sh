#!/usr/bin/env bash

set -euo pipefail

# The application connects as crm_app, a NON-superuser. crm_user remains the instance
# administrator and is used only to bootstrap roles. See docs/database-roles.md.
CRM_APP_DB_PASSWORD="${CRM_APP_DB_PASSWORD:-crm_app_password}"
LOCAL_ADMIN_USER="${LOCAL_ADMIN_USER:-crm_user}"
LOCAL_DB_NAME="${LOCAL_DB_NAME:-seccomply_crm}"
LOCAL_DATABASE_URL="${LOCAL_DATABASE_URL:-postgresql://crm_app:${CRM_APP_DB_PASSWORD}@127.0.0.1:5434/${LOCAL_DB_NAME}}"

docker compose up -d postgres

until docker compose exec -T postgres pg_isready -U "$LOCAL_ADMIN_USER" -d "$LOCAL_DB_NAME" >/dev/null 2>&1; do
  printf 'Waiting for local Postgres...\n'
  sleep 1
done

# Must run BEFORE db:migrate. The migrator opens every run with
# `CREATE SCHEMA IF NOT EXISTS "drizzle"`, and PostgreSQL checks CREATE on the database
# before the IF NOT EXISTS short-circuit — so without the grants this creates, migration
# fails on its first statement even though the schema already exists.
bash src/scripts/bootstrap-db-roles.sh

DATABASE_URL="$LOCAL_DATABASE_URL" DATABASE_POOL_MAX=10 npm run db:migrate

# Routed through the container rather than a host psql, so this works on machines that
# have Docker but no PostgreSQL client installed.
USER_COUNT="$(docker compose exec -T postgres \
  psql -U "$LOCAL_ADMIN_USER" -d "$LOCAL_DB_NAME" -Atc 'SELECT COUNT(*) FROM users' \
  | tr -d '[:space:]')"

if [[ "$USER_COUNT" == "0" ]]; then
  DATABASE_URL="$LOCAL_DATABASE_URL" npm run db:seed
else
  printf 'Local database already contains %s user(s); skipping seed.\n' "$USER_COUNT"
fi

printf 'Local SecComply database is ready at %s\n' "$LOCAL_DATABASE_URL"
