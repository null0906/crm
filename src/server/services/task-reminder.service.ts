import { db } from '@/server/db';
import { activities, companies, contacts, deals, notifications, users } from '@/server/db/schema';
import { and, desc, eq, isNull, lte } from 'drizzle-orm';
import { sendEmail } from '@/server/lib/mailer';

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

function buildTaskReminderEmail(args: {
  ownerFirstName?: string | null;
  tasks: TaskReminderGroup['tasks'];
}) {
  const ownerName = args.ownerFirstName?.trim() || 'there';
  const subject = `Reminder digest: ${args.tasks.length} due ${args.tasks.length === 1 ? 'reminder' : 'reminders'}`;
  const rows = args.tasks.map((task) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;">${escapeHtml(task.subject)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(task.dealTitle ?? '-')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(task.companyName ?? '-')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(task.contactName ?? '-')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(task.dueDate)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(task.priority ?? '-')}</td>
    </tr>
  `).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;">
      <p>Hi ${ownerName},</p>
      <p>You have ${args.tasks.length} due or overdue CRM ${args.tasks.length === 1 ? 'reminder' : 'reminders'}.</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:13px;">
        <thead>
          <tr style="background:#f8fafc;color:#475569;text-align:left;">
            <th style="padding:9px 12px;border-bottom:1px solid #e2e8f0;">Reminder</th>
            <th style="padding:9px 12px;border-bottom:1px solid #e2e8f0;">Prospect</th>
            <th style="padding:9px 12px;border-bottom:1px solid #e2e8f0;">Company</th>
            <th style="padding:9px 12px;border-bottom:1px solid #e2e8f0;">Contact</th>
            <th style="padding:9px 12px;border-bottom:1px solid #e2e8f0;">Due</th>
            <th style="padding:9px 12px;border-bottom:1px solid #e2e8f0;">Priority</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#64748b;font-size:12px;">This is an automated reminder from SecComply CRM.</p>
    </div>
  `;

  return { subject, html };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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

export async function sendTaskDueReminders(now = new Date()): Promise<{ checked: number; sent: number }> {
  const { checked, groups } = await collectTaskDueReminderGroups(now);
  let sent = 0;

  for (const group of groups) {
    const email = buildTaskReminderEmail({
      ownerFirstName: group.ownerFirstName,
      tasks: group.tasks,
    });

    try {
      await sendEmail(group.ownerEmail, email.subject, email.html);
      sent += 1;
      await recordTaskDueReminderNotifications(group);
    } catch (error) {
      console.error(`[TaskReminder] Failed to send reminder digest for user ${group.ownerId}:`, error);
    }
  }

  return { checked, sent };
}
