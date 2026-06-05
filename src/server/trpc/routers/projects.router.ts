import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { router, protectedProcedure } from '../router';
import { db } from '@/server/db';
import { projectMembers, projects, projectTasks, users } from '@/server/db/schema';
import { projectService } from '@/server/services/project.service';
import { syncProjectTasksToDeal, syncProjectTeamToDeal } from '@/server/services/project-sync.service';

const serviceTypeSchema = z.enum([
  'soc2_type1',
  'soc2_type2',
  'iso27001',
  'dpdp',
  'vapt',
  'cspm',
  'ai_governance',
  'cert_in',
  'custom',
]);

const projectStageSchema = z.enum([
  'kickoff',
  'gap_assessment',
  'implementation',
  'internal_audit',
  'external_audit',
  'certified',
  'on_hold',
  'cancelled',
]);

const projectCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  dealId: z.string().uuid().optional().nullable(),
  companyId: z.string().uuid().optional().nullable(),
  primaryContactId: z.string().uuid().optional().nullable(),
  serviceType: serviceTypeSchema.optional().nullable(),
  stage: projectStageSchema.optional(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  contractValue: z.number().optional().nullable(),
  ownerId: z.string().uuid().optional().nullable(),
  memberIds: z.array(z.string().uuid()).optional(),
});

const taskStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'blocked', 'not_applicable']);
const taskCategorySchema = z.enum([
  'documentation',
  'evidence_collection',
  'gap_remediation',
  'audit_prep',
  'policy',
  'training',
  'review',
  'other',
]);

