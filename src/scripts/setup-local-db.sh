#!/usr/bin/env bash

set -euo pipefail

LOCAL_DATABASE_URL="${LOCAL_DATABASE_URL:-postgresql://crm_user:crm_password@127.0.0.1:5433/seccomply_crm}"

docker compose up -d postgres

until docker compose exec -T postgres pg_isready -U crm_user -d seccomply_crm >/dev/null 2>&1; do
  printf 'Waiting for local Postgres...\n'
  sleep 1
done

DATABASE_URL="$LOCAL_DATABASE_URL" DATABASE_POOL_MAX=10 npm run db:migrate

USER_COUNT="$(psql "$LOCAL_DATABASE_URL" -Atc 'SELECT COUNT(*) FROM users')"
if [[ "$USER_COUNT" == "0" ]]; then
  DATABASE_URL="$LOCAL_DATABASE_URL" npm run db:seed
else
  printf 'Local database already contains %s user(s); skipping seed.\n' "$USER_COUNT"
fi

printf 'Local SecComply database is ready at %s\n' "$LOCAL_DATABASE_URL"
