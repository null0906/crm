import { and, asc, desc, eq, ilike, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import {
  activities,
  companies,
  contacts,
  deals,
  pipelineStages,
  projectMembers,
  projects,
  projectStageHistory,
  projectTasks,
  users,
} from '@/server/db/schema';
import eventBus from '@/server/lib/event-bus';
import { PROJECT_STAGES, getProjectStageProgress } from '@/lib/projects';
import type { ProjectMemberRole, ProjectServiceType, ProjectStage, ProjectStatus, ProjectTaskStatus, SessionUser } from '@/lib/types';
import { createOrSyncDealFromProject, syncProjectFieldsToDeal } from './project-sync.service';

export interface ProjectListFilters {
  companyId?: string;
  stage?: string;
  status?: string;
  serviceType?: string;
  ownerId?: string;
  search?: string;
}

export interface ProjectCreateInput {
  name: string;
  description?: string | null;
  dealId?: string | null;
  companyId?: string | null;
  primaryContactId?: string | null;
  serviceType?: ProjectServiceType | null;
  stage?: ProjectStage | null;
  startDate?: string | null;
  endDate?: string | null;
  contractValue?: number | string | null;
  ownerId?: string | null;
}

function normalizeProjectData(data: Partial<ProjectCreateInput>) {
  return {
    ...data,
    contractValue: data.contractValue !== undefined && data.contractValue !== null
      ? data.contractValue.toString()
      : data.contractValue,
  };
}

function statusForStage(stage: ProjectStage): ProjectStatus {
  if (stage === 'certified') return 'completed';
  if (stage === 'cancelled') return 'cancelled';
  if (stage === 'on_hold') return 'on_hold';
  return 'active';
}

function stageLabel(stage: ProjectStage) {
  return PROJECT_STAGES.find((item) => item.key === stage)?.label ?? stage;
}

async function attachProjectDetails(rows: Array<Record<string, unknown>>) {
  const ids = rows.map((row) => row.id as string).filter(Boolean);
  if (ids.length === 0) return rows;

  const members = await db
    .select({
      id: projectMembers.id,
      projectId: projectMembers.projectId,
      role: projectMembers.role,
      userId: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      avatarUrl: users.avatarUrl,
    })
    .from(projectMembers)
    .innerJoin(users, eq(projectMembers.userId, users.id))
    .where(inArray(projectMembers.projectId, ids));

  const taskCounts = await db
    .select({
      projectId: projectTasks.projectId,
      total: sql<number>`COUNT(*)::int`,
      completed: sql<number>`COUNT(*) FILTER (WHERE ${projectTasks.status} = 'completed')::int`,
    })
    .from(projectTasks)
    .where(inArray(projectTasks.projectId, ids))
    .groupBy(projectTasks.projectId);

  return rows.map((row) => ({
    ...row,
    members: members
      .filter((member) => member.projectId === row.id)
      .map((member) => ({
        id: member.id,
        role: member.role,
        user: {
          id: member.userId,
          firstName: member.firstName,
          lastName: member.lastName,
          avatarUrl: member.avatarUrl,
        },
      })),
    taskCount: taskCounts.find((count) => count.projectId === row.id)?.total ?? 0,
    completedTaskCount: taskCounts.find((count) => count.projectId === row.id)?.completed ?? 0,
  }));
}

export const projectService = {
  async getById(id: string, _userId: string) {
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
        stageEnteredAt: projects.stageEnteredAt,
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
        status: projects.status,
        customFields: projects.customFields,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
        company: {
          id: companies.id,
          name: companies.name,
        },
        primaryContact: {
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          phone: contacts.phone,
          mobile: contacts.mobile,
          jobTitle: contacts.jobTitle,
        },
        deal: {
          id: deals.id,
          title: deals.title,
          amount: deals.amount,
          stageId: deals.stageId,
          pipelineId: deals.pipelineId,
        },
        owner: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(projects)
      .leftJoin(companies, eq(projects.companyId, companies.id))
      .leftJoin(contacts, eq(projects.primaryContactId, contacts.id))
      .leftJoin(deals, eq(projects.dealId, deals.id))
      .leftJoin(users, eq(projects.ownerId, users.id))
      .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
      .limit(1);

    if (!project) return null;

    const [details] = await attachProjectDetails([project as Record<string, unknown>]);
    const tasks = await db
      .select({
        id: projectTasks.id,
        title: projectTasks.title,
        description: projectTasks.description,
        category: projectTasks.category,
        status: projectTasks.status,
        priority: projectTasks.priority,
        assignedTo: projectTasks.assignedTo,
        dueDate: projectTasks.dueDate,
        completedAt: projectTasks.completedAt,
        blockedReason: projectTasks.blockedReason,
        position: projectTasks.position,
        assigneeFirstName: users.firstName,
        assigneeLastName: users.lastName,
        assigneeAvatarUrl: users.avatarUrl,
      })
      .from(projectTasks)
      .leftJoin(users, eq(projectTasks.assignedTo, users.id))
      .where(eq(projectTasks.projectId, id))
      .orderBy(asc(projectTasks.status), asc(projectTasks.position), asc(projectTasks.createdAt));

    const stageHistory = await db
      .select({
        id: projectStageHistory.id,
        fromStage: projectStageHistory.fromStage,
        toStage: projectStageHistory.toStage,
        movedBy: projectStageHistory.movedBy,
        notes: projectStageHistory.notes,
        enteredAt: projectStageHistory.enteredAt,
        exitedAt: projectStageHistory.exitedAt,
        durationHours: projectStageHistory.durationHours,
        movedByFirstName: users.firstName,
        movedByLastName: users.lastName,
      })
      .from(projectStageHistory)
      .leftJoin(users, eq(projectStageHistory.movedBy, users.id))
      .where(eq(projectStageHistory.projectId, id))
      .orderBy(desc(projectStageHistory.enteredAt))
      .limit(20);

    return {
      ...details,
      tasks,
      stageHistory,
    };
  },

  async list(filters: ProjectListFilters = {}) {
    const rows = await db
      .select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        dealId: projects.dealId,
        companyId: projects.companyId,
        primaryContactId: projects.primaryContactId,
        serviceType: projects.serviceType,
        stage: projects.stage,
        stageEnteredAt: projects.stageEnteredAt,
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
        status: projects.status,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
        company: {
          id: companies.id,
          name: companies.name,
        },
        owner: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(projects)
      .leftJoin(companies, eq(projects.companyId, companies.id))
      .leftJoin(users, eq(projects.ownerId, users.id))
      .where(and(
        isNull(projects.deletedAt),
        filters.companyId ? eq(projects.companyId, filters.companyId) : undefined,
        filters.stage ? eq(projects.stage, filters.stage as ProjectStage) : undefined,
        filters.status ? eq(projects.status, filters.status as ProjectStatus) : undefined,
        filters.serviceType ? eq(projects.serviceType, filters.serviceType as ProjectServiceType) : undefined,
        filters.ownerId ? eq(projects.ownerId, filters.ownerId) : undefined,
        filters.search ? ilike(projects.name, `%${filters.search}%`) : undefined,
      ))
      .orderBy(asc(projects.endDate), desc(projects.createdAt));

    return attachProjectDetails(rows as Array<Record<string, unknown>>);
  },

  async create(data: ProjectCreateInput, createdBy: string) {
    const stage = data.stage ?? 'kickoff';
    const [project] = await db
      .insert(projects)
      .values({
        name: data.name,
        description: data.description,
        dealId: data.dealId,
        companyId: data.companyId,
        primaryContactId: data.primaryContactId,
        serviceType: data.serviceType,
        startDate: data.startDate,
        endDate: data.endDate,
        contractValue: data.contractValue !== undefined && data.contractValue !== null ? data.contractValue.toString() : data.contractValue,
        ownerId: data.ownerId,
        stage,
        progressPercent: getProjectStageProgress(stage),
        status: statusForStage(stage),
        createdBy,
      })
      .returning();

    if (!project) throw new Error('Project could not be created');

    await db.insert(projectStageHistory).values({
      projectId: project.id,
      fromStage: null,
      toStage: project.stage,
      movedBy: createdBy,
      enteredAt: new Date(),
    });

    if (project.dealId) {
      await db.update(deals).set({ linkedProjectId: project.id }).where(eq(deals.id, project.dealId));
      await syncProjectFieldsToDeal(project.id, createdBy);
    } else {
      await createOrSyncDealFromProject(project.id, createdBy);
    }

    eventBus.emit('project.created', {
      projectId: project.id,
      companyId: project.companyId,
      dealId: project.dealId,
      createdBy,
    });

    return project;
  },

  async update(id: string, data: Partial<ProjectCreateInput>) {
    const payload = normalizeProjectData(data) as Record<string, unknown>;
    if (payload.stage === null) delete payload.stage;
    if (payload.serviceType === null) payload.serviceType = null;
    const [updated] = await db
      .update(projects)
      .set({ ...payload, updatedAt: new Date() })
      .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
      .returning();
    if (updated?.dealId) await syncProjectFieldsToDeal(id);
    return updated;
  },

  async moveStage(projectId: string, newStage: ProjectStage, movedBy: string, notes?: string) {
    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), isNull(projects.deletedAt))).limit(1);
    if (!project) throw new Error('Project not found');
    if (project.stage === newStage) return project;

    await db
      .update(projectStageHistory)
      .set({ exitedAt: new Date() })
      .where(and(eq(projectStageHistory.projectId, projectId), isNull(projectStageHistory.exitedAt)));

    await db.insert(projectStageHistory).values({
      projectId,
      fromStage: project.stage,
      toStage: newStage,
      movedBy,
      notes: notes ?? null,
      enteredAt: new Date(),
    });

    const newStatus = statusForStage(newStage);
    const [updated] = await db
      .update(projects)
      .set({
        stage: newStage,
        stageEnteredAt: new Date(),
        progressPercent: getProjectStageProgress(newStage),
        status: newStatus,
        actualEndDate: newStatus === 'completed' ? new Date().toISOString().slice(0, 10) : project.actualEndDate,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
      .returning();

    if (project.dealId) await syncProjectFieldsToDeal(projectId, movedBy);

    eventBus.emit('project.stage_changed', {
      projectId,
      fromStage: project.stage,
      toStage: newStage,
      movedBy,
    });

    return updated;
  },

  async updateProgress(
    projectId: string,
    progressPercent: number,
    updatedBy: string,
    isDelayed?: boolean,
    delayReason?: string | null,
    revisedEndDate?: string | Date | null
  ) {
    const [updated] = await db
      .update(projects)
      .set({
        progressPercent,
        isDelayed: isDelayed ?? false,
        delayReason: delayReason ?? null,
        revisedEndDate: revisedEndDate instanceof Date ? revisedEndDate.toISOString().slice(0, 10) : revisedEndDate ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
      .returning();

    if (!updated) throw new Error('Project not found');

    if (updated.dealId) await syncProjectFieldsToDeal(projectId, updatedBy);

    await db.insert(activities).values({
      activityType: 'note',
      subject: `Project progress updated to ${progressPercent}%${isDelayed ? ' (marked as delayed)' : ''}`,
      performedBy: updatedBy,
      companyId: updated.companyId ?? null,
      dealId: updated.dealId ?? null,
      isAutomated: false,
      occurredAt: new Date(),
      metadata: { projectId, progressPercent },
    });

    return updated;
  },

  async softDelete(projectId: string, _deletedBy: string) {
    const [project] = await db.select({ dealId: projects.dealId }).from(projects).where(eq(projects.id, projectId)).limit(1);
    await db
      .update(projects)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    if (project?.dealId) {
      await db.update(deals).set({ linkedProjectId: null }).where(eq(deals.id, project.dealId));
    }
  },

  async assertReadable(_user: SessionUser, _projectId: string) {
    return true;
  },
};
