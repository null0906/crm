import { db } from '@/server/db';
import { activities, companies, contacts, deals, notifications, users } from '@/server/db/schema';
import { and, desc, eq, isNull, lte } from 'drizzle-orm';

export type TaskReminderGroup = {
  ownerId: string;
  ownerEmail: string;
  ownerFirstName?: string | null;
  tasks: Array<{
    id: string;
    subject: string;
    dueDate: string;
    dealId?: string | null;
    dealTitle?: string | null;
    companyName?: string | null;
    contactName?: string | null;
    notes?: string | null;
    priority?: string | null;
  }>;
};

function startOfTodayDateString(now: Date): string {
  return now.toISOString().split('T')[0] ?? '';
}

async function hasRecentTaskDueNotification(userId: string, activityId: string, since: Date) {
  const [row] = await db
    .select({ createdAt: notifications.createdAt })
    .from(notifications)
    .where(and(
      eq(notifications.userId, userId),
      eq(notifications.type, 'task_due'),
      eq(notifications.entityType, 'activity'),
      eq(notifications.entityId, activityId),
    ))
    .orderBy(desc(notifications.createdAt))
    .limit(1);

  return Boolean(row?.createdAt && row.createdAt >= since);
}

export async function collectTaskDueReminderGroups(now = new Date()): Promise<{ checked: number; groups: TaskReminderGroup[] }> {
  const today = startOfTodayDateString(now);
  const cooldownSince = new Date(now.getTime() - (24 * 60 * 60 * 1000));

  const dueTasks = await db
    .select({
      id: activities.id,
      subject: activities.subject,
      body: activities.body,
      taskDueDate: activities.taskDueDate,
      taskPriority: activities.taskPriority,
      dealId: activities.dealId,
      companyId: activities.companyId,
      contactId: activities.contactId,
      performedById: activities.performedBy,
      ownerEmail: users.email,
      ownerFirstName: users.firstName,
      dealTitle: deals.title,
      companyName: companies.name,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
    })
    .from(activities)
    .leftJoin(users, eq(activities.performedBy, users.id))
    .leftJoin(deals, eq(activities.dealId, deals.id))
    .leftJoin(companies, eq(activities.companyId, companies.id))
    .leftJoin(contacts, eq(activities.contactId, contacts.id))
    .where(and(
      eq(activities.activityType, 'task'),
      isNull(activities.deletedAt),
      isNull(activities.taskCompletedAt),
      lte(activities.taskDueDate, today),
    ));

  const remindersByOwner = new Map<string, TaskReminderGroup>();

  for (const task of dueTasks) {
    if (!task.performedById || !task.ownerEmail || !task.taskDueDate) continue;
    if (await hasRecentTaskDueNotification(task.performedById, task.id, cooldownSince)) continue;

    const contactName = [task.contactFirstName, task.contactLastName].filter(Boolean).join(' ').trim() || null;

    const group = remindersByOwner.get(task.performedById) ?? {
      ownerId: task.performedById,
      ownerEmail: task.ownerEmail,
      ownerFirstName: task.ownerFirstName,
      tasks: [],
    };

    group.tasks.push({
      id: task.id,
      subject: task.subject ?? 'Untitled reminder',
      dueDate: task.taskDueDate,
      dealTitle: task.dealTitle,
      dealId: task.dealId,
      companyName: task.companyName,
      contactName,
      priority: task.taskPriority,
      notes: task.body,
    });
    remindersByOwner.set(task.performedById, group);
  }

  return { checked: dueTasks.length, groups: Array.from(remindersByOwner.values()).filter((group) => group.tasks.length > 0) };
}

export async function recordTaskDueReminderNotifications(group: TaskReminderGroup): Promise<void> {
  await db.insert(notifications).values(group.tasks.map((task) => ({
    userId: group.ownerId,
    type: 'task_due',
    title: `Reminder due: ${task.subject}`,
    body: task.dealTitle ? `Prospect: ${task.dealTitle}` : 'A follow-up reminder is due.',
    entityType: 'activity',
    entityId: task.id,
    metadata: {
      taskDueDate: task.dueDate,
      dealId: task.dealId,
      dealTitle: task.dealTitle,
      taskPriority: task.priority,
      batched: true,
    },
  })));
}
