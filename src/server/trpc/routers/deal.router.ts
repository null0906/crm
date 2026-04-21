import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../router';
import { requirePermission } from '../middleware';
import { dealCreateSchema, dealUpdateSchema, dealBulkUpdateSchema, filterConfigSchema, paginationSchema, sortSchema } from '@/server/lib/validators';
import * as dealService from '@/server/services/deal.service';

export const dealRouter = router({
  list: protectedProcedure
    .use(requirePermission('deals', 'read'))
    .input(z.object({
      filters: filterConfigSchema.optional(),
      sort: sortSchema.optional(),
      pagination: paginationSchema,
      search: z.string().optional(),
      pipelineId: z.string().uuid().optional(),
    }))
    .query(async ({ ctx, input }) => {
      return dealService.listDeals(ctx.user!, {
        filters: input.filters,
        search: input.search,
        sort: input.sort,
        pagination: input.pagination,
        pipelineId: input.pipelineId,
      });
    }),

  byCompany: protectedProcedure
    .use(requirePermission('deals', 'read'))
    .input(z.object({ companyId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return dealService.getDealsByCompany(ctx.user!, input.companyId);
    }),

  byContact: protectedProcedure
    .use(requirePermission('deals', 'read'))
    .input(z.object({ contactId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return dealService.getDealsByContact(ctx.user!, input.contactId);
    }),

  byStage: protectedProcedure
    .use(requirePermission('deals', 'read'))
    .input(z.object({ pipelineId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return dealService.getDealsByStage(ctx.user!, input.pipelineId);
    }),

  getById: protectedProcedure
    .use(requirePermission('deals', 'read'))
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const deal = await dealService.getDealById(ctx.user!, input.id);
      if (!deal) throw new TRPCError({ code: 'NOT_FOUND', message: 'Deal not found' });
      return deal;
    }),

  create: protectedProcedure
    .use(requirePermission('deals', 'create'))
    .input(dealCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const { tagIds, ...data } = input;
      const deal = await dealService.createDeal(ctx.user!, {
        ...data,
        amount: data.amount?.toString(),
      } as Parameters<typeof dealService.createDeal>[1]);
      if (tagIds?.length) await dealService.addDealTags(ctx.user!, deal.id as string, tagIds);
      return deal;
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: dealUpdateSchema }))
    .mutation(async ({ ctx, input }) => {
      const { ...data } = input.data;
      return dealService.updateDeal(ctx.user!, input.id, {
        ...data,
        amount: data.amount?.toString(),
      } as Parameters<typeof dealService.updateDeal>[2]);
    }),

  delete: protectedProcedure
    .use(requirePermission('deals', 'delete'))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await dealService.deleteDeal(ctx.user!, input.id);
      return { success: true };
    }),

  bulkUpdate: protectedProcedure
    .use(requirePermission('deals', 'update'))
    .input(z.object({
      ids: z.array(z.string().uuid()).min(1),
      data: dealBulkUpdateSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      return dealService.bulkUpdateDeals(ctx.user!, input.ids, input.data);
    }),

  moveToStage: protectedProcedure
    .input(z.object({
      dealId: z.string().uuid(),
      toStageId: z.string().uuid(),
      positionInStage: z.number().int().optional(),
      lostReason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return dealService.moveDealToStage(ctx.user!, input.dealId, input.toStageId, input.positionInStage, input.lostReason);
    }),

  addTags: protectedProcedure
    .input(z.object({ id: z.string().uuid(), tagIds: z.array(z.string().uuid()) }))
    .mutation(async ({ ctx, input }) => {
      await dealService.addDealTags(ctx.user!, input.id, input.tagIds);
      return { success: true };
    }),

  removeTags: protectedProcedure
    .input(z.object({ id: z.string().uuid(), tagIds: z.array(z.string().uuid()) }))
    .mutation(async ({ ctx, input }) => {
      await dealService.removeDealTags(ctx.user!, input.id, input.tagIds);
      return { success: true };
    }),
});
