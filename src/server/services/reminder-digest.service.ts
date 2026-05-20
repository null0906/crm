import { sendEmail } from '@/server/lib/mailer';
import {
  collectDealInactivityReminderGroups,
  recordDealInactivityReminderNotifications,
  REMINDER_CC_RECIPIENTS,
  type DealInactivityReminderGroup,
} from './deal-inactivity.service';
import {
  collectTaskDueReminderGroups,
  recordTaskDueReminderNotifications,
  type TaskReminderGroup,
} from './task-reminder.service';

type ConsolidatedReminderGroup = {
  ownerId: string;
  ownerEmail: string;
  ownerFirstName?: string | null;
  tasks: TaskReminderGroup['tasks'];
  inactiveDeals: DealInactivityReminderGroup['deals'];
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function mergeReminderGroups(args: {
  taskGroups: TaskReminderGroup[];
  inactivityGroups: DealInactivityReminderGroup[];
}): ConsolidatedReminderGroup[] {
  const byOwner = new Map<string, ConsolidatedReminderGroup>();

  for (const group of args.taskGroups) {
    const existing = byOwner.get(group.ownerId) ?? {
      ownerId: group.ownerId,
      ownerEmail: group.ownerEmail,
      ownerFirstName: group.ownerFirstName,
      tasks: [],
      inactiveDeals: [],
    };
    existing.tasks.push(...group.tasks);
    byOwner.set(group.ownerId, existing);
  }

  for (const group of args.inactivityGroups) {
    const existing = byOwner.get(group.ownerId) ?? {
      ownerId: group.ownerId,
      ownerEmail: group.ownerEmail,
      ownerFirstName: group.ownerFirstName,
      tasks: [],
      inactiveDeals: [],
    };
    existing.inactiveDeals.push(...group.deals);
    byOwner.set(group.ownerId, existing);
  }

  return Array.from(byOwner.values()).filter(
    (group) => group.tasks.length > 0 || group.inactiveDeals.length > 0
  );
}

function buildConsolidatedReminderEmail(group: ConsolidatedReminderGroup) {
  const ownerName = group.ownerFirstName?.trim() || 'there';
  const taskCount = group.tasks.length;
  const inactiveCount = group.inactiveDeals.length;
  const subjectParts = [
    taskCount > 0 ? `${taskCount} due ${taskCount === 1 ? 'reminder' : 'reminders'}` : null,
    inactiveCount > 0 ? `${inactiveCount} inactive ${inactiveCount === 1 ? 'prospect' : 'prospects'}` : null,
  ].filter(Boolean);
  const subject = `CRM reminder digest: ${subjectParts.join(' + ')}`;

  const taskRows = group.tasks.map((task) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;">${escapeHtml(task.subject)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(task.dealTitle ?? '-')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(task.companyName ?? '-')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(task.contactName ?? '-')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(task.dueDate)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(task.priority ?? '-')}</td>
    </tr>
  `).join('');

  const inactiveRows = group.inactiveDeals.map((deal) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;">${escapeHtml(deal.title)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(deal.pipelineName ?? 'Pipeline')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(deal.stageName ?? 'Stage')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${deal.daysInStage}d</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${deal.daysInactive}d</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(deal.lastTouchedAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }))}</td>
    </tr>
  `).join('');

  const taskSection = taskCount > 0 ? `
    <h2 style="margin:22px 0 8px;font-size:16px;color:#0f172a;">Due reminders</h2>
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
      <tbody>${taskRows}</tbody>
    </table>
  ` : '';

  const inactiveSection = inactiveCount > 0 ? `
    <h2 style="margin:22px 0 8px;font-size:16px;color:#0f172a;">Inactive prospects</h2>
    <p style="margin:0 0 10px;color:#475569;">These open prospects have not had logged activity within the configured follow-up window.</p>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:13px;">
      <thead>
        <tr style="background:#f8fafc;color:#475569;text-align:left;">
          <th style="padding:9px 12px;border-bottom:1px solid #e2e8f0;">Prospect</th>
          <th style="padding:9px 12px;border-bottom:1px solid #e2e8f0;">Pipeline</th>
          <th style="padding:9px 12px;border-bottom:1px solid #e2e8f0;">Stage</th>
          <th style="padding:9px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">Stuck</th>
          <th style="padding:9px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">Inactive</th>
          <th style="padding:9px 12px;border-bottom:1px solid #e2e8f0;">Last touchpoint</th>
        </tr>
      </thead>
      <tbody>${inactiveRows}</tbody>
    </table>
  ` : '';

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;">
      <p>Hi ${ownerName},</p>
      <p>Here is your consolidated CRM reminder digest. This email combines your user-set reminders and inactive-prospect follow-ups so you receive one email instead of many.</p>
      ${taskSection}
      ${inactiveSection}
      <p style="color:#64748b;font-size:12px;margin-top:22px;">This is an automated reminder from SecComply CRM.</p>
    </div>
  `;

  return { subject, html };
}

export async function sendConsolidatedReminderDigest(now = new Date()): Promise<{
  checked: number;
  checkedTasks: number;
  checkedInactiveProspects: number;
  sent: number;
}> {
  const [taskResult, inactivityResult] = await Promise.all([
    collectTaskDueReminderGroups(now),
    collectDealInactivityReminderGroups(now),
  ]);

  const groups = mergeReminderGroups({
    taskGroups: taskResult.groups,
    inactivityGroups: inactivityResult.groups,
  });

  let sent = 0;

  for (const group of groups) {
    const { subject, html } = buildConsolidatedReminderEmail(group);
    try {
      await sendEmail(group.ownerEmail, subject, html, { cc: REMINDER_CC_RECIPIENTS });
      sent += 1;

      if (group.tasks.length > 0) {
        await recordTaskDueReminderNotifications({
          ownerId: group.ownerId,
          ownerEmail: group.ownerEmail,
          ownerFirstName: group.ownerFirstName,
          tasks: group.tasks,
        });
      }

      if (group.inactiveDeals.length > 0) {
        await recordDealInactivityReminderNotifications({
          ownerId: group.ownerId,
          ownerEmail: group.ownerEmail,
          ownerFirstName: group.ownerFirstName,
          deals: group.inactiveDeals,
        });
      }
    } catch (error) {
      console.error(`[ReminderDigest] Failed to send consolidated digest for user ${group.ownerId}:`, error);
    }
  }

  return {
    checked: taskResult.checked + inactivityResult.checked,
    checkedTasks: taskResult.checked,
    checkedInactiveProspects: inactivityResult.checked,
    sent,
  };
}
