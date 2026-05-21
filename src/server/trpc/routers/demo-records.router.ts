import { z } from 'zod';
import { router, protectedProcedure } from '../router';
import { requirePermission } from '../middleware';
import { demoRecordCreateSchema, demoRecordUpdateSchema } from '@/server/lib/validators';
import * as demoRecordService from '@/server/services/demo-record.service';

export const demoRecordsRouter = router({
  list: protectedProcedure
    .use(requirePermission('activities', 'read'))
    .input(z.object({
      contactId: z.string().uuid().optional(),
      contactCompanyId: z.string().uuid().optional(),
      dealId: z.string().uuid().optional(),
      dealCompanyId: z.string().uuid().optional(),
      companyId: z.string().uuid().optional(),
    }))
    .query(async ({ input }) => {
      return demoRecordService.listDemoRecords(input);
    }),

  create: protectedProcedure
    .use(requirePermission('activities', 'create'))
    .input(demoRecordCreateSchema)
    .mutation(async ({ ctx, input }) => {
      return demoRecordService.createDemoRecord(ctx.user!, input);
    }),

  update: protectedProcedure
    .use(requirePermission('activities', 'update'))
    .input(z.object({ id: z.string().uuid(), data: demoRecordUpdateSchema }))
    .mutation(async ({ input }) => {
      return demoRecordService.updateDemoRecord(input.id, input.data);
    }),

  delete: protectedProcedure
    .use(requirePermission('activities', 'delete'))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await demoRecordService.deleteDemoRecord(input.id);
      return { success: true };
    }),

  previewBackfill: protectedProcedure
    .use(requirePermission('activities', 'read'))
    .query(async () => {
      return demoRecordService.previewDemoBackfill();
    }),

  runBackfill: protectedProcedure
    .use(requirePermission('activities', 'create'))
    .mutation(async ({ ctx }) => {
      return demoRecordService.runDemoBackfill(ctx.user!.id);
    }),
});
