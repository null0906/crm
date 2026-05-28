import { loadEnvConfig } from '@next/env';
import { and, eq, isNull, sql } from 'drizzle-orm';

loadEnvConfig(process.cwd());

async function resetProjectsFromActivePipeline() {
  const { db } = await import('@/server/db');
  const { deals, pipelines, projectMembers, projects, projectStageHistory, projectTasks } = await import('@/server/db/schema');
  const { createProjectFromDeal } = await import('@/server/services/project-sync.service');

  console.log('Resetting Projects from Active Pipeline...');

  const activeDeals = await db
    .select({
      id: deals.id,
      title: deals.title,
      createdBy: deals.createdBy,
    })
    .from(deals)
    .innerJoin(pipelines, eq(pipelines.id, deals.pipelineId))
    .where(and(
      eq(pipelines.pipelineType, 'active_delivery'),
      isNull(deals.deletedAt)
    ));

  console.log(`Found ${activeDeals.length} Active Pipeline prospects to mirror`);

  await db.delete(projectTasks);
  await db.delete(projectMembers);
  await db.delete(projectStageHistory);
  await db.delete(projects);
  await db.execute(sql`UPDATE deals SET linked_project_id = NULL WHERE linked_project_id IS NOT NULL`);

  for (const deal of activeDeals) {
    try {
      const projectId = await createProjectFromDeal(deal.id, deal.createdBy);
      if (projectId) {
        console.log(`  Rebuilt project for: ${deal.title}`);
      } else {
        console.log(`  Skipped: ${deal.title}`);
      }
    } catch (err) {
      console.error(`  Failed to rebuild project for ${deal.title}:`, err);
      throw err;
    }
  }

  console.log('Project reset complete.');
}

resetProjectsFromActivePipeline()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
