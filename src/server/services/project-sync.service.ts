import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import {
  activities,
  dealTeamMembers,
  deals,
  pipelineStages,
  pipelines,
  projectMembers,
  projects,
  projectStageHistory,
} from '@/server/db/schema';
import eventBus from '@/server/lib/event-bus';
import { getProjectStageProgress } from '@/lib/projects';
import type { ProjectServiceType, ProjectStage, ProjectStatus } from '@/lib/types';

const STAGE_MAP: Record<string, ProjectStage> = {
  'project kickstarted': 'kickoff',
  kickoff: 'kickoff',
  onboarding: 'kickoff',
  'gap assessment': 'gap_assessment',
  'internal audit': 'internal_audit',
  'external audit': 'external_audit',
  'external audit & certified': 'external_audit',
  certified: 'certified',
  lost: 'cancelled',
};

function normalizeStageName(name: string) {
  return name.trim().toLowerCase();
}

function toProjectStage(stageName: string): ProjectStage | null {
  const normalized = normalizeStageName(stageName);
  return STAGE_MAP[normalized] ?? Object.entries(STAGE_MAP).find(([key]) => normalized.includes(key))?.[1] ?? null;
}

function statusForStage(stage: ProjectStage): ProjectStatus {
  if (stage === 'certified') return 'completed';
  if (stage === 'cancelled') return 'cancelled';
  if (stage === 'on_hold') return 'on_hold';
  return 'active';
}

function normalizeMemberRole(role: string | null | undefined) {
  return ['lead', 'member', 'reviewer', 'consultant'].includes(role ?? '') ? role as 'lead' | 'member' | 'reviewer' | 'consultant' : 'member';
}

export function inferServiceType(deal: { title?: string | null; services?: unknown; serviceOther?: string | null }): ProjectServiceType {
  const text = `${deal.title ?? ''} ${JSON.stringify(deal.services ?? [])} ${deal.serviceOther ?? ''}`.toLowerCase();
  if (text.includes('soc 2 type 2') || text.includes('soc2 type 2') || text.includes('type ii')) return 'soc2_type2';
  if (text.includes('soc 2') || text.includes('soc2')) return 'soc2_type1';
  if (text.includes('iso 27001') || text.includes('iso27001')) return 'iso27001';
  if (text.includes('dpdp')) return 'dpdp';
  if (text.includes('vapt')) return 'vapt';
  if (text.includes('cspm')) return 'cspm';
  if (text.includes('ai governance')) return 'ai_governance';
  if (text.includes('cert-in') || text.includes('certin')) return 'cert_in';
  return 'custom';
}

async function getDealWithPipeline(dealId: string) {
  const [deal] = await db
    .select({
      id: deals.id,
      title: deals.title,
      amount: deals.amount,
      currency: deals.currency,
      companyId: deals.companyId,
      primaryContactId: deals.primaryContactId,
      projectStartDate: deals.projectStartDate,
      projectEndDate: deals.projectEndDate,
      projectProgressPercent: deals.projectProgressPercent,
      isDelayed: deals.isDelayed,
      delayReason: deals.delayReason,
      revisedEndDate: deals.revisedEndDate,
      ownerId: deals.ownerId,
      createdBy: deals.createdBy,
      services: deals.services,
      serviceOther: deals.serviceOther,
      linkedProjectId: deals.linkedProjectId,
      stageName: pipelineStages.name,
      pipelineType: pipelines.pipelineType,
    })
    .from(deals)
    .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .innerJoin(pipelines, eq(deals.pipelineId, pipelines.id))
    .where(and(eq(deals.id, dealId), isNull(deals.deletedAt)))
    .limit(1);

  return deal ?? null;
}

export async function createProjectFromDeal(dealId: string, movedByUserId: string): Promise<string | null> {
  const deal = await getDealWithPipeline(dealId);
  if (!deal) return null;
  if (!['active_delivery', 'compliance'].includes(deal.pipelineType ?? '')) return null;
  if (deal.linkedProjectId) return deal.linkedProjectId;

  const projectStage = toProjectStage(deal.stageName ?? '') ?? 'kickoff';
  const [project] = await db
    .insert(projects)
    .values({
      name: deal.title,
      dealId: deal.id,
      companyId: deal.companyId,
      primaryContactId: deal.primaryContactId,
      serviceType: inferServiceType(deal),
      stage: projectStage,
      stageEnteredAt: new Date(),
      startDate: deal.projectStartDate,
      endDate: deal.projectEndDate,
      progressPercent: getProjectStageProgress(projectStage),
      isDelayed: deal.isDelayed ?? false,
      delayReason: deal.delayReason,
      revisedEndDate: deal.revisedEndDate,
      contractValue: deal.amount,
      currency: deal.currency ?? 'INR',
      ownerId: deal.ownerId,
      createdBy: movedByUserId,
      status: statusForStage(projectStage),
    })
    .returning();

  if (!project) return null;

  await db
    .update(deals)
    .set({
      linkedProjectId: project.id,
      projectProgressPercent: getProjectStageProgress(projectStage),
    })
    .where(eq(deals.id, dealId));

  await db.insert(projectStageHistory).values({
    projectId: project.id,
    fromStage: null,
    toStage: projectStage,
    movedBy: movedByUserId,
    enteredAt: new Date(),
  });

  const teamMembers = await db
    .select({
      userId: dealTeamMembers.userId,
      role: dealTeamMembers.role,
    })
    .from(dealTeamMembers)
    .where(eq(dealTeamMembers.dealId, dealId));

  if (teamMembers.length > 0) {
    await db
      .insert(projectMembers)
      .values(teamMembers.map((member) => ({
        projectId: project.id,
        userId: member.userId,
        role: normalizeMemberRole(member.role),
      })))
      .onConflictDoNothing();
  }

  await db.insert(activities).values({
    activityType: 'note',
    subject: `Project created: "${project.name}"`,
    dealId,
    companyId: deal.companyId,
    contactId: deal.primaryContactId,
    performedBy: movedByUserId,
    isAutomated: true,
    occurredAt: new Date(),
    metadata: { projectId: project.id, trigger: 'stage_change' },
  });

  eventBus.emit('project.created', {
    projectId: project.id,
    dealId,
    companyId: deal.companyId,
    createdBy: movedByUserId,
  });

  return project.id;
}

