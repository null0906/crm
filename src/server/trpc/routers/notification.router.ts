import { z } from 'zod';
import { router, protectedProcedure } from '../router';
import { db } from '@/server/db';
import { notifications } from '@/server/db/schema';
import { eq, and, desc, isNull } from 'drizzle-orm';

export const notificationRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(50).default(20),
      unreadOnly: z.boolean().default(false),
    }))
    .query(async ({ ctx, input }) => {
      const conditions = [eq(notifications.userId, ctx.user!.id)];
      if (input.unreadOnly) {
        conditions.push(eq(notifications.isRead, false));
      }

      const rows = await db
        .select()
        .from(notifications)
        .where(and(...conditions))
        .orderBy(desc(notifications.createdAt))
        .limit(input.limit);

      return rows;
    }),

  unreadCount: protectedProcedure
    .query(async ({ ctx }) => {
      const rows = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(and(eq(notifications.userId, ctx.user!.id), eq(notifications.isRead, false)));

      return { count: rows.length };
    }),

  markRead: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.id, input.id), eq(notifications.userId, ctx.user!.id)));
      return { success: true };
    }),

  markAllRead: protectedProcedure
    .mutation(async ({ ctx }) => {
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.userId, ctx.user!.id), eq(notifications.isRead, false)));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(notifications)
        .where(and(eq(notifications.id, input.id), eq(notifications.userId, ctx.user!.id)));
      return { success: true };
    }),
});
