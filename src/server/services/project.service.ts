import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
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
import { getProjectVisibilityFilter } from '@/server/lib/visibility-filters';

export interface ProjectListFilters {
  companyId?: string;
  stage?: string;
  status?: string;
  serviceType?: string;
  assignedUserId?: string;
  ownerId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  isDelayed?: boolean;
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

function canViewProjectValues(user?: SessionUser) {
  return user?.role.slug !== 'sales_rep';
}

function maskProjectValueForUser<T extends Record<string, unknown>>(user: SessionUser | undefined, row: T): T {
  if (canViewProjectValues(user)) return row;
  const masked: Record<string, unknown> = { ...row, contractValue: null };
  if (masked.deal && typeof masked.deal === 'object') {
    masked.deal = { ...(masked.deal as Record<string, unknown>), amount: null };
  }
  return masked as T;
}

function sanitizeProjectWriteDataForUser(user: SessionUser | undefined, data: Partial<ProjectCreateInput>) {
  if (canViewProjectValues(user)) return data;
  const sanitized = { ...data };
  delete sanitized.contractValue;
  return sanitized;
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
  async getById(id: string, user: SessionUser) {
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
      .where(and(eq(projects.id, id), isNull(projects.deletedAt), getProjectVisibilityFilter(user)))
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

    return maskProjectValueForUser(user, {
      ...details,
      tasks,
      stageHistory,
    });
  },

  async list(filters: ProjectListFilters = {}, user?: SessionUser) {
    const assignedUserId = filters.assignedUserId ?? filters.ownerId;
    let assignedUserFilter: SQL | undefined;
    if (assignedUserId) {
      const memberProjects = db.select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(eq(projectMembers.userId, assignedUserId));
      assignedUserFilter = or(
        eq(projects.ownerId, assignedUserId),
        eq(projects.createdBy, assignedUserId),
        inArray(projects.id, memberProjects)
      );
    }
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
      .leftJoin(contacts, eq(projects.primaryContactId, contacts.id))
      .leftJoin(users, eq(projects.ownerId, users.id))
      .where(and(
        isNull(projects.deletedAt),
        filters.companyId ? eq(projects.companyId, filters.companyId) : undefined,
        filters.stage ? eq(projects.stage, filters.stage as ProjectStage) : undefined,
        filters.status ? eq(projects.status, filters.status as ProjectStatus) : undefined,
        filters.serviceType ? eq(projects.serviceType, filters.serviceType as ProjectServiceType) : undefined,
        assignedUserFilter,
        filters.isDelayed !== undefined ? eq(projects.isDelayed, filters.isDelayed) : undefined,
        filters.dateFrom ? gte(projects.startDate, filters.dateFrom) : undefined,
        filters.dateTo ? lte(projects.endDate, filters.dateTo) : undefined,
        filters.search ? or(
          ilike(projects.name, `%${filters.search}%`),
          ilike(projects.description, `%${filters.search}%`),
          ilike(companies.name, `%${filters.search}%`),
          ilike(sql<string>`concat(${contacts.firstName}, ' ', ${contacts.lastName})`, `%${filters.search}%`),
          ilike(contacts.email, `%${filters.search}%`)
        ) : undefined,
        user ? getProjectVisibilityFilter(user) : undefined,
      ))
      .orderBy(asc(projects.endDate), desc(projects.createdAt));

    const detailedRows = await attachProjectDetails(rows as Array<Record<string, unknown>>);
    return detailedRows.map((row) => maskProjectValueForUser(user, row));
  },

  async create(data: ProjectCreateInput, createdBy: string, user?: SessionUser) {
    const writeData = sanitizeProjectWriteDataForUser(user, data) as ProjectCreateInput;
    const stage = data.stage ?? 'kickoff';
    const [project] = await db
      .insert(projects)
      .values({
        name: writeData.name,
        description: writeData.description,
        dealId: writeData.dealId,
        companyId: writeData.companyId,
        primaryContactId: writeData.primaryContactId,
        serviceType: writeData.serviceType,
        startDate: writeData.startDate,
        endDate: writeData.endDate,
        contractValue: writeData.contractValue !== undefined && writeData.contractValue !== null ? writeData.contractValue.toString() : writeData.contractValue,
        ownerId: writeData.ownerId,
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

    return maskProjectValueForUser(user, project);
  },

  async update(id: string, data: Partial<ProjectCreateInput>, user?: SessionUser) {
    const payload = normalizeProjectData(sanitizeProjectWriteDataForUser(user, data)) as Record<string, unknown>;
    if (payload.stage === null) delete payload.stage;
    if (payload.serviceType === null) payload.serviceType = null;
    const [updated] = await db
      .update(projects)
      .set({ ...payload, updatedAt: new Date() })
      .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
      .returning();
    if (updated?.dealId) await syncProjectFieldsToDeal(id);
    return updated ? maskProjectValueForUser(user, updated as Record<string, unknown>) : updated;
  },

  async moveStage(projectId: string, newStage: ProjectStage, movedBy: string, notes?: string, user?: SessionUser) {
    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), isNull(projects.deletedAt))).limit(1);
    if (!project) throw new Error('Project not found');
    if (project.stage === newStage) return maskProjectValueForUser(user, project as Record<string, unknown>);

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

    return updated ? maskProjectValueForUser(user, updated as Record<string, unknown>) : updated;
  },

  async updateProgress(
    projectId: string,
    progressPercent: number,
    updatedBy: string,
    isDelayed?: boolean,
    delayReason?: string | null,
    revisedEndDate?: string | Date | null,
    user?: SessionUser
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

    return maskProjectValueForUser(user, updated as Record<string, unknown>);
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
