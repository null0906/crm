import { loadEnvConfig } from '@next/env';
import { and, eq, isNull, or } from 'drizzle-orm';

loadEnvConfig(process.cwd());

async function backfillProjects() {
  const { db } = await import('@/server/db');
  const { deals, pipelines } = await import('@/server/db/schema');
  const { createOrSyncProjectFromDeal } = await import('@/server/services/project-sync.service');

  console.log('Starting project backfill...');

  const deliveryDeals = await db
    .select({
      id: deals.id,
      title: deals.title,
      createdBy: deals.createdBy,
    })
    .from(deals)
    .innerJoin(pipelines, eq(pipelines.id, deals.pipelineId))
    .where(and(
      or(eq(pipelines.pipelineType, 'active_delivery'), eq(pipelines.pipelineType, 'compliance')),
      isNull(deals.deletedAt),
      eq(deals.status, 'open')
    ));

  console.log(`Found ${deliveryDeals.length} delivery/compliance deals to create or sync`);

  for (const deal of deliveryDeals) {
    try {
      const projectId = await createOrSyncProjectFromDeal(deal.id, deal.createdBy);
      if (projectId) {
        console.log(`  Synced project for deal: ${deal.title}`);
      } else {
        console.log(`  Skipped deal: ${deal.title}`);
      }
    } catch (err) {
      console.error(`  Failed for deal ${deal.title}:`, err);
    }
  }

  console.log('Backfill complete.');
}

backfillProjects()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
