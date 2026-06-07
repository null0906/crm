import { loadEnvConfig } from '@next/env';
import { and, asc, isNotNull, isNull } from 'drizzle-orm';

loadEnvConfig(process.cwd());

async function run() {
  const { db } = await import('@/server/db');
  const { deals } = await import('@/server/db/schema');
  const { syncContactActivitiesToDeal } = await import('@/server/services/activity-sync.service');
  const rows = await db.select({
    id: deals.id,
    primaryContactId: deals.primaryContactId,
    createdBy: deals.createdBy,
  }).from(deals).where(and(isNotNull(deals.primaryContactId), isNull(deals.deletedAt))).orderBy(asc(deals.createdAt));

  let total = 0;
  for (const row of rows) {
    total += await syncContactActivitiesToDeal(row.id, row.primaryContactId!, row.createdBy);
  }
  console.log(`Activity sync complete. Synced ${total} historical activities across ${rows.length} prospects.`);
}

run().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
