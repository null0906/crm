import { and, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/server/db';
import { companies, dealTeamMembers, deals, personalTasks, projectMembers, projects, users } from '@/server/db/schema';
import type { PersonalTaskStatus, SessionUser, TaskPriority } from '@/lib/types';
import { createNotification } from './notification.service';

type LinkType = 'project' | 'deal' | 'internal' | 'any';
type TaskFilters = {
  userId?: string;
  status?: PersonalTaskStatus;
  from?: Date;
  to?: Date;
  linkType?: LinkType;
  companyId?: string;
};

export interface TaskCreateInput {
  taskName: string;
  description?: string | null;
  linkedProjectId?: string | null;
  linkedDealId?: string | null;
  isInternal?: boolean;
}

export interface TaskAssignInput extends TaskCreateInput {
  assigneeId: string;
  dueDate?: string | null;
  priority?: TaskPriority | null;
}

export interface TaskUpdateInput {
  taskName?: string;
  description?: string | null;
  dueDate?: string | null;
  priority?: TaskPriority | null;
}

export interface TaskCompleteInput {
  hoursSpent: number;
  startedAt?: Date;
  completedAt?: Date;
}

function isSuperAdmin(user?: SessionUser) {
  return user?.role.slug === 'super_admin';
}

/** The doer, the original assigner, or any super_admin may manage (edit/cancel/delete) a task. */
function canManageTask(task: { userId: string; assignedBy: string | null }, user: SessionUser) {
  return isSuperAdmin(user) || task.userId === user.id || task.assignedBy === user.id;
}

function projectAccessFilter(userId: string) {
  return or(
    eq(projects.ownerId, userId),
    eq(projects.createdBy, userId),
    inArray(projects.id, db.select({ projectId: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.userId, userId)))
  );
}

function dealAccessFilter(userId: string) {
  return or(
    eq(deals.ownerId, userId),
    eq(deals.createdBy, userId),
    inArray(deals.id, db.select({ dealId: dealTeamMembers.dealId }).from(dealTeamMembers).where(eq(dealTeamMembers.userId, userId)))
  );
}

function linkTypeFilter(linkType?: LinkType): SQL | undefined {
  if (linkType === 'project') return sql`${personalTasks.linkedProjectId} IS NOT NULL`;
  if (linkType === 'deal') return sql`${personalTasks.linkedDealId} IS NOT NULL`;
  if (linkType === 'internal') return eq(personalTasks.isInternal, true);
  return undefined;
}

function companyFilter(companyId?: string): SQL | undefined {
  if (!companyId) return undefined;
  return or(eq(projects.companyId, companyId), eq(deals.companyId, companyId));
}

function taskSelect() {
  return {
    id: personalTasks.id,
    userId: personalTasks.userId,
    assignedBy: personalTasks.assignedBy,
    taskName: personalTasks.taskName,
    description: personalTasks.description,
    linkedProjectId: personalTasks.linkedProjectId,
    linkedDealId: personalTasks.linkedDealId,
    isInternal: personalTasks.isInternal,
    status: personalTasks.status,
    dueDate: personalTasks.dueDate,
    priority: personalTasks.priority,
    cancelReason: personalTasks.cancelReason,
    startedAt: personalTasks.startedAt,
    completedAt: personalTasks.completedAt,
    hoursSpent: personalTasks.hoursSpent,
    createdAt: personalTasks.createdAt,
    updatedAt: personalTasks.updatedAt,
    userFirstName: users.firstName,
    userLastName: users.lastName,
    userAvatarUrl: users.avatarUrl,
    assignerFirstName: sql<string | null>`assigner.first_name`,
    assignerLastName: sql<string | null>`assigner.last_name`,
    linkedProjectName: projects.name,
    linkedProjectServiceType: projects.serviceType,
    linkedProjectCompanyName: sql<string | null>`project_company.name`,
    linkedDealTitle: deals.title,
    linkedDealCompanyName: sql<string | null>`deal_company.name`,
  };
}

async function listTasks(where: SQL | undefined) {
  return db
    .select(taskSelect())
    .from(personalTasks)
    .innerJoin(users, eq(personalTasks.userId, users.id))
    .leftJoin(sql`users assigner`, sql`assigner.id = ${personalTasks.assignedBy}`)
    .leftJoin(projects, eq(personalTasks.linkedProjectId, projects.id))
    .leftJoin(sql`companies project_company`, sql`project_company.id = ${projects.companyId}`)
    .leftJoin(deals, eq(personalTasks.linkedDealId, deals.id))
    .leftJoin(sql`companies deal_company`, sql`deal_company.id = ${deals.companyId}`)
    .where(where)
    .orderBy(desc(personalTasks.startedAt));
}

export const personalTaskService = {
  async create(input: TaskCreateInput, user: SessionUser) {
    const linkageCount = (input.linkedProjectId ? 1 : 0) + (input.linkedDealId ? 1 : 0) + (input.isInternal ? 1 : 0);
    if (linkageCount !== 1) throw new Error('Task must be linked to exactly one of: project, prospect, or internal.');

    if (input.linkedProjectId && !(await this.userHasProjectAccess(input.linkedProjectId, user))) {
      throw new Error('You cannot link a task to a project you are not assigned to.');
    }
    if (input.linkedDealId && !(await this.userHasDealAccess(input.linkedDealId, user))) {
      throw new Error('You cannot link a task to a prospect you are not assigned to.');
    }

    const [task] = await db.insert(personalTasks).values({
      userId: user.id,
      taskName: input.taskName,
      description: input.description ?? null,
      linkedProjectId: input.linkedProjectId ?? null,
      linkedDealId: input.linkedDealId ?? null,
      isInternal: input.isInternal ?? false,
      status: 'in_progress',
      startedAt: new Date(),
    }).returning();
    return task!;
  },

  async assignTask(input: TaskAssignInput, assigner: SessionUser) {
    if (!isSuperAdmin(assigner)) throw new Error('Only super admins can assign tasks.');

    const linkageCount = (input.linkedProjectId ? 1 : 0) + (input.linkedDealId ? 1 : 0) + (input.isInternal ? 1 : 0);
    if (linkageCount !== 1) throw new Error('Task must be linked to exactly one of: project, prospect, or internal.');

    const [assignee] = await db.select({ id: users.id, status: users.status }).from(users).where(eq(users.id, input.assigneeId)).limit(1);
    if (!assignee) throw new Error('Assignee not found.');
    if (assignee.status !== 'active') throw new Error('Cannot assign a task to an inactive user.');

    if (input.linkedProjectId && !(await this.userHasProjectAccess(input.linkedProjectId, assigner))) {
      throw new Error('You cannot link a task to a project you are not assigned to.');
    }
    if (input.linkedDealId && !(await this.userHasDealAccess(input.linkedDealId, assigner))) {
      throw new Error('You cannot link a task to a prospect you are not assigned to.');
    }

    const [task] = await db.insert(personalTasks).values({
      userId: input.assigneeId,
      assignedBy: assigner.id,
      taskName: input.taskName,
      description: input.description ?? null,
      linkedProjectId: input.linkedProjectId ?? null,
      linkedDealId: input.linkedDealId ?? null,
      isInternal: input.isInternal ?? false,
      dueDate: input.dueDate ?? null,
      priority: input.priority ?? null,
      status: 'in_progress',
      startedAt: new Date(),
    }).returning();

    await createNotification({
      userId: input.assigneeId,
      type: 'task_assigned',
      title: 'New task assigned to you',
      body: input.taskName,
      entityType: 'personal_task',
      entityId: task!.id,
      metadata: { actionUrl: '/tasks' },
    });

    return task!;
  },

  async complete(taskId: string, user: SessionUser, input: TaskCompleteInput) {
    const [task] = await db.select().from(personalTasks).where(eq(personalTasks.id, taskId)).limit(1);
    if (!task) throw new Error('Task not found.');
    if (task.userId !== user.id) throw new Error('You can only complete your own tasks.');
    if (task.status !== 'in_progress') throw new Error('Task is already completed or cancelled.');
    if (input.hoursSpent < 0.1 || input.hoursSpent > 24) throw new Error('Hours spent must be between 0.1 and 24.');
    const startedAt = input.startedAt ?? task.startedAt;
    const completedAt = input.completedAt ?? new Date();
    if (startedAt > completedAt) throw new Error('Started time cannot be after completed time.');

    const [updated] = await db.update(personalTasks).set({
      status: 'completed',
      startedAt,
      hoursSpent: input.hoursSpent.toString(),
      completedAt,
      updatedAt: new Date(),
    }).where(and(eq(personalTasks.id, taskId), eq(personalTasks.status, 'in_progress'))).returning();

    if (!updated) throw new Error('Task was already completed or cancelled.');

    if (task.assignedBy) {
      await createNotification({
        userId: task.assignedBy,
        type: 'task_completed',
        title: 'Assigned task completed',
        body: `${task.taskName} — ${input.hoursSpent}h logged`,
        entityType: 'personal_task',
        entityId: task.id,
        metadata: { actionUrl: '/tasks' },
      });
    }

    return updated;
  },

  async update(taskId: string, user: SessionUser, input: TaskUpdateInput) {
    const [task] = await db.select().from(personalTasks).where(eq(personalTasks.id, taskId)).limit(1);
    if (!task) throw new Error('Task not found.');
    if (!canManageTask(task, user)) throw new Error('You do not have permission to edit this task.');
    if (task.status !== 'in_progress') throw new Error('Only in-progress tasks can be edited.');

    const [updated] = await db.update(personalTasks).set({
      taskName: input.taskName ?? task.taskName,
      description: input.description === undefined ? task.description : input.description,
      dueDate: input.dueDate === undefined ? task.dueDate : input.dueDate,
      priority: input.priority === undefined ? task.priority : input.priority,
      updatedAt: new Date(),
    }).where(eq(personalTasks.id, taskId)).returning();
    return updated!;
  },

  async cancel(taskId: string, user: SessionUser, reason?: string) {
    const [task] = await db.select().from(personalTasks).where(eq(personalTasks.id, taskId)).limit(1);
    if (!task) throw new Error('Task not found.');
    if (!canManageTask(task, user)) throw new Error('You can only cancel your own tasks.');

    const isAssigneeCancellingAssignedTask = task.assignedBy !== null && task.userId === user.id;
    if (isAssigneeCancellingAssignedTask && !reason?.trim()) {
      throw new Error('Please provide a reason for cancelling an assigned task.');
    }

    const [updated] = await db.update(personalTasks)
      .set({ status: 'cancelled', cancelReason: reason?.trim() || null, updatedAt: new Date() })
      .where(and(eq(personalTasks.id, taskId), eq(personalTasks.status, 'in_progress')))
      .returning();

    if (!updated) throw new Error('Task was already completed or cancelled.');

    if (task.assignedBy && task.assignedBy !== user.id) {
      await createNotification({
        userId: task.assignedBy,
        type: 'task_cancelled',
        title: 'Assigned task was cancelled',
        body: reason?.trim() ? `${task.taskName}: ${reason.trim()}` : task.taskName,
        entityType: 'personal_task',
        entityId: task.id,
        metadata: { actionUrl: '/tasks' },
      });
    }

    return updated;
  },

  async delete(taskId: string, user: SessionUser) {
    const [task] = await db.select().from(personalTasks).where(eq(personalTasks.id, taskId)).limit(1);
    if (!task) throw new Error('Task not found.');
    if (!canManageTask(task, user)) throw new Error('You do not have permission to delete this task.');
    await db.delete(personalTasks).where(eq(personalTasks.id, taskId));
  },

  async listMyTasks(user: SessionUser, filters: TaskFilters = {}) {
    return listTasks(and(
      eq(personalTasks.userId, user.id),
      filters.status ? eq(personalTasks.status, filters.status) : undefined,
      filters.from ? sql`${personalTasks.startedAt} >= ${filters.from}` : undefined,
      filters.to ? sql`${personalTasks.startedAt} <= ${filters.to}` : undefined,
      linkTypeFilter(filters.linkType),
      companyFilter(filters.companyId)
    ));
  },

  async listAllTasks(user: SessionUser, filters: TaskFilters = {}) {
    if (!isSuperAdmin(user)) throw new Error('Only super admins can view all personal tasks.');
    return listTasks(and(
      filters.userId ? eq(personalTasks.userId, filters.userId) : undefined,
      filters.status ? eq(personalTasks.status, filters.status) : undefined,
      filters.from ? sql`${personalTasks.startedAt} >= ${filters.from}` : undefined,
      filters.to ? sql`${personalTasks.startedAt} <= ${filters.to}` : undefined,
      linkTypeFilter(filters.linkType),
      companyFilter(filters.companyId)
    ));
  },

  async getStats(user: SessionUser, from: Date, to: Date, filters: Omit<TaskFilters, 'from' | 'to'> = {}) {
    const userId = filters.userId;
    if (userId && !isSuperAdmin(user)) throw new Error('Only super admins can view other users task stats.');
    const targetUserId = userId ?? user.id;
    const [row] = await db
      .select({
        total_tasks: sql<number>`COUNT(*)::int`,
        active_tasks: sql<number>`COUNT(*) FILTER (WHERE ${personalTasks.status} = 'in_progress')::int`,
        completed_tasks: sql<number>`COUNT(*) FILTER (WHERE ${personalTasks.status} = 'completed')::int`,
        total_hours: sql<string>`COALESCE(SUM(${personalTasks.hoursSpent}) FILTER (WHERE ${personalTasks.status} = 'completed'), 0)::text`,
        project_hours: sql<string>`COALESCE(SUM(${personalTasks.hoursSpent}) FILTER (WHERE ${personalTasks.status} = 'completed' AND ${personalTasks.linkedProjectId} IS NOT NULL), 0)::text`,
        prospect_hours: sql<string>`COALESCE(SUM(${personalTasks.hoursSpent}) FILTER (WHERE ${personalTasks.status} = 'completed' AND ${personalTasks.linkedDealId} IS NOT NULL), 0)::text`,
        internal_hours: sql<string>`COALESCE(SUM(${personalTasks.hoursSpent}) FILTER (WHERE ${personalTasks.status} = 'completed' AND ${personalTasks.isInternal} = true), 0)::text`,
      })
      .from(personalTasks)
      .leftJoin(projects, eq(personalTasks.linkedProjectId, projects.id))
      .leftJoin(deals, eq(personalTasks.linkedDealId, deals.id))
      .where(and(
        eq(personalTasks.userId, targetUserId),
        sql`${personalTasks.startedAt} >= ${from}`,
        sql`${personalTasks.startedAt} <= ${to}`,
        filters.status ? eq(personalTasks.status, filters.status) : undefined,
        linkTypeFilter(filters.linkType),
        companyFilter(filters.companyId)
      ));
    return row ?? {};
  },

  async getTeamSummary(user: SessionUser, from: Date, to: Date, filters: Omit<TaskFilters, 'from' | 'to'> = {}) {
    if (!isSuperAdmin(user)) throw new Error('Only super admins can view team task summaries.');
    return db
      .select({
        user_id: users.id,
        first_name: users.firstName,
        last_name: users.lastName,
        total_tasks: sql<number>`COUNT(${personalTasks.id})::int`,
        completed_tasks: sql<number>`COUNT(${personalTasks.id}) FILTER (WHERE ${personalTasks.status} = 'completed')::int`,
        total_hours: sql<string>`COALESCE(SUM(${personalTasks.hoursSpent}) FILTER (WHERE ${personalTasks.status} = 'completed'), 0)::text`,
        project_hours: sql<string>`COALESCE(SUM(${personalTasks.hoursSpent}) FILTER (WHERE ${personalTasks.status} = 'completed' AND ${personalTasks.linkedProjectId} IS NOT NULL), 0)::text`,
        prospect_hours: sql<string>`COALESCE(SUM(${personalTasks.hoursSpent}) FILTER (WHERE ${personalTasks.status} = 'completed' AND ${personalTasks.linkedDealId} IS NOT NULL), 0)::text`,
        internal_hours: sql<string>`COALESCE(SUM(${personalTasks.hoursSpent}) FILTER (WHERE ${personalTasks.status} = 'completed' AND ${personalTasks.isInternal} = true), 0)::text`,
      })
      .from(users)
      .leftJoin(personalTasks, and(
        eq(personalTasks.userId, users.id),
        sql`${personalTasks.startedAt} >= ${from}`,
        sql`${personalTasks.startedAt} <= ${to}`,
        filters.status ? eq(personalTasks.status, filters.status) : undefined,
        filters.userId ? eq(personalTasks.userId, filters.userId) : undefined,
        linkTypeFilter(filters.linkType)
      ))
      .leftJoin(projects, eq(personalTasks.linkedProjectId, projects.id))
      .leftJoin(deals, eq(personalTasks.linkedDealId, deals.id))
      .where(and(
        eq(users.status, 'active'),
        filters.userId ? eq(users.id, filters.userId) : undefined,
        filters.companyId ? or(eq(projects.companyId, filters.companyId), eq(deals.companyId, filters.companyId)) : undefined
      ))
      .groupBy(users.id, users.firstName, users.lastName)
      .orderBy(sql`COALESCE(SUM(${personalTasks.hoursSpent}), 0) DESC NULLS LAST`, users.firstName);
  },

  async userHasProjectAccess(projectId: string, user: SessionUser) {
    if (isSuperAdmin(user)) return true;
    const [project] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), isNull(projects.deletedAt), projectAccessFilter(user.id))).limit(1);
    return Boolean(project);
  },

  async userHasDealAccess(dealId: string, user: SessionUser) {
    if (isSuperAdmin(user)) return true;
    const [deal] = await db.select({ id: deals.id }).from(deals).where(and(eq(deals.id, dealId), isNull(deals.deletedAt), dealAccessFilter(user.id))).limit(1);
    return Boolean(deal);
  },

  async getLinkableEntities(user: SessionUser) {
    const projectRows = await db.select({
      id: projects.id,
      name: projects.name,
      serviceType: projects.serviceType,
      companyName: companies.name,
    }).from(projects)
      .leftJoin(companies, eq(projects.companyId, companies.id))
      .where(and(isNull(projects.deletedAt), eq(projects.status, 'active'), isSuperAdmin(user) ? undefined : projectAccessFilter(user.id)))
      .orderBy(desc(projects.updatedAt))
      .limit(200);

    const dealRows = await db.select({
      id: deals.id,
      title: deals.title,
      companyName: companies.name,
    }).from(deals)
      .leftJoin(companies, eq(deals.companyId, companies.id))
      .where(and(isNull(deals.deletedAt), eq(deals.status, 'open'), isSuperAdmin(user) ? undefined : dealAccessFilter(user.id)))
      .orderBy(desc(deals.updatedAt))
      .limit(200);

    return { projects: projectRows, deals: dealRows };
  },
};
