import { db } from '@/server/db';
import { dealTasks, users } from '@/server/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import type { DealTaskStatus, SessionUser, TaskPriority } from '@/lib/types';

export async function listDealTasks(dealId: string, status?: DealTaskStatus) {
  const conditions = [eq(dealTasks.dealId, dealId)];
  if (status) conditions.push(eq(dealTasks.status, status));

  return db
    .select({
      id: dealTasks.id,
      dealId: dealTasks.dealId,
      title: dealTasks.title,
      description: dealTasks.description,
      status: dealTasks.status,
      priority: dealTasks.priority,
      assignedTo: dealTasks.assignedTo,
      dueDate: dealTasks.dueDate,
      completedAt: dealTasks.completedAt,
      position: dealTasks.position,
      createdAt: dealTasks.createdAt,
      updatedAt: dealTasks.updatedAt,
      assigneeFirstName: users.firstName,
      assigneeLastName: users.lastName,
      assigneeEmail: users.email,
      assigneeAvatarUrl: users.avatarUrl,
    })
    .from(dealTasks)
    .leftJoin(users, eq(dealTasks.assignedTo, users.id))
    .where(and(...conditions))
    .orderBy(asc(dealTasks.position), asc(dealTasks.dueDate), asc(dealTasks.createdAt));
}

export async function createDealTask(
  user: SessionUser,
  data: {
    dealId: string;
    title: string;
    description?: string | null;
    assignedTo?: string | null;
    dueDate?: string | null;
    priority?: TaskPriority;
  }
) {
  const [task] = await db
    .insert(dealTasks)
    .values({
      ...data,
      status: 'pending',
      priority: data.priority ?? 'medium',
      createdBy: user.id,
    })
    .returning();

  return task;
}

export async function updateDealTaskStatus(id: string, status: DealTaskStatus) {
  const [task] = await db
    .update(dealTasks)
    .set({
      status,
      completedAt: status === 'completed' ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(dealTasks.id, id))
    .returning();

  return task;
}

export async function updateDealTask(
  id: string,
  data: {
    title?: string;
    description?: string | null;
    assignedTo?: string | null;
    dueDate?: string | null;
    priority?: TaskPriority;
    status?: DealTaskStatus;
    position?: number;
  }
) {
  const [task] = await db
    .update(dealTasks)
    .set({
      ...data,
      ...(data.status === 'completed' ? { completedAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(dealTasks.id, id))
    .returning();

  return task;
}

export async function deleteDealTask(id: string) {
  await db.delete(dealTasks).where(eq(dealTasks.id, id));
}
