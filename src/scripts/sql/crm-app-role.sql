--
-- crm-app-role.sql — create / refresh the least-privilege application role.
--
-- Run as the cluster admin (crm_user locally, postgres on Railway) connected to the
-- CRM database:
--
--   psql -v ON_ERROR_STOP=1 -v crm_app_password="'<secret>'" -f this-file
--
-- Idempotent. Re-run after any schema change made as the admin role — notably after
-- `npm run db:local:clone`, which restores as admin and strips privileges.
--
-- Why this exists: the instance is shared with the Employee Ops platform, whose `eops`,
-- `auth` and `eops_migrations` schemas this application must not be able to read or
-- drop. That isolation is the *role*, not the grants — a superuser bypasses every
-- GRANT. So DATABASE_URL must name a non-superuser.
--
-- Why NOT `REASSIGN OWNED BY <admin> TO crm_app`:
--   * crm_user is OID 10, the bootstrap superuser, which PostgreSQL *pins*.
--     shdepAddDependency() skips pinned roles, so no pg_shdepend owner rows exist for
--     it — verified on this instance: 0 rows. REASSIGN OWNED reads pg_shdepend and
--     would therefore succeed while changing nothing at all.
--   * Where the admin is NOT pinned, REASSIGN OWNED over-reaches instead: it also
--     moves databases, tablespaces and extensions.
--   The scoped loop below is correct in both cases.
--

\set ON_ERROR_STOP on

BEGIN;

-- ------------------------------------------------------------------- role ---
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_app') THEN
    EXECUTE 'CREATE ROLE crm_app LOGIN';
  END IF;
END
$$;

-- Outside the DO block on purpose: psql does not interpolate :'variables' inside
-- dollar-quoted strings. Attributes are restated on every run so a re-run repairs
-- drift (e.g. someone granting SUPERUSER by hand to clear a permission error).
ALTER ROLE crm_app WITH
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT
  PASSWORD :'crm_app_password';

-- --------------------------------------------------------------- database ---
DO $$
BEGIN
  -- CREATE is required, not cosmetic. drizzle's migrator opens every run with
  --   CREATE SCHEMA IF NOT EXISTS "drizzle"
  -- and CreateSchemaCommand checks ACL_CREATE on the database *before* the
  -- IF NOT EXISTS short-circuit. Without this grant, `npm run db:migrate` fails on
  -- its first statement — including on every Railway deploy, which starts with it.
  EXECUTE format('GRANT CONNECT, TEMPORARY, CREATE ON DATABASE %I TO crm_app',
                 current_database());

  -- Deterministic name resolution. The default ("$user", public) would resolve into
  -- a schema named crm_app if one ever appeared.
  EXECUTE format('ALTER ROLE crm_app IN DATABASE %I SET search_path = public',
                 current_database());
END
$$;

-- ---------------------------------------------------------------- schemas ---
-- `public` deliberately keeps its PG15+ owner, pg_database_owner. Granting CREATE is
-- sufficient: CREATE TABLE needs CREATE on the schema, while ALTER/DROP TABLE need
-- ownership of the *table*, which the loop below transfers. Taking ownership of
-- `public` would also imply it is CRM-private, which on a shared instance it is not.
GRANT USAGE, CREATE ON SCHEMA public TO crm_app;

-- `drizzle` is CRM-private bookkeeping, so crm_app owns it outright.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'drizzle') THEN
    EXECUTE 'ALTER SCHEMA drizzle OWNER TO crm_app';
  END IF;
END
$$;

-- ----------------------------------------------------- ownership transfer ---
-- Scoped equivalent of REASSIGN OWNED, restricted to public + drizzle. Only objects
-- owned by the role running this script move, so anything owned by eops_app is
-- structurally unreachable and re-runs are no-ops.
DO $$
DECLARE
  admin_role CONSTANT name := current_user;
  target     CONSTANT name := 'crm_app';
  obj        record;
  moved      integer := 0;
