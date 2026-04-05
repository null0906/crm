import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../router';
import { requirePermission } from '../middleware';
import { contactCreateSchema, contactUpdateSchema, contactBulkUpdateSchema, filterConfigSchema, paginationSchema, sortSchema } from '@/server/lib/validators';
import * as contactService from '@/server/services/contact.service';

export const contactRouter = router({
  list: protectedProcedure
    .use(requirePermission('contacts', 'read'))
    .input(z.object({
      filters: filterConfigSchema.optional(),
      sort: sortSchema.optional(),
      pagination: paginationSchema,
      search: z.string().optional(),
      viewId: z.string().uuid().optional(),
    }))
    .query(async ({ ctx, input }) => {
      return contactService.listContacts(ctx.user!, {
        filters: input.filters,
        search: input.search,
        sort: input.sort,
        pagination: input.pagination,
      });
    }),

  byCompany: protectedProcedure
    .use(requirePermission('contacts', 'read'))
    .input(z.object({ companyId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return contactService.getContactsByCompany(ctx.user!, input.companyId);
    }),

  getById: protectedProcedure
    .use(requirePermission('contacts', 'read'))
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const contact = await contactService.getContactById(ctx.user!, input.id);
      if (!contact) throw new TRPCError({ code: 'NOT_FOUND', message: 'Contact not found' });
      return contact;
    }),

  create: protectedProcedure
    .use(requirePermission('contacts', 'create'))
    .input(contactCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const { tagIds, ...data } = input;
      const contact = await contactService.createContact(ctx.user!, data);
      if (tagIds?.length) {
        await contactService.addContactTags(ctx.user!, contact.id as string, tagIds);
      }
      return contact;
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: contactUpdateSchema }))
    .mutation(async ({ ctx, input }) => {
      return contactService.updateContact(ctx.user!, input.id, input.data);
    }),

  delete: protectedProcedure
    .use(requirePermission('contacts', 'delete'))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await contactService.deleteContact(ctx.user!, input.id);
      return { success: true };
    }),

  bulkUpdate: protectedProcedure
    .use(requirePermission('contacts', 'update'))
    .input(z.object({
      ids: z.array(z.string().uuid()).min(1),
      data: contactBulkUpdateSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      return contactService.bulkUpdateContacts(ctx.user!, input.ids, input.data);
    }),

  bulkDelete: protectedProcedure
    .use(requirePermission('contacts', 'delete'))
    .input(z.object({ ids: z.array(z.string().uuid()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      let deleted = 0;
      for (const id of input.ids) {
        await contactService.deleteContact(ctx.user!, id);
        deleted++;
      }
      return { deleted };
    }),

  addTags: protectedProcedure
    .input(z.object({ id: z.string().uuid(), tagIds: z.array(z.string().uuid()) }))
    .mutation(async ({ ctx, input }) => {
      await contactService.addContactTags(ctx.user!, input.id, input.tagIds);
      return { success: true };
    }),

  removeTags: protectedProcedure
    .input(z.object({ id: z.string().uuid(), tagIds: z.array(z.string().uuid()) }))
    .mutation(async ({ ctx, input }) => {
      await contactService.removeContactTags(ctx.user!, input.id, input.tagIds);
      return { success: true };
    }),
});
