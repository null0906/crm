import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../router';
import { requirePermission } from '../middleware';
import { db } from '@/server/db';
import { telegramUsers, telegramMessageLog, users } from '@/server/db/schema';
import { eq, desc, count } from 'drizzle-orm';
import { getBotInfo } from '@/server/lib/telegram-bot';
import { paginationSchema } from '@/server/lib/validators';

const requireTelegramManage = requirePermission('telegram' as never, 'manage');

export const telegramRouter = router({
  /** List all authorized Telegram users */
  listUsers: protectedProcedure
    .use(requireTelegramManage)
    .query(async () => {
      return db
        .select({
          id: telegramUsers.id,
          telegramUserId: telegramUsers.telegramUserId,
          telegramUsername: telegramUsers.telegramUsername,
          isActive: telegramUsers.isActive,
          lastActiveAt: telegramUsers.lastActiveAt,
          createdAt: telegramUsers.createdAt,
          crmUserId: telegramUsers.crmUserId,
          crmUserFirstName: users.firstName,
          crmUserLastName: users.lastName,
          crmUserEmail: users.email,
        })
        .from(telegramUsers)
        .innerJoin(users, eq(telegramUsers.crmUserId, users.id))
        .orderBy(desc(telegramUsers.createdAt));
    }),

  /** Add a new Telegram → CRM user mapping */
  addUser: protectedProcedure
    .use(requireTelegramManage)
    .input(z.object({
      telegramUserId: z.number().int(),
      telegramUsername: z.string().optional(),
      crmUserId: z.string().uuid(),
    }))
    .mutation(async ({ input }) => {
      const [existing] = await db
        .select({ id: telegramUsers.id })
        .from(telegramUsers)
        .where(eq(telegramUsers.telegramUserId, input.telegramUserId))
        .limit(1);

      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'This Telegram ID is already registered' });
      }

      const [created] = await db
        .insert(telegramUsers)
        .values({
          telegramUserId: input.telegramUserId,
          telegramUsername: input.telegramUsername,
          crmUserId: input.crmUserId,
          isActive: true,
        })
        .returning();

      return created;
    }),

  /** Remove a Telegram user mapping */
  removeUser: protectedProcedure
    .use(requireTelegramManage)
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await db.delete(telegramUsers).where(eq(telegramUsers.id, input.id));
      return { success: true };
    }),

  /** Toggle active/inactive */
  toggleActive: protectedProcedure
    .use(requireTelegramManage)
    .input(z.object({ id: z.string().uuid(), isActive: z.boolean() }))
    .mutation(async ({ input }) => {
      const [updated] = await db
        .update(telegramUsers)
        .set({ isActive: input.isActive, updatedAt: new Date() })
        .where(eq(telegramUsers.id, input.id))
        .returning();
      return updated;
    }),

  /** Paginated message log */
  getMessageLog: protectedProcedure
    .use(requireTelegramManage)
    .input(z.object({
      pagination: paginationSchema,
      command: z.string().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const rows = await db
        .select()
        .from(telegramMessageLog)
        .orderBy(desc(telegramMessageLog.createdAt))
        .limit(input.pagination.limit + 1);

      const hasMore = rows.length > input.pagination.limit;
      const items = hasMore ? rows.slice(0, input.pagination.limit) : rows;

      return { items, hasMore, nextCursor: hasMore ? String(items[items.length - 1]?.id) : null };
    }),

  /** Test bot API connectivity */
  testConnection: protectedProcedure
    .use(requireTelegramManage)
    .mutation(async () => {
      try {
        const info = await getBotInfo();
        return { success: true, botUsername: info.username, botId: info.id };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    }),

  /** Bot status overview */
  getBotStatus: protectedProcedure
    .use(requireTelegramManage)
    .query(async () => {
      try {
        const info = await getBotInfo();
        const [lastMsg] = await db
          .select({ createdAt: telegramMessageLog.createdAt })
          .from(telegramMessageLog)
          .orderBy(desc(telegramMessageLog.createdAt))
          .limit(1);

        const [userCount] = await db
          .select({ count: count() })
          .from(telegramUsers)
          .where(eq(telegramUsers.isActive, true));

        return {
          connected: true,
          botUsername: info.username,
          botId: info.id,
          mode: process.env.TELEGRAM_MODE ?? 'webhook',
          activeUsers: userCount?.count ?? 0,
          lastMessageAt: lastMsg?.createdAt ?? null,
        };
      } catch {
        return { connected: false, mode: process.env.TELEGRAM_MODE ?? 'webhook' };
      }
    }),
});
