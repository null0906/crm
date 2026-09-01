#!/usr/bin/env bash

set -euo pipefail

# Creates / refreshes the non-superuser `crm_app` role that the application and
# drizzle-kit connect as. See src/scripts/sql/crm-app-role.sql for the reasoning.
#
# Local (default) — runs inside the Docker container as the bootstrap superuser:
#   npm run db:local:bootstrap
#
# Any other instance (e.g. the Railway runbook) — pass an admin connection string:
#   ADMIN_DATABASE_URL="postgresql://postgres:...@host:5432/railway" \
#   CRM_APP_DB_PASSWORD="<secret>" bash src/scripts/bootstrap-db-roles.sh
#
# Idempotent: safe to re-run, and required after `db:local:clone`.

SQL_FILE="src/scripts/sql/crm-app-role.sql"
CRM_APP_DB_PASSWORD="${CRM_APP_DB_PASSWORD:-crm_app_password}"
LOCAL_ADMIN_USER="${LOCAL_ADMIN_USER:-crm_user}"
LOCAL_DB_NAME="${LOCAL_DB_NAME:-seccomply_crm}"

if [[ ! -f "$SQL_FILE" ]]; then
  printf 'Run this from the repository root; %s not found.\n' "$SQL_FILE" >&2
  exit 1
fi

if [[ -n "${ADMIN_DATABASE_URL:-}" ]]; then
  printf 'Bootstrapping crm_app against the supplied admin connection...\n'
  psql -v ON_ERROR_STOP=1 \
       -v crm_app_password="${CRM_APP_DB_PASSWORD}" \
       "$ADMIN_DATABASE_URL" \
       -f "$SQL_FILE"
else
  printf 'Bootstrapping crm_app in the local Docker instance as %s...\n' "$LOCAL_ADMIN_USER"
  # Piped through the container's own psql so the client version always matches the
  # server, and so no admin password has to leave the compose environment.
  docker compose exec -T postgres \
    psql -v ON_ERROR_STOP=1 \
         -v crm_app_password="${CRM_APP_DB_PASSWORD}" \
         -U "$LOCAL_ADMIN_USER" \
         -d "$LOCAL_DB_NAME" \
    < "$SQL_FILE"
fi

printf 'crm_app is ready. DATABASE_URL should name crm_app, never a superuser.\n'
