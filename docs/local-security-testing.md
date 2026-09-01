# Local Security Testing

The local development database runs in Docker and is reachable only through:

```text
postgresql://crm_app:crm_app_password@127.0.0.1:5434/seccomply_crm
```

`crm_app` is a **non-superuser**. `crm_user` still exists as the instance administrator and is
used only to bootstrap roles — never as `DATABASE_URL`. See [database-roles.md](database-roles.md)
for why, and note that this instance is shared with the Employee Ops platform.

## Start with seeded local data

```bash
npm run db:local:setup
npm run dev:local
```

Open `http://localhost:3000`. The `dev:local` command overrides `DATABASE_URL`,
`NEXTAUTH_URL`, and `APP_URL`, even when `.env.local` still contains Railway values.

`db:local:setup` runs `db:local:bootstrap` for you before migrating. If you ever get
`permission denied for database seccomply_crm` from the migrator, run that bootstrap by hand:

```bash
npm run db:local:bootstrap
```

## Clone production data locally

Only do this for approved security testing. It copies production data to your laptop.

```bash
CONFIRM_PRODUCTION_CLONE=YES npm run db:local:clone
```

The command reads `DATABASE_URL` from `.env.local` using Next.js's env loader.
Do not `source .env.local` in zsh: values such as `APP_NAME` can contain spaces and
are valid for Next.js but not for direct shell sourcing.

Do not run migrations or seed after cloning: the production clone already includes
the schema, data, and Drizzle migration journal.

The restore runs as the admin role and then re-runs the role bootstrap automatically —
`pg_dump --clean` emits statements that require ownership of the `pg_trgm` extension, which
`crm_app` cannot hold, and `--no-privileges` strips the Employee Ops read grants that the
bootstrap puts back.

## Reset the local database

> **Do not run `docker compose down -v`.** The `pgdata` volume no longer holds only this
> application. It also carries the Employee Ops platform's `eops`, `auth` and
> `eops_migrations` schemas (135 objects, owned by `eops_app`). Deleting the volume destroys
> another team's database along with yours, and nothing warns you.

To reset only the CRM's own data, drop and recreate its schemas as the admin role:

```bash
docker compose exec -T postgres psql -U crm_user -d seccomply_crm \
  -c 'DROP SCHEMA IF EXISTS drizzle CASCADE;' \
  -c 'DROP OWNED BY crm_app CASCADE;'
npm run db:local:setup
```

`DROP OWNED BY crm_app` removes exactly the objects this application owns, so the `eops`
schemas — owned by `eops_app` — are untouched by construction.

If you genuinely need to recreate the volume, take a backup of the neighbouring schemas first
and agree it with whoever runs Employee Ops:

```bash
docker compose exec -T postgres \
  pg_dump -U crm_user -d seccomply_crm -n eops -n auth -n eops_migrations > eops-backup.sql
```
