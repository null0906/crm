import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router } from '../router';
import { personalTaskService } from '@/server/services/personal-task.service';

const statusSchema = z.enum(['in_progress', 'completed', 'cancelled']);
const linkTypeSchema = z.enum(['project', 'deal', 'internal', 'any']);

function toDate(value?: string) {
  return value ? new Date(value) : undefined;
}

function asTrpcError(error: unknown) {
  return new TRPCError({
    code: 'BAD_REQUEST',
    message: error instanceof Error ? error.message : 'Personal task operation failed.',
  });
}

export const personalTasksRouter = router({
  listMy: protectedProcedure
    .input(z.object({
      status: statusSchema.optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      linkType: linkTypeSchema.optional(),
      companyId: z.string().uuid().optional(),
    }).optional())
    .query(({ ctx, input }) => personalTaskService.listMyTasks(ctx.user!, {
      status: input?.status,
      from: toDate(input?.from),
      to: toDate(input?.to),
      linkType: input?.linkType,
      companyId: input?.companyId,
    })),

  myStats: protectedProcedure
    .input(z.object({
      from: z.string(),
      to: z.string(),
      status: statusSchema.optional(),
      linkType: linkTypeSchema.optional(),
      companyId: z.string().uuid().optional(),
    }))
    .query(({ ctx, input }) => personalTaskService.getStats(ctx.user!, new Date(input.from), new Date(input.to), {
      status: input.status,
      linkType: input.linkType,
      companyId: input.companyId,
    })),

  create: protectedProcedure
    .input(z.object({
      taskName: z.string().min(1).max(255),
      description: z.string().max(2000).optional(),
      linkedProjectId: z.string().uuid().optional(),
      linkedDealId: z.string().uuid().optional(),
      isInternal: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await personalTaskService.create(input, ctx.user!);
      } catch (error) {
        throw asTrpcError(error);
      }
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      data: z.object({
        taskName: z.string().min(1).max(255).optional(),
        description: z.string().max(2000).nullable().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await personalTaskService.update(input.id, ctx.user!, input.data);
      } catch (error) {
        throw asTrpcError(error);
      }
    }),

  complete: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      hoursSpent: z.number().min(0.1).max(24),
      startedAt: z.string().optional(),
      completedAt: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await personalTaskService.complete(input.id, ctx.user!, {
          hoursSpent: input.hoursSpent,
          startedAt: input.startedAt ? new Date(input.startedAt) : undefined,
          completedAt: input.completedAt ? new Date(input.completedAt) : undefined,
        });
      } catch (error) {
        throw asTrpcError(error);
      }
    }),

  cancel: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await personalTaskService.cancel(input.id, ctx.user!);
      } catch (error) {
        throw asTrpcError(error);
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await personalTaskService.delete(input.id, ctx.user!);
        return { success: true };
      } catch (error) {
        throw asTrpcError(error);
      }
    }),

  linkableEntities: protectedProcedure
    .query(({ ctx }) => personalTaskService.getLinkableEntities(ctx.user!)),

  listAll: protectedProcedure
    .input(z.object({
      userId: z.string().uuid().optional(),
      status: statusSchema.optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      linkType: linkTypeSchema.optional(),
      companyId: z.string().uuid().optional(),
    }).optional())
    .query(({ ctx, input }) => {
      if (ctx.user!.role.slug !== 'super_admin') throw new TRPCError({ code: 'FORBIDDEN', message: 'Task reports are restricted to super admins.' });
      return personalTaskService.listAllTasks(ctx.user!, {
        userId: input?.userId,
        status: input?.status,
        from: toDate(input?.from),
        to: toDate(input?.to),
        linkType: input?.linkType,
        companyId: input?.companyId,
      });
    }),

  teamSummary: protectedProcedure
    .input(z.object({
      from: z.string(),
      to: z.string(),
      userId: z.string().uuid().optional(),
      status: statusSchema.optional(),
      linkType: linkTypeSchema.optional(),
      companyId: z.string().uuid().optional(),
    }))
    .query(({ ctx, input }) => {
      if (ctx.user!.role.slug !== 'super_admin') throw new TRPCError({ code: 'FORBIDDEN', message: 'Task reports are restricted to super admins.' });
      return personalTaskService.getTeamSummary(ctx.user!, new Date(input.from), new Date(input.to), {
        userId: input.userId,
        status: input.status,
        linkType: input.linkType,
        companyId: input.companyId,
      });
    }),
});
