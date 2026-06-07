import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import { activities } from '@/server/db/schema';

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