async function assertCanManageProjectMembers(projectId: string, user: { id: string; role?: { slug?: string } }) {
  const privilegedRoles = new Set(['super_admin', 'admin', 'sales_manager', 'manager']);
  if (privilegedRoles.has(user.role?.slug ?? '')) return;

  const [project] = await db
    .select({ ownerId: projects.ownerId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (project?.ownerId === user.id) return;

  const [leadMembership] = await db
    .select({ id: projectMembers.id })
    .from(projectMembers)
    .where(and(
      eq(projectMembers.projectId, projectId),
      eq(projectMembers.userId, user.id),
      eq(projectMembers.role, 'lead')
    ))
    .limit(1);

  if (leadMembership) return;

  throw new TRPCError({
    code: 'FORBIDDEN',
    message: 'Only project owners, project leads, and admins can manage team members.',
  });
}

export const projectsRouter = router({
  list: protectedProcedure
    .input(z.object({
      companyId: z.string().uuid().optional(),
      stage: projectStageSchema.optional(),
      status: z.enum(['active', 'completed', 'on_hold', 'cancelled']).optional(),
      serviceType: serviceTypeSchema.optional(),
      ownerId: z.string().uuid().optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      return projectService.list(input ?? {}, ctx.user);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return projectService.getById(input.id, ctx.user);
    }),

  create: protectedProcedure
    .input(projectCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const { memberIds, ...data } = input;
      const project = await projectService.create(data, ctx.user.id, ctx.user);
      if (memberIds?.length) {
        await db.insert(projectMembers).values(memberIds.map((userId) => ({
          projectId: project.id,
          userId,
          role: 'member' as const,
        }))).onConflictDoNothing();
        await syncProjectTeamToDeal(project.id);
      }
      return project;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      data: projectCreateSchema.partial(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { memberIds: _memberIds, ...data } = input.data;
      return projectService.update(input.id, data, ctx.user);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await projectService.softDelete(input.id, ctx.user.id);
      return { success: true };
    }),

  moveStage: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      stage: projectStageSchema,
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return projectService.moveStage(input.id, input.stage, ctx.user.id, input.notes, ctx.user);
    }),

  updateProgress: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      progressPercent: z.number().min(0).max(100),
      isDelayed: z.boolean().optional(),
      delayReason: z.string().optional().nullable(),
      revisedEndDate: z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      return projectService.updateProgress(
        input.id,
        input.progressPercent,
        ctx.user.id,
        input.isDelayed,
        input.delayReason,
        input.revisedEndDate,
        ctx.user
      );
    }),

  addMember: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      userId: z.string().uuid(),
      role: z.enum(['lead', 'member', 'reviewer', 'consultant']).default('member'),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanManageProjectMembers(input.projectId, ctx.user);
      await db.insert(projectMembers).values(input).onConflictDoUpdate({
        target: [projectMembers.projectId, projectMembers.userId],
        set: { role: input.role },
      });
      await syncProjectTeamToDeal(input.projectId);
      return { success: true };
    }),

  removeMember: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      userId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanManageProjectMembers(input.projectId, ctx.user);
      await db.delete(projectMembers).where(and(
        eq(projectMembers.projectId, input.projectId),
        eq(projectMembers.userId, input.userId)
      ));
      await syncProjectTeamToDeal(input.projectId);
      return { success: true };
    }),

  getByCompany: protectedProcedure
    .input(z.object({ companyId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return projectService.list({ companyId: input.companyId }, ctx.user);
    }),

  tasksByCompany: protectedProcedure
    .input(z.object({ companyId: z.string().uuid() }))
    .query(async ({ input }) => {
      return db
        .select({
          id: projectTasks.id,
          projectId: projectTasks.projectId,
          projectName: projects.name,
          title: projectTasks.title,
          status: projectTasks.status,
          priority: projectTasks.priority,
          dueDate: projectTasks.dueDate,
          assignedTo: projectTasks.assignedTo,
          assigneeFirstName: users.firstName,
          assigneeLastName: users.lastName,
          createdAt: projectTasks.createdAt,
        })
        .from(projectTasks)
        .innerJoin(projects, eq(projectTasks.projectId, projects.id))
        .leftJoin(users, eq(projectTasks.assignedTo, users.id))
        .where(and(
          eq(projects.companyId, input.companyId),
          isNull(projects.deletedAt),
          sql`${projectTasks.status} <> 'completed'`
        ))
        .orderBy(
          sql`CASE
            WHEN ${projectTasks.dueDate} IS NULL THEN 3
            WHEN ${projectTasks.dueDate} < CURRENT_DATE THEN 0
            WHEN ${projectTasks.dueDate} = CURRENT_DATE THEN 1
            ELSE 2
          END`,
          asc(projectTasks.dueDate),
          asc(projectTasks.createdAt)
        );
    }),

  listTasks: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      status: taskStatusSchema.optional(),
    }))
    .query(async ({ input }) => {
      return db.query.projectTasks.findMany({
        where: and(
          eq(projectTasks.projectId, input.projectId),
          input.status ? eq(projectTasks.status, input.status) : undefined
        ),
        orderBy: [asc(projectTasks.position), asc(projectTasks.createdAt)],
      });
    }),

  createTask: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      title: z.string().min(1),
      description: z.string().optional(),
      category: taskCategorySchema.optional(),
      assignedTo: z.string().uuid().optional().nullable(),
      dueDate: z.string().optional().nullable(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
    }))
    .mutation(async ({ ctx, input }) => {
      const [task] = await db.insert(projectTasks).values({
        ...input,
        createdBy: ctx.user.id,
      }).returning();
      await syncProjectTasksToDeal(input.projectId);
      return task;
    }),

  updateTask: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      data: z.object({
        title: z.string().optional(),
        description: z.string().optional().nullable(),
        status: taskStatusSchema.optional(),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
        assignedTo: z.string().uuid().nullable().optional(),
        dueDate: z.string().nullable().optional(),
        blockedReason: z.string().nullable().optional(),
      }),
    }))
    .mutation(async ({ input }) => {
      const completedAt = input.data.status === 'completed'
        ? new Date()
        : input.data.status !== undefined
          ? null
          : undefined;

      const [updated] = await db.update(projectTasks).set({
        ...input.data,
        ...(completedAt !== undefined ? { completedAt } : {}),
        updatedAt: new Date(),
      }).where(eq(projectTasks.id, input.id)).returning();
      if (updated?.projectId) await syncProjectTasksToDeal(updated.projectId);
      return updated;
    }),

  deleteTask: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const [task] = await db.select({ projectId: projectTasks.projectId }).from(projectTasks).where(eq(projectTasks.id, input.id)).limit(1);
      await db.delete(projectTasks).where(eq(projectTasks.id, input.id));
      if (task?.projectId) await syncProjectTasksToDeal(task.projectId);
      return { success: true };
    }),

  reorderTasks: protectedProcedure
    .input(z.object({
      tasks: z.array(z.object({
        id: z.string().uuid(),
        position: z.number(),
        status: taskStatusSchema,
      })),
    }))
    .mutation(async ({ input }) => {
      await Promise.all(input.tasks.map((task) => db
        .update(projectTasks)
        .set({ position: task.position, status: task.status, updatedAt: new Date() })
        .where(eq(projectTasks.id, task.id))));
      const projectIds = await db
        .selectDistinct({ projectId: projectTasks.projectId })
        .from(projectTasks)
        .where(sql`${projectTasks.id} IN (${sql.join(input.tasks.map((task) => sql`${task.id}`), sql`, `)})`);
      await Promise.all(projectIds.map((row) => syncProjectTasksToDeal(row.projectId)));
      return { success: true };
    }),
});
