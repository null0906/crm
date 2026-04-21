import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../router';
import { requirePermission } from '../middleware';
import { companyCreateSchema, companyUpdateSchema, companyBulkUpdateSchema, filterConfigSchema, paginationSchema, sortSchema } from '@/server/lib/validators';
import * as companyService from '@/server/services/company.service';

export const companyRouter = router({
  list: protectedProcedure
    .use(requirePermission('companies', 'read'))
    .input(z.object({
      filters: filterConfigSchema.optional(),
      sort: sortSchema.optional(),
      pagination: paginationSchema,
      search: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      return companyService.listCompanies(ctx.user!, {
        filters: input.filters,
        search: input.search,
        sort: input.sort,
        pagination: input.pagination,
      });
    }),

  getById: protectedProcedure
    .use(requirePermission('companies', 'read'))
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const company = await companyService.getCompanyById(ctx.user!, input.id);
      if (!company) throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      return company;
    }),

  create: protectedProcedure
    .use(requirePermission('companies', 'create'))
    .input(companyCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const { tagIds, ...data } = input;
      const company = await companyService.createCompany(ctx.user!, data);
      if (tagIds?.length) await companyService.addCompanyTags(ctx.user!, company.id as string, tagIds);
      return company;
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: companyUpdateSchema }))
    .mutation(async ({ ctx, input }) => {
      return companyService.updateCompany(ctx.user!, input.id, input.data);
    }),

  delete: protectedProcedure
    .use(requirePermission('companies', 'delete'))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await companyService.deleteCompany(ctx.user!, input.id);
      return { success: true };
    }),

  bulkUpdate: protectedProcedure
    .use(requirePermission('companies', 'update'))
    .input(z.object({
      ids: z.array(z.string().uuid()).min(1),
      data: companyBulkUpdateSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      return companyService.bulkUpdateCompanies(ctx.user!, input.ids, input.data);
    }),

  addTags: protectedProcedure
    .input(z.object({ id: z.string().uuid(), tagIds: z.array(z.string().uuid()) }))
    .mutation(async ({ ctx, input }) => {
      await companyService.addCompanyTags(ctx.user!, input.id, input.tagIds);
      return { success: true };
    }),

  removeTags: protectedProcedure
    .input(z.object({ id: z.string().uuid(), tagIds: z.array(z.string().uuid()) }))
    .mutation(async ({ ctx, input }) => {
      await companyService.removeCompanyTags(ctx.user!, input.id, input.tagIds);
      return { success: true };
    }),
});
