import { db as defaultDb } from '@/server/db';
import { activities } from '@/server/db/schema';
import type { ActivityType, TaskPriority } from '@/lib/types';

type DbClient = typeof defaultDb;

export async function createAutomatedActivity(
  input: {
    activityType: ActivityType;
    subject?: string | null;
    body?: string | null;
    contactId?: string | null;
    companyId?: string | null;
    dealId?: string | null;
    performedBy: string;
    taskDueDate?: string | null;
    taskPriority?: TaskPriority | null;
    metadata?: Record<string, unknown>;
  },
  db: DbClient = defaultDb
) {
  const [activity] = await db
    .insert(activities)
    .values({
      activityType: input.activityType,
      subject: input.subject,
      body: input.body,
      contactId: input.contactId,
      companyId: input.companyId,
      dealId: input.dealId,
      performedBy: input.performedBy,
      taskDueDate: input.taskDueDate,
      taskPriority: input.taskPriority,
      metadata: input.metadata ?? {},
      isAutomated: true,
    })
    .returning();

  return activity!;
}
