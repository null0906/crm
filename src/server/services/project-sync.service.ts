import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import {
  activities,
  dealStageHistory,
  dealTeamMembers,
  dealTasks,
  deals,
  pipelineStages,
  pipelines,
  projectMembers,
  projects,
  projectStageHistory,
  projectTasks,
} from '@/server/db/schema';
import eventBus from '@/server/lib/event-bus';
import { PROJECT_STAGES, getProjectStageProgress, mapPipelineStageToProjectStage } from '@/lib/projects';
import type { DealStatus, DealTaskStatus, ProjectServiceType, ProjectStage, ProjectStatus, ProjectTaskStatus } from '@/lib/types';

const STAGE_MAP: Record<string, ProjectStage> = {
  'project kickstarted': 'kickoff',
  kickoff: 'kickoff',
  onboarding: 'kickoff',
  'gap assessment': 'gap_assessment',
  implementation: 'implementation',
  'internal audit': 'internal_audit',
  'external audit': 'external_audit',
  'external audit & certified': 'external_audit',
  certified: 'external_audit',
  lost: 'cancelled',
};

function normalizeStageName(name: string) {
  return name.trim().toLowerCase();
}

function toProjectStage(stageName: string): ProjectStage | null {
  const normalized = normalizeStageName(stageName);
  return STAGE_MAP[normalized] ?? Object.entries(STAGE_MAP).find(([key]) => normalized.includes(key))?.[1] ?? mapPipelineStageToProjectStage({ name: stageName });
}

function isCompleteProgress(value: unknown) {
  return Number(value ?? 0) >= 100;
}

function resolveProjectStage(deal: { stageName?: string | null; projectProgressPercent?: number | null; projectActualEndDate?: string | Date | null }): ProjectStage {
  return toProjectStage(deal.stageName ?? '') ?? 'kickoff';
}

function progressForDealStage(deal: { stageName?: string | null; projectProgressPercent?: number | null; projectActualEndDate?: string | Date | null }) {
  const projectStage = resolveProjectStage(deal);
  return Math.max(Number(deal.projectProgressPercent ?? 0), getProjectStageProgress(projectStage));
}

function statusForStage(stage: ProjectStage): ProjectStatus {
  if (stage === 'certified') return 'completed';
  if (stage === 'cancelled') return 'cancelled';
  if (stage === 'on_hold') return 'on_hold';
  return 'active';
}

function dealStatusForProjectStage(stage: ProjectStage): DealStatus {
  if (stage === 'certified') return 'won';
  if (stage === 'cancelled') return 'lost';
  return 'open';
}

function projectStageLabel(stage: ProjectStage) {
  return PROJECT_STAGES.find((item) => item.key === stage)?.label ?? stage;
}

function normalizeMemberRole(role: string | null | undefined) {
  return ['lead', 'member', 'reviewer', 'consultant'].includes(role ?? '') ? role as 'lead' | 'member' | 'reviewer' | 'consultant' : 'member';
}

function normalizeProjectTaskStatus(status: string | null | undefined): ProjectTaskStatus {
  return ['pending', 'in_progress', 'completed', 'blocked', 'not_applicable'].includes(status ?? '')
    ? status as ProjectTaskStatus
    : 'pending';
}

function normalizeDealTaskStatus(status: string | null | undefined): DealTaskStatus {
  return ['pending', 'in_progress', 'completed', 'blocked'].includes(status ?? '')
    ? status as DealTaskStatus
    : 'pending';
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
      description: deals.description,
      amount: deals.amount,
      currency: deals.currency,
      companyId: deals.companyId,
      primaryContactId: deals.primaryContactId,
      projectStartDate: deals.projectStartDate,
      projectEndDate: deals.projectEndDate,
      projectActualEndDate: deals.projectActualEndDate,
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

async function getProjectWithDeal(projectId: string) {
  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      dealId: projects.dealId,
      companyId: projects.companyId,
      primaryContactId: projects.primaryContactId,
      serviceType: projects.serviceType,
      stage: projects.stage,
      startDate: projects.startDate,
      endDate: projects.endDate,
      actualEndDate: projects.actualEndDate,
      progressPercent: projects.progressPercent,
      isDelayed: projects.isDelayed,
      delayReason: projects.delayReason,
      revisedEndDate: projects.revisedEndDate,
      contractValue: projects.contractValue,
      currency: projects.currency,
      ownerId: projects.ownerId,
      createdBy: projects.createdBy,
      dealStatus: deals.status,
      dealActualCloseDate: deals.actualCloseDate,
      dealPipelineId: deals.pipelineId,
      dealStageId: deals.stageId,
    })
    .from(projects)
    .leftJoin(deals, eq(projects.dealId, deals.id))
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .limit(1);

  return project ?? null;
}

