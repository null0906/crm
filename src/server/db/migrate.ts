import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool, type PoolConfig } from 'pg';
import path from 'path';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

async function runMigrations() {
  const poolConfig: PoolConfig & { family: 4 } = {
    connectionString: process.env.DATABASE_URL!,
    family: 4,
  };
  const pool = new Pool(poolConfig);
  const db = drizzle(pool);

  console.log('Running database migrations...');
  await migrate(db, { migrationsFolder: path.join(process.cwd(), 'src/server/db/migrations') });
  console.log('Migrations complete.');

  const pipelines = await pool.query<{ id: string; name: string; pipeline_type: string | null; is_sales_pipeline: boolean }>(
    'SELECT id, name, pipeline_type, is_sales_pipeline FROM pipelines ORDER BY name'
  );

  console.log('=== PIPELINE TYPE VERIFICATION ===');
  pipelines.rows.forEach((p) => {
    console.log(`  ${(p.pipeline_type ?? 'null').padEnd(20)} onboarding=${String(p.is_sales_pipeline).padEnd(5)} → ${p.name}`);
  });

  const hasActiveDelivery = pipelines.rows.some((p) => p.pipeline_type === 'active_delivery');
  if (!hasActiveDelivery) {
    console.warn(
      'WARNING: No pipeline tagged as active_delivery. ' +
      'The Active Pipeline Kanban enhancements will not render. ' +
      "Manually run: UPDATE pipelines SET pipeline_type = 'active_delivery' WHERE name = 'Active Pipeline';"
    );
  }
  console.log('==================================');

  await pool.end();
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
