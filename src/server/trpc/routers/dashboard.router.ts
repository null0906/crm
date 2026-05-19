import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../router';
import { requirePermission } from '../middleware';
import { db } from '@/server/db';
import { dashboards, dashboardWidgets, companies, digestSchedules } from '@/server/db/schema';
import { eq, and, or, isNull } from 'drizzle-orm';
import { writeAuditLog } from '@/server/services/audit.service';
import { hasPermission } from '@/server/lib/permissions';
import { randomUUID } from 'crypto';

export const dashboardRouter = router({
  list: protectedProcedure
    .query(async ({ ctx }) => {
      return db
        .select()
        .from(dashboards)
        .where(
          or(
            eq(dashboards.createdBy, ctx.user!.id),
            eq(dashboards.visibility, 'everyone'),
            eq(dashboards.visibility, 'team')
          )
        );
    }),

  sourceCompanies: protectedProcedure
    .query(async () => {
      return db
        .select({
          id: companies.id,
          name: companies.name,
          companyType: companies.companyType,
          companySize: companies.companySize,
        })
        .from(companies)
        .where(isNull(companies.deletedAt));
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [dashboard] = await db
        .select()
        .from(dashboards)
        .where(eq(dashboards.id, input.id))
        .limit(1);

      if (!dashboard) throw new TRPCError({ code: 'NOT_FOUND' });

      const widgets = await db
        .select()
        .from(dashboardWidgets)
        .where(eq(dashboardWidgets.dashboardId, input.id));

      return { ...dashboard, widgets };
    }),

  create: protectedProcedure
    .use(requirePermission('dashboards', 'create'))
    .input(z.object({
      name: z.string().min(1).max(150),
      description: z.string().optional(),
      visibility: z.enum(['private', 'team', 'everyone']).default('private'),
      isPublic: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const publicToken = input.isPublic ? randomUUID().replace(/-/g, '') : undefined;
      const publicSlug = input.isPublic
        ? input.name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now()
        : undefined;

      const [dashboard] = await db
        .insert(dashboards)
        .values({
          ...input,
          publicToken,
          publicSlug,
          layout: [],
          createdBy: ctx.user!.id,
        })
        .returning();

      await writeAuditLog({
        userId: ctx.user!.id,
        userEmail: ctx.user!.email,
        action: 'create',
        entityType: 'dashboard',
        entityId: dashboard!.id,
        entityName: dashboard!.name,
      });

      return dashboard;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(150).optional(),
      description: z.string().optional(),
      visibility: z.enum(['private', 'team', 'everyone']).optional(),
      layout: z.array(z.any()).optional(),
      autoRefreshSeconds: z.number().int().min(0).optional(),
      isPublic: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const [updated] = await db
        .update(dashboards)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(dashboards.id, id), eq(dashboards.createdBy, ctx.user!.id)))
        .returning();

      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [dashboard] = await db
        .select({
          id: dashboards.id,
          name: dashboards.name,
          createdBy: dashboards.createdBy,
        })
        .from(dashboards)
        .where(eq(dashboards.id, input.id))
        .limit(1);

      if (!dashboard) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Dashboard not found' });
      }

      const canDeleteAnyDashboard = hasPermission(ctx.user!.role.permissions, 'dashboards', 'delete');
      const isOwner = dashboard.createdBy === ctx.user!.id;

      if (!isOwner && !canDeleteAnyDashboard) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only delete dashboards you created.',
        });
      }

      await db.transaction(async (tx) => {
        await tx
          .update(digestSchedules)
          .set({ dashboardId: null, updatedAt: new Date() })
          .where(eq(digestSchedules.dashboardId, input.id));

        await tx.delete(dashboardWidgets).where(eq(dashboardWidgets.dashboardId, input.id));

        const [deleted] = await tx
          .delete(dashboards)
          .where(eq(dashboards.id, input.id))
          .returning({ id: dashboards.id });

        if (!deleted) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Dashboard could not be deleted' });
        }
      });

      await writeAuditLog({
        userId: ctx.user!.id,
        userEmail: ctx.user!.email,
        action: 'delete',
        entityType: 'dashboard',
        entityId: input.id,
        entityName: dashboard.name,
      });

      return { success: true };
    }),

  addWidget: protectedProcedure
    .input(z.object({
      dashboardId: z.string().uuid(),
      widgetType: z.enum(['metric_card', 'bar_chart', 'line_chart', 'pie_chart', 'funnel_chart', 'table', 'pipeline_summary', 'activity_feed', 'leaderboard', 'goal_tracker', 'conversion_rate', 'time_in_stage', 'forecast', 'custom_query']),
      title: z.string().min(1).max(150),
      subtitle: z.string().optional(),
      color: z.string().optional(),
      icon: z.string().optional(),
      config: z.record(z.string(), z.unknown()),
      cacheTtlSeconds: z.number().int().default(300),
    }))
    .mutation(async ({ input }) => {
      const [widget] = await db.insert(dashboardWidgets).values(input).returning();
      return widget;
    }),

  updateWidget: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      title: z.string().optional(),
      config: z.record(z.string(), z.unknown()).optional(),
      cacheTtlSeconds: z.number().int().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const [updated] = await db
        .update(dashboardWidgets)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(dashboardWidgets.id, id))
        .returning();
      return updated;
    }),

  deleteWidget: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await db.delete(dashboardWidgets).where(eq(dashboardWidgets.id, input.id));
      return { success: true };
    }),
});
