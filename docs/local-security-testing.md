# Local Security Testing

The local development database runs in Docker and is reachable only through:

```text
postgresql://crm_user:crm_password@127.0.0.1:5433/seccomply_crm
```

## Start with seeded local data

```bash
npm run db:local:setup
npm run dev:local
```

Open `http://localhost:3000`. The `dev:local` command overrides `DATABASE_URL`,
`NEXTAUTH_URL`, and `APP_URL`, even when `.env.local` still contains Railway values.

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

## Reset the local database

```bash
docker compose down -v
npm run db:local:setup
```
