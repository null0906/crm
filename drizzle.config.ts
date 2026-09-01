import type { Config } from 'drizzle-kit';

export default {
  schema: './src/server/db/schema/index.ts',
  out: './src/server/db/migrations',
  dialect: 'postgresql',
  // Pinned to this application's schema. The instance is shared with the Employee Ops
  // platform, which owns `eops`, `auth` and `eops_migrations`. This matches drizzle-kit's
  // current default, so it changes nothing today — it is set explicitly so that a future
  // default change cannot silently widen introspection onto a neighbour's tables.
  //
  // Note this only constrains the commands that actually connect: `push`, `studio` and
  // `pull`. `generate` never opens a connection at all. The real protection is that
  // DATABASE_URL names a non-superuser — see src/scripts/sql/crm-app-role.sql.
  schemaFilter: ['public'],
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
