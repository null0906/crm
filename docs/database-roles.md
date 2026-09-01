# Database roles and the shared instance

## Why this exists

The CRM's PostgreSQL database is becoming the primary database for the platform. A second
application, **Employee Ops**, lives in the same instance as a separate schema, `eops` (plus
`auth` and `eops_migrations`), owned by its own role `eops_app`. The CRM remains the system of
record. Employee Ops reads a small set of CRM tables and never writes them.

That boundary runs in both directions, and only one direction is enforced by grants alone:

- **Employee Ops → CRM.** `eops_app` holds `SELECT` on `public` and nothing else. Verified:
  `INSERT`, `UPDATE`, `DELETE` are refused with *permission denied*, `ALTER`/`DROP` with
  *must be owner*.
- **CRM → Employee Ops.** `eops` is protected by *not* granting the CRM role `USAGE` on it.
  **A superuser bypasses grants entirely**, so this only works if the role named in
  `DATABASE_URL` is not a superuser.

Hence `crm_app`.

| Role | Superuser | Used for |
|---|---|---|
| `crm_user` (local) / `postgres` (Railway) | yes | administration and role bootstrap only |
| `crm_app` | **no** | the application, the migrator, drizzle-kit |
| `eops_app` | no | Employee Ops; `SELECT` on `public`, owner of `eops` |

`DATABASE_URL` must name `crm_app`. If it names a superuser, the isolation is not merely weaker
— it is absent.

## The bootstrap

[`src/scripts/sql/crm-app-role.sql`](../src/scripts/sql/crm-app-role.sql), run via
[`src/scripts/bootstrap-db-roles.sh`](../src/scripts/bootstrap-db-roles.sh). Idempotent, and
environment-neutral: it uses `current_database()` and guards the Employee Ops grants on
`eops_app` existing, so the same file runs locally and on Railway.

```bash
npm run db:local:bootstrap                      # local Docker
ADMIN_DATABASE_URL="postgresql://postgres:...@host:port/railway" \
  CRM_APP_DB_PASSWORD='<secret>' bash src/scripts/bootstrap-db-roles.sh
```

Re-run it after anything that recreates objects as the admin role — notably `db:local:clone`.

### Why not `REASSIGN OWNED`

The obvious `REASSIGN OWNED BY crm_user TO crm_app` **is a silent no-op**, verified on the local
instance:

```
 oid | rolname  | rolsuper        pg_shdepend rows for crm_user: 0
  10 | crm_user | t               pg_shdepend rows for eops_app: 41 owner + 65 acl
```

`crm_user` is OID 10, the bootstrap superuser, which PostgreSQL *pins*. `shdepAddDependency()`
skips pinned roles, so no `pg_shdepend` owner rows are ever recorded for it — and
`REASSIGN OWNED` reads `pg_shdepend`. It returns `REASSIGN OWNED`, exit code 0, and moves
nothing. Where the admin role is *not* pinned it fails the other way, over-reaching onto
databases, tablespaces and extensions.

So the script uses a scoped `DO` loop restricted to `public` and `drizzle`, and to objects owned
by the role running it. Locally that moved **68 objects** (62 tables, 5 sequences, 1 view) plus
the `drizzle` schema. The 31 `pg_trgm` functions are deliberately excluded — they belong to the
extension, and PostgreSQL has no `ALTER EXTENSION ... OWNER TO`.

### Two things that look optional and are not

**`GRANT CREATE ON DATABASE`.** Drizzle's migrator opens *every* run with
`CREATE SCHEMA IF NOT EXISTS "drizzle"`, and PostgreSQL checks `CREATE` on the database *before*
the `IF NOT EXISTS` short-circuit. Confirmed empirically — with the grant revoked and the schema
already present:

```
ERROR:  permission denied for database seccomply_crm
```

Since `railway.toml` starts with `npm run db:migrate`, omitting this grant means every deploy
fails on its first statement.

**Re-declaring the default ACL.** `pg_default_acl` held exactly one entry,
`FOR ROLE crm_user IN SCHEMA public GRANT SELECT ON TABLES TO eops_app`. Neither
`ALTER ... OWNER TO` nor `REASSIGN OWNED` touches `pg_default_acl`. Once `crm_app` became the
creating role, that entry stopped applying — so every *new* CRM table would have been invisible
to Employee Ops, failing at runtime in another codebase with no signal here. The script
re-declares it for `crm_app` and back-fills the existing grants.

## Railway runbook

Not yet executed. Production does not host `eops` today, so this is preparation for the cutover,
not an emergency.

Two pre-checks before you run anything:

```sql
-- 1. Is Railway's admin pinned? If oid <> 10, a blanket REASSIGN OWNED would have
--    reassigned the `railway` database itself. The scoped loop avoids that either way.
SELECT oid, rolname, rolsuper FROM pg_roles WHERE rolname = current_user;

-- 2. If ALTER ... OWNER TO fails with "must be member of role crm_app":
GRANT crm_app TO CURRENT_USER;
```

Then, in order:

1. Run the bootstrap as `postgres`. **Nothing changes for the running app** — `postgres` is a
   superuser and keeps working against tables it no longer owns. This step is safe to do ahead
   of time.
2. Run the verification below against production.
3. Only then set Railway's `DATABASE_URL` to the `crm_app` credentials. **Reuse the existing
   host and port** — [`src/server/db/index.ts`](../src/server/db/index.ts) hard-codes `family: 4`,
   so Railway's IPv6-only private domain will not resolve.
4. Changing the variable triggers a redeploy, and the start command is
   `npm run db:migrate && npm start` — so migrations run immediately as the new role. Watch that
   deploy.

## Verification

