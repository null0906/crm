import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../router';
import { requirePermission } from '../middleware';
import { db } from '@/server/db';
import { pipelines, pipelineStages, deals } from '@/server/db/schema';
import { eq, asc, and, isNull, count, sql } from 'drizzle-orm';
import { writeAuditLog } from '@/server/services/audit.service';

const pipelineTypeSchema = z.enum(['sales', 'active_delivery', 'partner', 'compliance']);

export const pipelineRouter = router({
  list: protectedProcedure
    .input(z.object({ isSalesPipeline: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const includeInactive = ctx.user.role.slug === 'super_admin';
      const rows = await db
        .select()
        .from(pipelines)
        .where(and(
          includeInactive ? undefined : eq(pipelines.isActive, true),
          input?.isSalesPipeline === undefined ? undefined : eq(pipelines.isSalesPipeline, input.isSalesPipeline)
        ))
        .orderBy(
          sql`CASE
            WHEN lower(${pipelines.name}) = 'sales pipeline' THEN 0
            WHEN lower(${pipelines.name}) = 'active pipeline' THEN 1
            ELSE 2
          END`,
          asc(pipelines.position),
          asc(pipelines.name)
        );
      return rows;
    }),

  getWithStages: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const [pipeline] = await db
        .select()
        .from(pipelines)
        .where(eq(pipelines.id, input.id))
        .limit(1);

      if (!pipeline) throw new TRPCError({ code: 'NOT_FOUND' });

      const stages = await db
        .select()
        .from(pipelineStages)
        .where(eq(pipelineStages.pipelineId, input.id))
        .orderBy(asc(pipelineStages.position));

      return { ...pipeline, stages };
    }),

  create: protectedProcedure
    .use(requirePermission('settings', 'pipelines'))
    .input(z.object({
      name: z.string().min(1).max(100),
      description: z.string().optional(),
      pipelineType: pipelineTypeSchema.optional(),
      isSalesPipeline: z.boolean().optional(),
      stages: z.array(z.object({
        name: z.string().min(1),
        color: z.string().optional(),
        stageType: z.enum(['active', 'won', 'lost']),
        defaultProbability: z.number().int().min(0).max(100).default(0),
        description: z.string().optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.isSalesPipeline && ctx.user!.role.slug !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only super admins can enable sales onboarding for a pipeline.' });
      }
      const [pipeline] = await db
        .insert(pipelines)
        .values({
          name: input.name,
          description: input.description,
          pipelineType: input.pipelineType ?? 'sales',
          isSalesPipeline: input.isSalesPipeline ?? false,
          createdBy: ctx.user!.id,
        })
        .returning();

      for (let i = 0; i < input.stages.length; i++) {
        const stage = input.stages[i]!;
        await db.insert(pipelineStages).values({
          pipelineId: pipeline!.id,
          name: stage.name,
          slug: stage.name.toLowerCase().replace(/\s+/g, '_'),
          position: i,
          color: stage.color,
          stageType: stage.stageType,
          defaultProbability: stage.defaultProbability,
          description: stage.description,
        });
      }

      await writeAuditLog({
        userId: ctx.user!.id,
        userEmail: ctx.user!.email,
        action: 'create',
        entityType: 'pipeline',
        entityId: pipeline!.id,
        entityName: pipeline!.name,
      });

      return pipeline;
    }),

  update: protectedProcedure
    .use(requirePermission('settings', 'pipelines'))
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(100).optional(),
      description: z.string().optional(),
      isActive: z.boolean().optional(),
      pipelineType: pipelineTypeSchema.optional(),
      isSalesPipeline: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.isSalesPipeline !== undefined && ctx.user!.role.slug !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only super admins can change sales onboarding behavior.' });
      }
      const { id, ...data } = input;
      const [updated] = await db
        .update(pipelines)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(pipelines.id, id))
        .returning();

      await writeAuditLog({
        userId: ctx.user!.id,
        userEmail: ctx.user!.email,
        action: 'update',
        entityType: 'pipeline',
        entityId: id,
        entityName: updated?.name,
      });

      return updated;
    }),

  addStage: protectedProcedure
    .use(requirePermission('settings', 'pipelines'))
    .input(z.object({
      pipelineId: z.string().uuid(),
      name: z.string().min(1),
      color: z.string().optional(),
      stageType: z.enum(['active', 'won', 'lost']).default('active'),
      defaultProbability: z.number().int().min(0).max(100).default(0),
      position: z.number().int(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [stage] = await db
        .insert(pipelineStages)
        .values({
          pipelineId: input.pipelineId,
          name: input.name,
          slug: input.name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now(),
          position: input.position,
          color: input.color,
          stageType: input.stageType,
          defaultProbability: input.defaultProbability,
        })
        .returning();

      return stage;
    }),

  updateStage: protectedProcedure
    .use(requirePermission('settings', 'pipelines'))
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().optional(),
      color: z.string().optional(),
      defaultProbability: z.number().int().min(0).max(100).optional(),
      position: z.number().int().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const [updated] = await db
        .update(pipelineStages)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(pipelineStages.id, id))
        .returning();
      return updated;
    }),

  reorderStages: protectedProcedure
    .use(requirePermission('settings', 'pipelines'))
    .input(z.object({
      pipelineId: z.string().uuid(),
      stageIds: z.array(z.string().uuid()).min(1),
    }))
    .mutation(async ({ input }) => {
      const stageRows = await db
        .select({ id: pipelineStages.id })
        .from(pipelineStages)
        .where(eq(pipelineStages.pipelineId, input.pipelineId))
        .orderBy(asc(pipelineStages.position));

      const existingIds = stageRows.map((stage) => stage.id);
      if (existingIds.length !== input.stageIds.length || existingIds.some((id) => !input.stageIds.includes(id))) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Stage reorder payload does not match this pipeline.' });
      }

      await db.transaction(async (tx) => {
        for (let i = 0; i < input.stageIds.length; i++) {
          await tx
            .update(pipelineStages)
            .set({ position: input.stageIds.length + i, updatedAt: new Date() })
            .where(eq(pipelineStages.id, input.stageIds[i]!));
        }

        for (let i = 0; i < input.stageIds.length; i++) {
          await tx
            .update(pipelineStages)
            .set({ position: i, updatedAt: new Date() })
            .where(eq(pipelineStages.id, input.stageIds[i]!));
        }
      });

      return { success: true };
    }),

  deleteStage: protectedProcedure
    .use(requirePermission('settings', 'pipelines'))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const [stage] = await db
        .select()
        .from(pipelineStages)
        .where(eq(pipelineStages.id, input.id))
        .limit(1);

      if (stage?.isSystemStage) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot delete a system stage' });
      }

      const [linkedDeals] = await db
        .select({ count: count() })
        .from(deals)
        .where(and(eq(deals.stageId, input.id), isNull(deals.deletedAt)));

      if (Number(linkedDeals?.count ?? 0) > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot delete this stage because prospects are still assigned to it. Move those prospects first.',
        });
      }

      await db.delete(pipelineStages).where(eq(pipelineStages.id, input.id));
      return { success: true };
    }),
});