export async function syncStageToProject(dealId: string, newStageName: string, movedByUserId: string): Promise<void> {
  const deal = await getDealWithPipeline(dealId);
  if (!deal?.linkedProjectId) return;

  const projectStage = toProjectStage(newStageName);
  if (!projectStage) return;

  const [project] = await db.select().from(projects).where(eq(projects.id, deal.linkedProjectId)).limit(1);
  if (!project || project.stage === projectStage) return;

  await db
    .update(projectStageHistory)
    .set({ exitedAt: new Date() })
    .where(and(eq(projectStageHistory.projectId, project.id), isNull(projectStageHistory.exitedAt)));

  await db.insert(projectStageHistory).values({
    projectId: project.id,
    fromStage: project.stage,
    toStage: projectStage,
    movedBy: movedByUserId,
    enteredAt: new Date(),
  });

  const newStatus = statusForStage(projectStage);
  await db
    .update(projects)
    .set({
      stage: projectStage,
      stageEnteredAt: new Date(),
      progressPercent: getProjectStageProgress(projectStage),
      status: newStatus,
      actualEndDate: newStatus === 'completed' ? new Date().toISOString().slice(0, 10) : project.actualEndDate,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, project.id));

  await db
    .update(deals)
    .set({
      projectProgressPercent: getProjectStageProgress(projectStage),
      updatedAt: new Date(),
    })
    .where(eq(deals.id, dealId));

  eventBus.emit('project.stage_changed', {
    projectId: project.id,
    fromStage: project.stage,
    toStage: projectStage,
    movedBy: movedByUserId,
  });
}

export async function syncProgressToProject(
  dealId: string,
  progressPercent: number,
  isDelayed = false,
  delayReason?: string | null,
  revisedEndDate?: string | Date | null
): Promise<void> {
  const [deal] = await db
    .select({ linkedProjectId: deals.linkedProjectId })
    .from(deals)
    .where(eq(deals.id, dealId))
    .limit(1);

  if (!deal?.linkedProjectId) return;

  await db
    .update(projects)
    .set({
      progressPercent,
      isDelayed,
      delayReason: delayReason ?? null,
      revisedEndDate: revisedEndDate instanceof Date ? revisedEndDate.toISOString().slice(0, 10) : revisedEndDate ?? null,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, deal.linkedProjectId));
}

export async function maybeCreateOrSyncProjectForDealStage(dealId: string, toStageName: string, movedByUserId: string) {
  const normalized = normalizeStageName(toStageName);
  const isKickoffStage = ['project kickstarted', 'kickoff', 'onboarding'].some((stage) => normalized.includes(stage));
  if (isKickoffStage) {
    await createProjectFromDeal(dealId, movedByUserId);
    return;
  }
  await syncStageToProject(dealId, toStageName, movedByUserId);
}

export async function ensureProjectBacklinks() {
  await db.execute(sql`
    UPDATE deals d
    SET linked_project_id = p.id
    FROM projects p
    WHERE p.deal_id = d.id
      AND d.linked_project_id IS NULL
  `);
}

export function registerProjectSyncListeners() {
  eventBus.on('deal.stage_changed', async ({ dealId, toStageId, movedBy }) => {
    const [stage] = await db.select({ name: pipelineStages.name }).from(pipelineStages).where(eq(pipelineStages.id, toStageId)).limit(1);
    if (!stage) return;
    await maybeCreateOrSyncProjectForDealStage(dealId, stage.name, movedBy).catch((err) => {
      console.error('[ProjectSync] Stage sync failed:', err);
    });
  });

  eventBus.on('deal.progress_updated', async ({ dealId, progressPercent, isDelayed, delayReason, revisedEndDate }) => {
    await syncProgressToProject(dealId, progressPercent, isDelayed, delayReason, revisedEndDate).catch((err) => {
      console.error('[ProjectSync] Progress sync failed:', err);
    });
  });
}
