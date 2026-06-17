import { loadEnvConfig } from '@next/env';
import { and, eq, isNull } from 'drizzle-orm';

loadEnvConfig(process.cwd());

async function run() {
  const { db } = await import('@/server/db');
  const { deals, pipelines, pipelineStages, onboardings } = await import('@/server/db/schema');
  const { createOnboardingFromDeal } = await import('@/server/services/onboarding.service');

  const wonDeals = await db
    .select({
      id: deals.id,
      title: deals.title,
      createdBy: deals.createdBy,
    })
    .from(deals)
    .innerJoin(pipelines, eq(pipelines.id, deals.pipelineId))
    .innerJoin(pipelineStages, eq(pipelineStages.id, deals.stageId))
    .leftJoin(onboardings, eq(onboardings.dealId, deals.id))
    .where(and(
      isNull(deals.deletedAt),
      eq(pipelines.isSalesPipeline, true),
      eq(pipelineStages.stageType, 'won'),
      isNull(onboardings.id)
    ));

  console.log(`Found ${wonDeals.length} closed-won prospects without onboarding.`);
  let created = 0;

  for (const deal of wonDeals) {
    try {
      const onboarding = await createOnboardingFromDeal(deal.id, deal.createdBy);
      if (onboarding) {
        created += 1;
        console.log(`  Created onboarding for ${deal.title}`);
      }
    } catch (error) {
      console.error(`  Failed for ${deal.title}:`, error);
    }
  }

  console.log(`Onboarding backfill complete. Created ${created} records.`);
}

run().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
