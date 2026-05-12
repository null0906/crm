import { db as defaultDb } from '@/server/db';
import { notifications } from '@/server/db/schema';

type DbClient = typeof defaultDb;

export async function createNotification(
  input: {
    userId: string;
    type: string;
    title: string;
    body?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  },
  db: DbClient = defaultDb
) {
  const [notification] = await db
    .insert(notifications)
    .values({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata ?? {},
    })
    .returning();

  return notification!;
}
