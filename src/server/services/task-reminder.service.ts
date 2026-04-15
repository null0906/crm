import { db } from '@/server/db';
import { activities, companies, contacts, deals, notifications, users } from '@/server/db/schema';
import { and, desc, eq, isNull, lte } from 'drizzle-orm';
import { sendEmail } from '@/server/lib/mailer';

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
  subject: string;
  dueDate: string;
  dealTitle?: string | null;
  companyName?: string | null;
  contactName?: string | null;
  notes?: string | null;
}) {
  const ownerName = args.ownerFirstName?.trim() || 'there';
  const subject = `Reminder due today: ${args.subject}`;
  const contextLines = [
    args.dealTitle ? `<li>Deal: ${escapeHtml(args.dealTitle)}</li>` : '',
    args.companyName ? `<li>Company: ${escapeHtml(args.companyName)}</li>` : '',
    args.contactName ? `<li>Contact: ${escapeHtml(args.contactName)}</li>` : '',
    `<li>Due date: ${escapeHtml(args.dueDate)}</li>`,
  ].filter(Boolean).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;">
      <p>Hi ${ownerName},</p>
      <p>Your deal reminder is due:</p>
      <p><strong>${escapeHtml(args.subject)}</strong></p>
      <ul>${contextLines}</ul>
      ${args.notes ? `<p><strong>Notes:</strong><br/>${escapeHtml(args.notes).replaceAll('\n', '<br/>')}</p>` : ''}
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

export async function sendTaskDueReminders(now = new Date()): Promise<{ checked: number; sent: number }> {
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

  let sent = 0;

  for (const task of dueTasks) {
    if (!task.performedById || !task.ownerEmail || !task.taskDueDate) continue;
    if (await hasRecentTaskDueNotification(task.performedById, task.id, cooldownSince)) continue;

    const contactName = [task.contactFirstName, task.contactLastName].filter(Boolean).join(' ').trim() || null;
    const email = buildTaskReminderEmail({
      ownerFirstName: task.ownerFirstName,
      subject: task.subject ?? 'Untitled reminder',
      dueDate: task.taskDueDate,
      dealTitle: task.dealTitle,
      companyName: task.companyName,
      contactName,
      notes: task.body,
    });

    try {
      await sendEmail(task.ownerEmail, email.subject, email.html);
      sent += 1;

      await db.insert(notifications).values({
        userId: task.performedById,
        type: 'task_due',
        title: `Reminder due: ${task.subject ?? 'Untitled reminder'}`,
        body: task.dealTitle ? `Deal: ${task.dealTitle}` : 'A follow-up reminder is due.',
        entityType: 'activity',
        entityId: task.id,
        metadata: {
          taskDueDate: task.taskDueDate,
          dealId: task.dealId,
          dealTitle: task.dealTitle,
          taskPriority: task.taskPriority,
        },
      });
    } catch (error) {
      console.error(`[TaskReminder] Failed to send reminder for activity ${task.id}:`, error);
    }
  }

  return { checked: dueTasks.length, sent };
}