BEGIN
  IF admin_role = target THEN
    RAISE EXCEPTION 'Run this script as the admin role, not as %', target;
  END IF;

  -- Tables, partitioned/foreign tables, views, matviews, sequences.
  -- Excluded: 'i'/'t' (index and TOAST ownership follows the parent table, and
  -- ALTER INDEX ... OWNER TO is rejected outright), and anything owned by an
  -- extension — pg_trgm contributes 31 functions here that must not be touched.
  FOR obj IN
    SELECT c.oid::regclass AS ident, c.relkind
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('public', 'drizzle')
       AND c.relkind IN ('r', 'p', 'f', 'v', 'm', 'S')
       AND pg_get_userbyid(c.relowner) = admin_role
       AND NOT EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_class'::regclass
                          AND d.objid   = c.oid
                          AND d.deptype = 'e')
     ORDER BY 1
  LOOP
    EXECUTE format(
      CASE obj.relkind
        WHEN 'v' THEN 'ALTER VIEW %s OWNER TO %I'
        WHEN 'm' THEN 'ALTER MATERIALIZED VIEW %s OWNER TO %I'
        WHEN 'S' THEN 'ALTER SEQUENCE %s OWNER TO %I'
        ELSE          'ALTER TABLE %s OWNER TO %I'
      END, obj.ident, target);
    moved := moved + 1;
  END LOOP;

  -- Functions, procedures and aggregates. ALTER ROUTINE (PG11+) covers all three.
  -- Currently zero here once pg_trgm's members are excluded; kept for future migrations.
  FOR obj IN
    SELECT p.oid::regprocedure AS ident
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname IN ('public', 'drizzle')
       AND pg_get_userbyid(p.proowner) = admin_role
       AND NOT EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid   = p.oid
                          AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER ROUTINE %s OWNER TO %I', obj.ident, target);
    moved := moved + 1;
  END LOOP;

  -- Standalone types: enums, domains, ranges, standalone composites. Table row types,
  -- array types and multiranges follow their parent and are excluded. None exist today.
  FOR obj IN
    SELECT t.oid::regtype AS ident, t.typtype
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname IN ('public', 'drizzle')
       AND pg_get_userbyid(t.typowner) = admin_role
       AND t.typtype IN ('e', 'd', 'r', 'c')
       AND (t.typrelid = 0
            OR (SELECT c.relkind FROM pg_class c WHERE c.oid = t.typrelid) = 'c')
       AND NOT EXISTS (SELECT 1 FROM pg_type a WHERE a.typarray = t.oid)
       AND NOT EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_type'::regclass
                          AND d.objid   = t.oid
                          AND d.deptype IN ('e', 'i'))
  LOOP
    EXECUTE format(
      CASE obj.typtype WHEN 'd' THEN 'ALTER DOMAIN %s OWNER TO %I'
                       ELSE          'ALTER TYPE %s OWNER TO %I' END,
      obj.ident, target);
    moved := moved + 1;
  END LOOP;

  RAISE NOTICE 'crm-app-role: transferred % object(s) from % to %',
               moved, admin_role, target;
END
$$;

-- ------------------------------------------- Employee Ops read-only grants ---
-- Neither ALTER ... OWNER TO nor REASSIGN OWNED touches pg_default_acl. This instance
-- carries exactly one entry:
--     FOR ROLE crm_user IN SCHEMA public GRANT SELECT ON TABLES TO eops_app
-- The moment crm_app becomes the creating role, that entry stops applying and Employee
-- Ops silently loses SELECT on every *new* CRM table — a failure that surfaces in
-- another codebase, at runtime, months later. Re-declare it for crm_app and back-fill.
--
-- The back-fill also matters after `db:local:clone`, whose --no-privileges strips the
-- existing grants entirely.
--
-- The old crm_user default-ACL entry is deliberately left in place so that rolling
-- back (REASSIGN OWNED BY crm_app TO crm_user) needs no extra repair step.
--
-- Guarded on eops_app existing, so this same file runs unchanged on Railway.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'eops_app') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO eops_app';
    EXECUTE 'GRANT SELECT ON ALL TABLES IN SCHEMA public TO eops_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE crm_app IN SCHEMA public '
            'GRANT SELECT ON TABLES TO eops_app';
    RAISE NOTICE 'crm-app-role: refreshed eops_app read grants on public';
  END IF;
END
$$;

COMMIT;
