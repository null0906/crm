import { loadEnvConfig } from '@next/env';
import { and, eq, isNull } from 'drizzle-orm';

loadEnvConfig(process.cwd());

async function backfillProjects() {
  const { db } = await import('@/server/db');
  const { deals, pipelines } = await import('@/server/db/schema');
  const { createProjectFromDeal } = await import('@/server/services/project-sync.service');

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
      eq(pipelines.pipelineType, 'active_delivery'),
      isNull(deals.deletedAt),
      eq(deals.status, 'open'),
      isNull(deals.linkedProjectId)
    ));

  console.log(`Found ${deliveryDeals.length} deals to backfill`);

  for (const deal of deliveryDeals) {
    try {
      const projectId = await createProjectFromDeal(deal.id, deal.createdBy);
      if (projectId) {
        console.log(`  Created project for deal: ${deal.title}`);
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
