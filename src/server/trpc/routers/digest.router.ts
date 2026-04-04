import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../router';
import { requirePermission } from '../middleware';
import { db } from '@/server/db';
import { digestSchedules, dashboards } from '@/server/db/schema';
import { eq, desc, asc } from 'drizzle-orm';
import { sendDigest } from '@/server/services/digest.service';

const requireDigestsManage = requirePermission('digests' as never, 'manage');

const scheduleInputSchema = z.object({
  name: z.string().min(1).max(255),
  dashboardId: z.string().uuid().optional().nullable(),
  scheduleType: z.enum(['daily', 'weekly', 'monthly']),
  scheduleTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM'),
  scheduleDayOfWeek: z.number().int().min(0).max(6).optional().nullable(),
  scheduleDayOfMonth: z.number().int().min(1).max(31).optional().nullable(),
  emailRecipients: z.array(z.string().email()),
  telegramRecipients: z.array(z.number().int()),
  isActive: z.boolean(),
});

export const digestRouter = router({
  list: protectedProcedure
    .use(requireDigestsManage)
    .query(async () => {
      const schedules = await db
        .select({
          id: digestSchedules.id,
          name: digestSchedules.name,
          dashboardId: digestSchedules.dashboardId,
          scheduleType: digestSchedules.scheduleType,
          scheduleTime: digestSchedules.scheduleTime,
          scheduleDayOfWeek: digestSchedules.scheduleDayOfWeek,
          scheduleDayOfMonth: digestSchedules.scheduleDayOfMonth,
          emailRecipients: digestSchedules.emailRecipients,
          telegramRecipients: digestSchedules.telegramRecipients,
          isActive: digestSchedules.isActive,
          lastSentAt: digestSchedules.lastSentAt,
          createdAt: digestSchedules.createdAt,
          dashboardName: dashboards.name,
        })
        .from(digestSchedules)
        .leftJoin(dashboards, eq(digestSchedules.dashboardId, dashboards.id))
        .orderBy(asc(digestSchedules.name));

      return schedules;
    }),

  create: protectedProcedure
    .use(requireDigestsManage)
    .input(scheduleInputSchema)
    .mutation(async ({ ctx, input }) => {
      const [created] = await db
        .insert(digestSchedules)
        .values({
          ...input,
          createdBy: ctx.user!.id,
        })
        .returning();
      return created;
    }),

  update: protectedProcedure
    .use(requireDigestsManage)
    .input(z.object({ id: z.string().uuid() }).merge(scheduleInputSchema.partial()))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const [updated] = await db
        .update(digestSchedules)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(digestSchedules.id, id))
        .returning();

      if (!updated) throw new TRPCError({ code: 'NOT_FOUND' });
      return updated;
    }),

  delete: protectedProcedure
    .use(requireDigestsManage)
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await db.delete(digestSchedules).where(eq(digestSchedules.id, input.id));
      return { success: true };
    }),

  toggleActive: protectedProcedure
    .use(requireDigestsManage)
    .input(z.object({ id: z.string().uuid(), isActive: z.boolean() }))
    .mutation(async ({ input }) => {
      const [updated] = await db
        .update(digestSchedules)
        .set({ isActive: input.isActive, updatedAt: new Date() })
        .where(eq(digestSchedules.id, input.id))
        .returning();
      return updated;
    }),

  sendNow: protectedProcedure
    .use(requireDigestsManage)
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const result = await sendDigest(input.id);
      if (!result.success) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error });
      }
      return { success: true };
    }),
});
