import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../router';
import { requirePermission } from '../middleware';
import { db } from '@/server/db';
import { pipelines, pipelineStages } from '@/server/db/schema';
import { eq, asc, and, isNull } from 'drizzle-orm';
import { writeAuditLog } from '@/server/services/audit.service';

export const pipelineRouter = router({
  list: protectedProcedure
    .query(async () => {
      const rows = await db
        .select()
        .from(pipelines)
        .where(eq(pipelines.isActive, true))
        .orderBy(asc(pipelines.position));
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
      stages: z.array(z.object({
        name: z.string().min(1),
        color: z.string().optional(),
        stageType: z.enum(['active', 'won', 'lost']),
        defaultProbability: z.number().int().min(0).max(100).default(0),
        description: z.string().optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const [pipeline] = await db
        .insert(pipelines)
        .values({
          name: input.name,
          description: input.description,
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
    }))
    .mutation(async ({ ctx, input }) => {
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

      await db.delete(pipelineStages).where(eq(pipelineStages.id, input.id));
      return { success: true };
    }),
});
