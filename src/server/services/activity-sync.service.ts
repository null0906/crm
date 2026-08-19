import { and, count, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/server/db';
import { activities, deals } from '@/server/db/schema';

export async function syncContactActivitiesToDeal(dealId: string, contactId: string, triggeredBy: string): Promise<number> {
  const [result] = await db
    .select({ value: count() })
    .from(activities)
    .where(and(eq(activities.contactId, contactId), isNull(activities.dealId), isNull(activities.deletedAt)));
  const syncedCount = result?.value ?? 0;
  if (syncedCount === 0) return 0;

  await db.update(activities)
    .set({ dealId, updatedAt: new Date() })
    .where(and(eq(activities.contactId, contactId), isNull(activities.dealId), isNull(activities.deletedAt)));

  await db.insert(activities).values({
    activityType: 'note',
    subject: `${syncedCount} historical activities synced from contact`,
    dealId,
    contactId,
    performedBy: triggeredBy,
    isAutomated: true,
    metadata: { trigger: 'prospect_created_from_contact', syncedActivityCount: syncedCount },
    occurredAt: new Date(),
  });
  return syncedCount;
}

export async function syncActivityToMatchingDeal(activityId: string): Promise<string | null> {
  const [activity] = await db
    .select({
      id: activities.id,
      dealId: activities.dealId,
      contactId: activities.contactId,
      companyId: activities.companyId,
    })
    .from(activities)
    .where(and(eq(activities.id, activityId), isNull(activities.deletedAt)))
    .limit(1);

  if (!activity || activity.dealId || (!activity.contactId && !activity.companyId)) return activity?.dealId ?? null;

  const dealConditions = [isNull(deals.deletedAt)];
  const entityConditions = [];
  if (activity.contactId) entityConditions.push(eq(deals.primaryContactId, activity.contactId));
  if (activity.companyId) entityConditions.push(eq(deals.companyId, activity.companyId));
  if (entityConditions.length === 0) return null;

  const [deal] = await db
    .select({ id: deals.id })
    .from(deals)
    .where(and(...dealConditions, or(...entityConditions)!))
    .orderBy(deals.updatedAt)
    .limit(1);

  if (!deal) return null;

  await db
    .update(activities)
    .set({ dealId: deal.id, updatedAt: new Date() })
    .where(and(eq(activities.id, activityId), isNull(activities.dealId), isNull(activities.deletedAt)));

  return deal.id;
}