async function findDealStageForProjectStage(pipelineId: string, projectStage: ProjectStage) {
  const label = projectStageLabel(projectStage);
  const searchTermsByStage: Record<ProjectStage, string[]> = {
    kickoff: ['project kickstarted', 'kickoff', 'onboarding'],
    gap_assessment: ['gap assessment'],
    implementation: ['implementation'],
    internal_audit: ['internal audit'],
    external_audit: ['external audit'],
    certified: ['external audit & certified', 'certified'],
    on_hold: ['on hold'],
    cancelled: ['cancelled', 'lost'],
  };

  const terms = searchTermsByStage[projectStage] ?? [label];
  for (const term of terms) {
    const [stage] = await db
      .select({ id: pipelineStages.id, stageType: pipelineStages.stageType })
      .from(pipelineStages)
      .where(and(eq(pipelineStages.pipelineId, pipelineId), sql`lower(${pipelineStages.name}) LIKE ${`%${term.toLowerCase()}%`}`))
      .orderBy(pipelineStages.position)
      .limit(1);
    if (stage) return stage;
  }

  return null;
}

export async function createProjectFromDeal(dealId: string, movedByUserId: string): Promise<string | null> {
  const deal = await getDealWithPipeline(dealId);
  if (!deal) return null;
  if (!['active_delivery', 'compliance'].includes(deal.pipelineType ?? '')) return null;
  if (deal.linkedProjectId) return deal.linkedProjectId;

  const projectStage = resolveProjectStage(deal);
  const projectProgress = progressForDealStage(deal);
  const [project] = await db
    .insert(projects)
    .values({
      name: deal.title,
      description: deal.description,
      dealId: deal.id,
      companyId: deal.companyId,
      primaryContactId: deal.primaryContactId,
      serviceType: inferServiceType(deal),
      stage: projectStage,
      stageEnteredAt: new Date(),
      startDate: deal.projectStartDate,
      endDate: deal.projectEndDate,
      actualEndDate: deal.projectActualEndDate,
      progressPercent: projectProgress,
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
      projectProgressPercent: projectProgress,
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

  const existingTasks = await db.select().from(dealTasks).where(eq(dealTasks.dealId, dealId));
  if (existingTasks.length > 0) {
    await db.insert(projectTasks).values(existingTasks.map((task) => ({
      projectId: project.id,
      title: task.title,
      description: task.description,
      status: normalizeProjectTaskStatus(task.status),
      priority: task.priority,
      assignedTo: task.assignedTo,
      dueDate: task.dueDate,
      completedAt: task.completedAt,
      position: task.position,
      createdBy: task.createdBy,
    }))).onConflictDoNothing();
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

export async function createOrSyncProjectFromDeal(dealId: string, movedByUserId: string): Promise<string | null> {
  const projectId = await createProjectFromDeal(dealId, movedByUserId);
  await syncDealFieldsToProject(dealId);
  return projectId;
}

export async function syncDealFieldsToProject(dealId: string): Promise<void> {
  const deal = await getDealWithPipeline(dealId);
  if (!deal) return;
  if (!['active_delivery', 'compliance'].includes(deal.pipelineType ?? '')) return;

  const projectId = deal.linkedProjectId ?? await createProjectFromDeal(dealId, deal.createdBy);
  if (!projectId) return;

  const projectStage = resolveProjectStage(deal);
  const progressPercent = progressForDealStage(deal);

  await db
    .update(projects)
    .set({
      name: deal.title,
      description: deal.description,
      companyId: deal.companyId,
      primaryContactId: deal.primaryContactId,
      serviceType: inferServiceType(deal),
      stage: projectStage,
      progressPercent,
      status: statusForStage(projectStage),
      startDate: deal.projectStartDate,
      endDate: deal.projectEndDate,
      actualEndDate: deal.projectActualEndDate,
      isDelayed: deal.isDelayed ?? false,
      delayReason: deal.delayReason,
      revisedEndDate: deal.revisedEndDate,
      contractValue: deal.amount,
      currency: deal.currency ?? 'INR',
      ownerId: deal.ownerId,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

  await db
    .update(deals)
    .set({
      linkedProjectId: projectId,
      updatedAt: new Date(),
    })
    .where(eq(deals.id, dealId));
}

export async function syncProjectFieldsToDeal(projectId: string, movedByUserId?: string): Promise<void> {
  const project = await getProjectWithDeal(projectId);
  if (!project?.dealId) return;

  const terminalStatus = project.stage === 'certified' || project.stage === 'cancelled'
    ? dealStatusForProjectStage(project.stage)
    : null;
  const nextStatus = terminalStatus ?? project.dealStatus ?? 'open';
  let nextStageId = project.dealStageId;
  const matchingStage = project.dealPipelineId ? await findDealStageForProjectStage(project.dealPipelineId, project.stage) : null;
  if (matchingStage) nextStageId = matchingStage.id;

  const stageChanged = Boolean(nextStageId && nextStageId !== project.dealStageId);
  await db
    .update(deals)
    .set({
      title: project.name,
      description: project.description,
      companyId: project.companyId,
      primaryContactId: project.primaryContactId,
      amount: project.contractValue,
      currency: project.currency ?? 'INR',
      ownerId: project.ownerId,
      projectStartDate: project.startDate,
      projectEndDate: project.endDate,
      projectActualEndDate: project.actualEndDate,
      projectProgressPercent: project.progressPercent,
      isDelayed: project.isDelayed ?? false,
      delayReason: project.delayReason,
      revisedEndDate: project.revisedEndDate,
      linkedProjectId: project.id,
      ...(nextStageId ? { stageId: nextStageId } : {}),
      status: nextStatus,
      stageEnteredAt: stageChanged ? new Date() : undefined,
      actualCloseDate: terminalStatus ? new Date().toISOString().slice(0, 10) : project.dealActualCloseDate,
      updatedAt: new Date(),
    })
    .where(eq(deals.id, project.dealId));

  if (stageChanged && movedByUserId) {
    await db
      .update(dealStageHistory)
      .set({ exitedAt: new Date() })
      .where(and(eq(dealStageHistory.dealId, project.dealId), isNull(dealStageHistory.exitedAt)));

    await db.insert(dealStageHistory).values({
      dealId: project.dealId,
      fromStageId: project.dealStageId,
      toStageId: nextStageId!,
      movedBy: movedByUserId,
      enteredAt: new Date(),
    });
  }
}

export async function createOrSyncDealFromProject(projectId: string, movedByUserId?: string): Promise<string | null> {
  const project = await getProjectWithDeal(projectId);
  if (!project) return null;

  if (project.dealId) {
    await syncProjectFieldsToDeal(projectId, movedByUserId);
    return project.dealId;
  }

  const [activePipeline] = await db
    .select({ id: pipelines.id })
    .from(pipelines)
    .where(and(eq(pipelines.pipelineType, 'active_delivery'), eq(pipelines.isActive, true)))
    .orderBy(pipelines.position)
    .limit(1);

  if (!activePipeline) return null;

  const matchingStage = await findDealStageForProjectStage(activePipeline.id, project.stage);
  const [fallbackStage] = matchingStage
    ? [matchingStage]
    : await db
        .select({ id: pipelineStages.id, stageType: pipelineStages.stageType })
        .from(pipelineStages)
        .where(eq(pipelineStages.pipelineId, activePipeline.id))
        .orderBy(pipelineStages.position)
        .limit(1);

  if (!fallbackStage) return null;

  const [deal] = await db
    .insert(deals)
    .values({
      title: project.name,
      description: project.description,
      pipelineId: activePipeline.id,
      stageId: fallbackStage.id,
      amount: project.contractValue,
      currency: project.currency ?? 'INR',
      status: dealStatusForProjectStage(project.stage),
      companyId: project.companyId,
      primaryContactId: project.primaryContactId,
      projectStartDate: project.startDate,
      projectEndDate: project.endDate,
      projectActualEndDate: project.actualEndDate,
      projectProgressPercent: project.progressPercent,
      isDelayed: project.isDelayed ?? false,
      delayReason: project.delayReason,
      revisedEndDate: project.revisedEndDate,
      linkedProjectId: project.id,
      ownerId: project.ownerId,
      createdBy: movedByUserId ?? project.createdBy,
    })
    .returning();

  if (!deal) return null;

  await db
    .update(projects)
    .set({ dealId: deal.id, updatedAt: new Date() })
    .where(eq(projects.id, project.id));

  await db.insert(dealStageHistory).values({
    dealId: deal.id,
    fromStageId: null,
    toStageId: fallbackStage.id,
    movedBy: movedByUserId ?? project.createdBy,
    enteredAt: new Date(),
  });

  await syncProjectTeamToDeal(project.id);
  await syncProjectTasksToDeal(project.id);

  return deal.id;
}

export async function syncDealTeamToProject(dealId: string): Promise<void> {
  const [deal] = await db.select({ linkedProjectId: deals.linkedProjectId }).from(deals).where(eq(deals.id, dealId)).limit(1);
  if (!deal?.linkedProjectId) return;

  const members = await db.select().from(dealTeamMembers).where(eq(dealTeamMembers.dealId, dealId));
  await db.delete(projectMembers).where(eq(projectMembers.projectId, deal.linkedProjectId));
  if (members.length) {
    await db.insert(projectMembers).values(members.map((member) => ({
      projectId: deal.linkedProjectId!,
      userId: member.userId,
      role: normalizeMemberRole(member.role),
    }))).onConflictDoNothing();
  }
}

export async function syncProjectTeamToDeal(projectId: string): Promise<void> {
  const [project] = await db.select({ dealId: projects.dealId }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project?.dealId) return;

  const members = await db.select().from(projectMembers).where(eq(projectMembers.projectId, projectId));
  await db.delete(dealTeamMembers).where(eq(dealTeamMembers.dealId, project.dealId));
  if (members.length) {
    await db.insert(dealTeamMembers).values(members.map((member) => ({
      dealId: project.dealId!,
      userId: member.userId,
      role: member.role ?? 'member',
    }))).onConflictDoNothing();
  }
}

export async function syncDealTasksToProject(dealId: string): Promise<void> {
  const [deal] = await db.select({ linkedProjectId: deals.linkedProjectId }).from(deals).where(eq(deals.id, dealId)).limit(1);
  if (!deal?.linkedProjectId) return;

  const tasks = await db.select().from(dealTasks).where(eq(dealTasks.dealId, dealId));
  await db.delete(projectTasks).where(eq(projectTasks.projectId, deal.linkedProjectId));
  if (tasks.length) {
    await db.insert(projectTasks).values(tasks.map((task) => ({
      projectId: deal.linkedProjectId!,
      title: task.title,
      description: task.description,
      status: normalizeProjectTaskStatus(task.status),
      priority: task.priority,
      assignedTo: task.assignedTo,
      dueDate: task.dueDate,
      completedAt: task.completedAt,
      position: task.position,
      createdBy: task.createdBy,
    }))).onConflictDoNothing();
  }
}

export async function syncProjectTasksToDeal(projectId: string): Promise<void> {
  const [project] = await db.select({ dealId: projects.dealId }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project?.dealId) return;

  const tasks = await db.select().from(projectTasks).where(eq(projectTasks.projectId, projectId));
  await db.delete(dealTasks).where(eq(dealTasks.dealId, project.dealId));
  if (tasks.length) {
    await db.insert(dealTasks).values(tasks
      .filter((task) => task.status !== 'not_applicable')
      .map((task) => ({
        dealId: project.dealId!,
        title: task.title,
        description: task.description,
        status: normalizeDealTaskStatus(task.status),
        priority: task.priority,
        assignedTo: task.assignedTo,
        dueDate: task.dueDate,
        completedAt: task.completedAt,
        position: task.position,
        createdBy: task.createdBy,
      }))).onConflictDoNothing();
  }
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
