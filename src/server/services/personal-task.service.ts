import { and, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/server/db';
import { companies, dealTeamMembers, deals, personalTasks, projectMembers, projects, users } from '@/server/db/schema';
import type { PersonalTaskStatus, SessionUser } from '@/lib/types';

type LinkType = 'project' | 'deal' | 'internal' | 'any';

export interface TaskCreateInput {
  taskName: string;
  description?: string | null;
  linkedProjectId?: string | null;
  linkedDealId?: string | null;
  isInternal?: boolean;
}

export interface TaskCompleteInput {
  hoursSpent: number;
  completedAt?: Date;
}

function isSuperAdmin(user?: SessionUser) {
  return user?.role.slug === 'super_admin';
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

function taskSelect() {
  return {
    id: personalTasks.id,
    userId: personalTasks.userId,
    taskName: personalTasks.taskName,
    description: personalTasks.description,
    linkedProjectId: personalTasks.linkedProjectId,
    linkedDealId: personalTasks.linkedDealId,
    isInternal: personalTasks.isInternal,
    status: personalTasks.status,
    startedAt: personalTasks.startedAt,
    completedAt: personalTasks.completedAt,
    hoursSpent: personalTasks.hoursSpent,
    createdAt: personalTasks.createdAt,
    updatedAt: personalTasks.updatedAt,
    userFirstName: users.firstName,
    userLastName: users.lastName,
    userAvatarUrl: users.avatarUrl,
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

  async complete(taskId: string, user: SessionUser, input: TaskCompleteInput) {
    const [task] = await db.select().from(personalTasks).where(eq(personalTasks.id, taskId)).limit(1);
    if (!task) throw new Error('Task not found.');
    if (task.userId !== user.id) throw new Error('You can only complete your own tasks.');
    if (task.status === 'completed') throw new Error('Task is already completed.');
    if (input.hoursSpent < 0.1 || input.hoursSpent > 24) throw new Error('Hours spent must be between 0.1 and 24.');

    const [updated] = await db.update(personalTasks).set({
      status: 'completed',
      hoursSpent: input.hoursSpent.toString(),
      completedAt: input.completedAt ?? new Date(),
      updatedAt: new Date(),
    }).where(eq(personalTasks.id, taskId)).returning();
    return updated!;
  },

  async update(taskId: string, user: SessionUser, input: Partial<TaskCreateInput>) {
    const [task] = await db.select().from(personalTasks).where(eq(personalTasks.id, taskId)).limit(1);
    if (!task) throw new Error('Task not found.');
    if (task.userId !== user.id) throw new Error('You can only edit your own tasks.');
    const [updated] = await db.update(personalTasks).set({
      taskName: input.taskName ?? task.taskName,
      description: input.description === undefined ? task.description : input.description,
      updatedAt: new Date(),
    }).where(eq(personalTasks.id, taskId)).returning();
    return updated!;
  },

  async cancel(taskId: string, user: SessionUser) {
    const [task] = await db.select().from(personalTasks).where(eq(personalTasks.id, taskId)).limit(1);
    if (!task) throw new Error('Task not found.');
    if (task.userId !== user.id) throw new Error('You can only cancel your own tasks.');
    const [updated] = await db.update(personalTasks).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(personalTasks.id, taskId)).returning();
    return updated!;
  },

  async delete(taskId: string, user: SessionUser) {
    const [task] = await db.select().from(personalTasks).where(eq(personalTasks.id, taskId)).limit(1);
    if (!task) throw new Error('Task not found.');
    if (task.userId !== user.id) throw new Error('You can only delete your own tasks.');
    await db.delete(personalTasks).where(eq(personalTasks.id, taskId));
  },

  async listMyTasks(user: SessionUser, filters: { status?: PersonalTaskStatus; from?: Date; to?: Date; linkType?: LinkType } = {}) {
    return listTasks(and(
      eq(personalTasks.userId, user.id),
      filters.status ? eq(personalTasks.status, filters.status) : undefined,
      filters.from ? sql`${personalTasks.startedAt} >= ${filters.from}` : undefined,
      filters.to ? sql`${personalTasks.startedAt} <= ${filters.to}` : undefined,
      linkTypeFilter(filters.linkType)
    ));
  },

  async listAllTasks(user: SessionUser, filters: { userId?: string; status?: PersonalTaskStatus; from?: Date; to?: Date; linkType?: LinkType } = {}) {
    if (!isSuperAdmin(user)) throw new Error('Only super admins can view all personal tasks.');
    return listTasks(and(
      filters.userId ? eq(personalTasks.userId, filters.userId) : undefined,
      filters.status ? eq(personalTasks.status, filters.status) : undefined,
      filters.from ? sql`${personalTasks.startedAt} >= ${filters.from}` : undefined,
      filters.to ? sql`${personalTasks.startedAt} <= ${filters.to}` : undefined,
      linkTypeFilter(filters.linkType)
    ));
  },

  async getStats(user: SessionUser, from: Date, to: Date, userId?: string) {
    if (userId && !isSuperAdmin(user)) throw new Error('Only super admins can view other users task stats.');
    const targetUserId = userId ?? user.id;
    const result = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total_tasks,
        COUNT(*) FILTER (WHERE status = 'in_progress')::int AS active_tasks,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_tasks,
        COALESCE(SUM(hours_spent) FILTER (WHERE status = 'completed'), 0)::text AS total_hours,
        COALESCE(SUM(hours_spent) FILTER (WHERE status = 'completed' AND linked_project_id IS NOT NULL), 0)::text AS project_hours,
        COALESCE(SUM(hours_spent) FILTER (WHERE status = 'completed' AND linked_deal_id IS NOT NULL), 0)::text AS prospect_hours,
        COALESCE(SUM(hours_spent) FILTER (WHERE status = 'completed' AND is_internal = true), 0)::text AS internal_hours
      FROM personal_tasks
      WHERE user_id = ${targetUserId}
        AND started_at >= ${from}
        AND started_at <= ${to}
    `);
    return (result as { rows?: Array<Record<string, unknown>> }).rows?.[0] ?? {};
  },

  async getTeamSummary(user: SessionUser, from: Date, to: Date) {
    if (!isSuperAdmin(user)) throw new Error('Only super admins can view team task summaries.');
    const result = await db.execute(sql`
      SELECT
        u.id AS user_id,
        u.first_name,
        u.last_name,
        COUNT(pt.id)::int AS total_tasks,
        COUNT(pt.id) FILTER (WHERE pt.status = 'completed')::int AS completed_tasks,
        COALESCE(SUM(pt.hours_spent) FILTER (WHERE pt.status = 'completed'), 0)::text AS total_hours,
        COALESCE(SUM(pt.hours_spent) FILTER (WHERE pt.status = 'completed' AND pt.linked_project_id IS NOT NULL), 0)::text AS project_hours,
        COALESCE(SUM(pt.hours_spent) FILTER (WHERE pt.status = 'completed' AND pt.linked_deal_id IS NOT NULL), 0)::text AS prospect_hours,
        COALESCE(SUM(pt.hours_spent) FILTER (WHERE pt.status = 'completed' AND pt.is_internal = true), 0)::text AS internal_hours
      FROM users u
      LEFT JOIN personal_tasks pt ON pt.user_id = u.id AND pt.started_at >= ${from} AND pt.started_at <= ${to}
      WHERE u.status = 'active'
      GROUP BY u.id, u.first_name, u.last_name
      ORDER BY COALESCE(SUM(pt.hours_spent), 0) DESC NULLS LAST, u.first_name ASC
    `);
    return (result as { rows?: Array<Record<string, unknown>> }).rows ?? [];
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
