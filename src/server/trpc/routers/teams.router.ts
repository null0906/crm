import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../router';
import { requirePermission } from '../middleware';
import { db } from '@/server/db';
import { teamsUsers, teamsMessageLog, users } from '@/server/db/schema';
import { eq, desc, count } from 'drizzle-orm';
import { getTeamsApp, bulkLinkUsersByEmail } from '@/server/services/teams.service';
import { GraphAuthError } from '@/server/lib/microsoft-graph';
import { paginationSchema } from '@/server/lib/validators';

// Teams settings require admin-level access (same as user management)
const requireTeamsManage = requirePermission('users', 'manage');

export const teamsRouter = router({
  /** List all authorized Teams users */
  listUsers: protectedProcedure
    .use(requireTeamsManage)
    .query(async () => {
      return db
        .select({
          id: teamsUsers.id,
          aadObjectId: teamsUsers.aadObjectId,
          teamsName: teamsUsers.teamsName,
          isActive: teamsUsers.isActive,
          lastActiveAt: teamsUsers.lastActiveAt,
          createdAt: teamsUsers.createdAt,
          crmUserId: teamsUsers.crmUserId,
          crmUserFirstName: users.firstName,
          crmUserLastName: users.lastName,
          crmUserEmail: users.email,
        })
        .from(teamsUsers)
        .innerJoin(users, eq(teamsUsers.crmUserId, users.id))
        .orderBy(desc(teamsUsers.createdAt));
    }),

  /** Add a new Teams → CRM user mapping */
  addUser: protectedProcedure
    .use(requireTeamsManage)
    .input(z.object({
      aadObjectId: z.string().uuid('Must be a valid Entra ID Object ID (GUID)'),
      teamsName: z.string().optional(),
      crmUserId: z.string().uuid(),
    }))
    .mutation(async ({ input }) => {
      const [existing] = await db
        .select({ id: teamsUsers.id })
        .from(teamsUsers)
        .where(eq(teamsUsers.aadObjectId, input.aadObjectId))
        .limit(1);

      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'This Teams account is already registered' });
      }

      const [created] = await db
        .insert(teamsUsers)
        .values({
          aadObjectId: input.aadObjectId,
          teamsName: input.teamsName,
          crmUserId: input.crmUserId,
          isActive: true,
        })
        .returning();

      return created;
    }),

  /**
   * Links every active CRM user to Teams automatically by resolving their email against
   * Entra ID via Microsoft Graph — no need for each person to message the bot first.
   * Requires the bot's app registration to have User.Read.All (application permission,
   * admin-consented) in addition to its existing bot-messaging permissions.
   */
  bulkLinkByEmail: protectedProcedure
    .use(requireTeamsManage)
    .mutation(async () => {
      try {
        return await bulkLinkUsersByEmail();
      } catch (error) {
        if (error instanceof GraphAuthError) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: `Microsoft Graph access isn't set up correctly: ${error.message}`,
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Bulk sync failed.',
        });
      }
    }),

  /** Remove a Teams user mapping */
  removeUser: protectedProcedure
    .use(requireTeamsManage)
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await db.delete(teamsUsers).where(eq(teamsUsers.id, input.id));
      return { success: true };
    }),

  /** Toggle active/inactive */
  toggleActive: protectedProcedure
    .use(requireTeamsManage)
    .input(z.object({ id: z.string().uuid(), isActive: z.boolean() }))
    .mutation(async ({ input }) => {
      const [updated] = await db
        .update(teamsUsers)
        .set({ isActive: input.isActive, updatedAt: new Date() })
        .where(eq(teamsUsers.id, input.id))
        .returning();
      return updated;
    }),

  /** Paginated message log */
  getMessageLog: protectedProcedure
    .use(requireTeamsManage)
    .input(z.object({
      pagination: paginationSchema,
      command: z.string().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const rows = await db
        .select()
        .from(teamsMessageLog)
        .orderBy(desc(teamsMessageLog.createdAt))
        .limit(input.pagination.limit + 1);

      const hasMore = rows.length > input.pagination.limit;
      const items = hasMore ? rows.slice(0, input.pagination.limit) : rows;

      return { items, hasMore, nextCursor: hasMore ? String(items[items.length - 1]?.id) : null };
    }),

  /** Test that the bot's Azure AD credentials are configured and the app initializes */
  testConnection: protectedProcedure
    .use(requireTeamsManage)
    .mutation(async () => {
      try {
        const app = await getTeamsApp();
        if (!app.id) {
          return { success: false, error: 'App initialized but no App ID resolved — check TEAMS_BOT_APP_ID.' };
        }
        return { success: true, appId: app.id };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    }),

  /** Bot status overview */
  getBotStatus: protectedProcedure
    .use(requireTeamsManage)
    .query(async () => {
      try {
        const app = await getTeamsApp();
        const [lastMsg] = await db
          .select({ createdAt: teamsMessageLog.createdAt })
          .from(teamsMessageLog)
          .orderBy(desc(teamsMessageLog.createdAt))
          .limit(1);

        const [userCount] = await db
          .select({ count: count() })
          .from(teamsUsers)
          .where(eq(teamsUsers.isActive, true));

        return {
          connected: Boolean(app.id),
          appId: app.id,
          activeUsers: userCount?.count ?? 0,
          lastMessageAt: lastMsg?.createdAt ?? null,
        };
      } catch {
        return { connected: false };
      }
    }),
});
