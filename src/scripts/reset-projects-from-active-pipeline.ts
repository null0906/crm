import { loadEnvConfig } from '@next/env';
import { and, eq, isNull, sql } from 'drizzle-orm';

loadEnvConfig(process.cwd());

/**
 * This script hard-deletes every row in projects, project_members, project_stage_history
 * and project_tasks — with no WHERE clause, so soft-deleted rows go too — and then
 * rebuilds from the active pipeline. Any project id not regenerated is gone permanently.
 *
 * That now reaches beyond this codebase. The Employee Ops platform stores CRM project ids
 * in its own schema without a foreign key (deliberately: a cross-schema constraint would
 * make deletes that used to succeed start failing), so a hard-deleted project leaves a
 * dangling reference on the other side that nothing detects.
 *
 * Hence an explicit opt-in, matching the pattern in clone-production-to-local.sh.
 */
function assertConfirmed() {
  if (process.env.CONFIRM_PROJECT_RESET === 'YES') return;

  console.error(
    [
      'Refusing to reset projects without explicit confirmation.',
      '',
      'This DELETES ALL rows in projects, project_members, project_stage_history and',
      'project_tasks — including soft-deleted ones — then rebuilds them from the active',
      'pipeline. Project ids that are not regenerated are lost, and the Employee Ops',
      'platform references those ids without a foreign key to protect them.',
      '',
      'Run with:',
      '  CONFIRM_PROJECT_RESET=YES npm run reset:projects',
    ].join('\n')
  );
  process.exit(1);
}

async function resetProjectsFromActivePipeline() {
  assertConfirmed();

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
