import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../router';
import { requirePermission } from '../middleware';
import { db } from '@/server/db';
import { whatsappUsers, whatsappMessageLog, users } from '@/server/db/schema';
import { eq, desc, count } from 'drizzle-orm';
import { getPhoneNumberInfo } from '@/server/lib/whatsapp-bot';
import { paginationSchema } from '@/server/lib/validators';

// WhatsApp settings require admin-level access (same as user management)
const requireWhatsappManage = requirePermission('users', 'manage');

export const whatsappRouter = router({
  /** List all authorized WhatsApp users */
  listUsers: protectedProcedure
    .use(requireWhatsappManage)
    .query(async () => {
      return db
        .select({
          id: whatsappUsers.id,
          waId: whatsappUsers.waId,
          waName: whatsappUsers.waName,
          isActive: whatsappUsers.isActive,
          lastActiveAt: whatsappUsers.lastActiveAt,
          createdAt: whatsappUsers.createdAt,
          crmUserId: whatsappUsers.crmUserId,
          crmUserFirstName: users.firstName,
          crmUserLastName: users.lastName,
          crmUserEmail: users.email,
        })
        .from(whatsappUsers)
        .innerJoin(users, eq(whatsappUsers.crmUserId, users.id))
        .orderBy(desc(whatsappUsers.createdAt));
    }),

  /** Add a new WhatsApp → CRM user mapping */
  addUser: protectedProcedure
    .use(requireWhatsappManage)
    .input(z.object({
      waId: z.string().trim().min(5).max(20).regex(/^\d+$/, 'Use digits only, e.g. 919999999999'),
      waName: z.string().optional(),
      crmUserId: z.string().uuid(),
    }))
    .mutation(async ({ input }) => {
      const [existing] = await db
        .select({ id: whatsappUsers.id })
        .from(whatsappUsers)
        .where(eq(whatsappUsers.waId, input.waId))
        .limit(1);

      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'This WhatsApp number is already registered' });
      }

      const [created] = await db
        .insert(whatsappUsers)
        .values({
          waId: input.waId,
          waName: input.waName,
          crmUserId: input.crmUserId,
          isActive: true,
        })
        .returning();

      return created;
    }),

  /** Remove a WhatsApp user mapping */
  removeUser: protectedProcedure
    .use(requireWhatsappManage)
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await db.delete(whatsappUsers).where(eq(whatsappUsers.id, input.id));
      return { success: true };
    }),

  /** Toggle active/inactive */
  toggleActive: protectedProcedure
    .use(requireWhatsappManage)
    .input(z.object({ id: z.string().uuid(), isActive: z.boolean() }))
    .mutation(async ({ input }) => {
      const [updated] = await db
        .update(whatsappUsers)
        .set({ isActive: input.isActive, updatedAt: new Date() })
        .where(eq(whatsappUsers.id, input.id))
        .returning();
      return updated;
    }),

  /** Paginated message log */
  getMessageLog: protectedProcedure
    .use(requireWhatsappManage)
    .input(z.object({
      pagination: paginationSchema,
      command: z.string().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const rows = await db
        .select()
        .from(whatsappMessageLog)
        .orderBy(desc(whatsappMessageLog.createdAt))
        .limit(input.pagination.limit + 1);

      const hasMore = rows.length > input.pagination.limit;
      const items = hasMore ? rows.slice(0, input.pagination.limit) : rows;

      return { items, hasMore, nextCursor: hasMore ? String(items[items.length - 1]?.id) : null };
    }),

  /** Test Cloud API connectivity */
  testConnection: protectedProcedure
    .use(requireWhatsappManage)
    .mutation(async () => {
      try {
        const info = await getPhoneNumberInfo();
        return { success: true, displayPhoneNumber: info.display_phone_number, verifiedName: info.verified_name };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    }),

  /** Bot status overview */
  getBotStatus: protectedProcedure
    .use(requireWhatsappManage)
    .query(async () => {
      try {
        const info = await getPhoneNumberInfo();
        const [lastMsg] = await db
          .select({ createdAt: whatsappMessageLog.createdAt })
          .from(whatsappMessageLog)
          .orderBy(desc(whatsappMessageLog.createdAt))
          .limit(1);

        const [userCount] = await db
          .select({ count: count() })
          .from(whatsappUsers)
          .where(eq(whatsappUsers.isActive, true));

        return {
          connected: true,
          displayPhoneNumber: info.display_phone_number,
          verifiedName: info.verified_name,
          activeUsers: userCount?.count ?? 0,
          lastMessageAt: lastMsg?.createdAt ?? null,
        };
      } catch {
        return { connected: false };
      }
    }),
});
