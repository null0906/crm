import { z } from 'zod';
import { router, protectedProcedure } from '../router';
import { requirePermission } from '../middleware';
import { db } from '@/server/db';
import { activities, users, contacts, companies, deals, pipelineStages } from '@/server/db/schema';
import { eq, and, isNull, desc, inArray } from 'drizzle-orm';
import { activityCreateSchema, paginationSchema } from '@/server/lib/validators';
import { writeAuditLog } from '@/server/services/audit.service';
import eventBus from '@/server/lib/event-bus';

export const activityRouter = router({
  list: protectedProcedure
    .use(requirePermission('activities', 'read'))
    .input(z.object({
      contactId: z.string().uuid().optional(),
      companyId: z.string().uuid().optional(),
      dealId: z.string().uuid().optional(),
      activityType: z.string().optional(),
      pagination: paginationSchema,
    }))
    .query(async ({ ctx, input }) => {
      const conditions = [isNull(activities.deletedAt)];

      if (input.contactId) conditions.push(eq(activities.contactId, input.contactId));
      if (input.companyId) conditions.push(eq(activities.companyId, input.companyId));
      if (input.dealId) conditions.push(eq(activities.dealId, input.dealId));
      if (input.activityType) conditions.push(eq(activities.activityType, input.activityType as import('@/lib/types').ActivityType));

      const rows = await db
        .select({
          id: activities.id,
          activityType: activities.activityType,
          subject: activities.subject,
          body: activities.body,
          callDurationSeconds: activities.callDurationSeconds,
          callOutcome: activities.callOutcome,
          callDirection: activities.callDirection,
          meetingStartAt: activities.meetingStartAt,
          meetingEndAt: activities.meetingEndAt,
          meetingLocation: activities.meetingLocation,
          meetingLink: activities.meetingLink,
          taskDueDate: activities.taskDueDate,
          taskCompletedAt: activities.taskCompletedAt,
          taskPriority: activities.taskPriority,
          contactId: activities.contactId,
          companyId: activities.companyId,
          dealId: activities.dealId,
          contactName: contacts.firstName,
          contactLastName: contacts.lastName,
          companyName: companies.name,
          dealTitle: deals.title,
          isAutomated: activities.isAutomated,
          attachments: activities.attachments,
          metadata: activities.metadata,
          occurredAt: activities.occurredAt,
          createdAt: activities.createdAt,
          performedById: activities.performedBy,
          performerFirstName: users.firstName,
          performerLastName: users.lastName,
          performerAvatarUrl: users.avatarUrl,
        })
        .from(activities)
        .leftJoin(users, eq(activities.performedBy, users.id))
        .leftJoin(contacts, eq(activities.contactId, contacts.id))
        .leftJoin(companies, eq(activities.companyId, companies.id))
        .leftJoin(deals, eq(activities.dealId, deals.id))
        .where(and(...conditions))
        .orderBy(desc(activities.occurredAt))
        .limit(input.pagination.limit + 1);

      const hasMore = rows.length > input.pagination.limit;
      const items = hasMore ? rows.slice(0, input.pagination.limit) : rows;
      const stageIds = Array.from(
        new Set(
          items.flatMap((item) => {
            const metadata = (item.metadata as Record<string, unknown> | null) ?? {};
            return [metadata.fromStageId, metadata.toStageId]
              .filter((value): value is string => typeof value === 'string' && value.length > 0);
          })
        )
      );

      let stageNameMap = new Map<string, string>();
      if (stageIds.length > 0) {
        const stageRows = await db
          .select({ id: pipelineStages.id, name: pipelineStages.name })
          .from(pipelineStages)
          .where(inArray(pipelineStages.id, stageIds));
        stageNameMap = new Map(stageRows.map((stage) => [stage.id, stage.name]));
      }

      const enrichedItems = items.map((item) => {
        const metadata = ((item.metadata as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
        const contactFullName = [item.contactName, item.contactLastName].filter(Boolean).join(' ').trim() || null;
        const fromStageId = typeof metadata.fromStageId === 'string' ? metadata.fromStageId : null;
        const toStageId = typeof metadata.toStageId === 'string' ? metadata.toStageId : null;

        return {
          ...item,
          contactFullName,
          metadata: {
            ...metadata,
            fromStageName: fromStageId ? stageNameMap.get(fromStageId) ?? null : null,
            toStageName: toStageId ? stageNameMap.get(toStageId) ?? null : null,
          },
        };
      });

      let nextCursor: string | null = null;
      if (hasMore && items.length > 0) {
        const last = items[items.length - 1]!;
        nextCursor = `${last.occurredAt.toISOString()}__${last.id}`;
      }

      return { items: enrichedItems, nextCursor, hasMore };
    }),

  create: protectedProcedure
    .use(requirePermission('activities', 'create'))
    .input(activityCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const { meetingStartAt, meetingEndAt, occurredAt, ...rest } = input;
      const [activity] = await db
        .insert(activities)
        .values({
          ...rest,
          meetingStartAt: meetingStartAt ? new Date(meetingStartAt) : null,
          meetingEndAt: meetingEndAt ? new Date(meetingEndAt) : null,
          occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
          performedBy: ctx.user!.id,
          isAutomated: false,
        })
        .returning();

      eventBus.emit('activity.created', {
        activityId: activity!.id,
        activityType: activity!.activityType,
        entityIds: [input.contactId, input.companyId, input.dealId].filter(Boolean) as string[],
        performedBy: ctx.user!.id,
      });

      await writeAuditLog({
        userId: ctx.user!.id,
        userEmail: ctx.user!.email,
        action: 'create',
        entityType: 'activity',
        entityId: activity!.id,
        entityName: activity!.subject ?? activity!.activityType,
      });

      return activity;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      subject: z.string().optional(),
      body: z.string().optional(),
      taskCompletedAt: z.string().datetime().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, taskCompletedAt, ...data } = input;
      const [updated] = await db
        .update(activities)
        .set({
          ...data,
          taskCompletedAt: taskCompletedAt ? new Date(taskCompletedAt) : null,
          updatedAt: new Date(),
        })
        .where(and(eq(activities.id, id), eq(activities.performedBy, ctx.user!.id)))
        .returning();
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(activities)
        .set({ deletedAt: new Date() })
        .where(and(eq(activities.id, input.id), eq(activities.performedBy, ctx.user!.id)));
      return { success: true };
    }),
});
