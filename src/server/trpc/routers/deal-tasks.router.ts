import { z } from 'zod';
import { router, protectedProcedure } from '../router';
import { requirePermission } from '../middleware';
import { dealTaskCreateSchema, dealTaskUpdateSchema } from '@/server/lib/validators';
import * as dealTaskService from '@/server/services/deal-task.service';

export const dealTasksRouter = router({
  list: protectedProcedure
    .use(requirePermission('deals', 'read'))
    .input(z.object({
      dealId: z.string().uuid(),
      status: z.enum(['pending', 'in_progress', 'completed', 'blocked']).optional(),
    }))
    .query(async ({ input }) => {
      return dealTaskService.listDealTasks(input.dealId, input.status);
    }),

  create: protectedProcedure
    .use(requirePermission('deals', 'update'))
    .input(dealTaskCreateSchema)
    .mutation(async ({ ctx, input }) => {
      return dealTaskService.createDealTask(ctx.user!, input);
    }),

  updateStatus: protectedProcedure
    .use(requirePermission('deals', 'update'))
    .input(z.object({
      id: z.string().uuid(),
      status: z.enum(['pending', 'in_progress', 'completed', 'blocked']),
    }))
    .mutation(async ({ input }) => {
      return dealTaskService.updateDealTaskStatus(input.id, input.status);
    }),

  update: protectedProcedure
    .use(requirePermission('deals', 'update'))
    .input(z.object({ id: z.string().uuid(), data: dealTaskUpdateSchema }))
    .mutation(async ({ input }) => {
      return dealTaskService.updateDealTask(input.id, input.data);
    }),

  delete: protectedProcedure
    .use(requirePermission('deals', 'update'))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await dealTaskService.deleteDealTask(input.id);
      return { success: true };
    }),
});