```sql
-- not a superuser: expect f f f f f t
SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolcanlogin
  FROM pg_roles WHERE rolname = 'crm_app';

-- refused on the neighbour's schemas: expect f f f
SELECT has_schema_privilege('crm_app','eops','USAGE'),
       has_schema_privilege('crm_app','auth','USAGE'),
       has_schema_privilege('crm_app','eops_migrations','USAGE');

-- nothing left behind: expect 0 rows
SELECT n.nspname, c.relname, pg_get_userbyid(c.relowner)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname IN ('public','drizzle') AND c.relkind IN ('r','p','f','v','m','S')
   AND pg_get_userbyid(c.relowner) <> 'crm_app';

-- no over-reach: databases must still be owned by the admin role
SELECT datname, pg_get_userbyid(datdba) FROM pg_database ORDER BY 1;

-- Employee Ops still reads everything it did before
SELECT count(*) FROM information_schema.role_table_grants
 WHERE grantee = 'eops_app' AND table_schema = 'public' AND privilege_type = 'SELECT';
```

As `crm_app`, each of these must **error**, not return rows:

```
SELECT count(*) FROM eops.employees;   -- ERROR: permission denied for schema eops
DROP SCHEMA eops CASCADE;              -- ERROR: must be owner of schema eops
```

Then `npm run db:migrate` (must print `Migrations complete.`) and `npm test`.

Capture row counts and this schema fingerprint before and after; both must be identical:

```sql
SELECT md5(string_agg(table_name||':'||column_name||':'||data_type||':'||is_nullable, '|'
       ORDER BY table_name, ordinal_position))
FROM information_schema.columns WHERE table_schema='public';
```

## Rollback

**Level 1 — instant, no database change, covers nearly everything.** Point `DATABASE_URL` back at
the admin role. It is a superuser, so it retains full access to the tables `crm_app` now owns;
the application and migrations behave exactly as before. Nothing in the database needs undoing.
This is what makes the change cheap to try.

**Level 2 — full undo.**

```sql
REASSIGN OWNED BY crm_app TO crm_user;   -- safe in THIS direction: crm_app is not pinned
DROP OWNED BY crm_app;                   -- ONLY after the reassign succeeded
DROP ROLE crm_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO eops_app;
```

**Order matters.** Run `DROP OWNED BY crm_app` *before* the reassign and it drops all 62 CRM
tables. The original `crm_user` default-ACL entry is deliberately left in place by the forward
migration so this rollback needs no extra repair.

**Never `docker compose down -v`** — see [local-security-testing.md](local-security-testing.md).

## What this does not do

`pg_catalog` is world-readable and cannot be restricted. `crm_app` can still see eops *table and
column names* via `\dt eops.*` or `pg_class`. It cannot read a single row or issue any DDL. If
name-level concealment is ever required, only a separate database or cluster achieves it.

## Pending: the availability grant

A second Employee Ops brief specifies two read-only views, `eops.v_person_availability` and
`eops.v_role_availability`, for showing whether a person is free when staffing an estimate. They do
**not exist yet**, in any environment.

When they land, `eops_app` grants `crm_app` `USAGE` on `eops` and `SELECT` on exactly those two
views — never on a table, and never from our side. That inverts one assertion in the verification
block above: `has_schema_privilege('crm_app','eops','USAGE')` will become **true**. The invariant
that still must hold, and the one worth re-checking then, is that no *table* privilege follows:

```sql
-- after the grant: expect t (schema visible)
SELECT has_schema_privilege('crm_app','eops','USAGE');

-- after the grant: still expect 0 rows — views only, no tables
SELECT c.relname, c.relkind
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'eops' AND c.relkind NOT IN ('v','m')
   AND has_table_privilege('crm_app', c.oid, 'SELECT');
```

Ownership is what protects `eops` once visibility is granted: every object there is owned by
`eops_app`, so a non-superuser `crm_app` cannot alter or drop them however much it can see. **That is
only true while `DATABASE_URL` names a non-superuser** — which is why the grant must not be made in
production until the runbook above has been executed there.

`availability.router.ts` already handles the pre-grant world: it catches `42501`
(insufficient_privilege) and `42P01`/`3F000` (relation or schema absent) and returns
`{ status: 'unavailable' }`, so the estimate builder renders normally today and starts showing
availability the moment the grant is made — no deploy, no flag. Any other error is rethrown, because
a silent empty result would read as "nobody is free".

Note the AI assistant's SQL denylist in `sql-safety.service.ts` still blocks `eops.` and stays that
way. That guards a generic LLM-generated-SQL escape hatch, which should not reach another
application's data even once the app role can.

## Related: the read contract

Employee Ops reads `projects`, `companies`, `users`, `project_members`, `deals`, `estimates`,
`estimate_team_lines` and `delivery_roles`, declaring them as foreign read-only definitions — so a
rename breaks it at runtime with no compile-time signal on either side. Flag renames or drops of
those columns before they ship.

Only `projects`, `companies` and `deals` carry `deleted_at`. `users`, `project_members`,
`estimates`, `estimate_team_lines` and `delivery_roles` do **not**, so "filter `deleted_at IS NULL`
on every read" does not apply to them.

Two paths hard-delete rows Employee Ops may reference:

- `project_members` churns constantly — `project-sync.service.ts` wipes and reinserts every
  member on each deal→project mirror, and the projects router deletes single rows.
- `npm run reset:projects` deletes **every** project with no `WHERE`, soft-deleted rows included.
  It now requires `CONFIRM_PROJECT_RESET=YES`.

Employee Ops stores CRM project ids without a foreign key — deliberately, since a cross-schema
constraint would make deletes that used to succeed start failing — so a hard delete leaves a
dangling reference that nothing detects.
