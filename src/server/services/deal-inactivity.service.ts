import { db } from '@/server/db';
import { activities, dealContacts, deals, notifications, pipelineStages, pipelines, users } from '@/server/db/schema';
import { and, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
import { sendEmail } from '@/server/lib/mailer';
import { getAutomationSettings } from './automation-settings.service';

const REMINDER_TYPE = 'deal_inactivity_email';

function isTargetPipeline(name: string | null | undefined, configuredPipelines: string[]): boolean {
  const normalized = String(name ?? '').toLowerCase();
  return configuredPipelines.some((keyword) => normalized.includes(keyword));
}

function buildReminderEmail(args: {
  ownerFirstName?: string | null;
  dealTitle: string;
  pipelineName?: string | null;
  stageName?: string | null;
  lastTouchedAt: Date;
}) {
  const ownerName = args.ownerFirstName?.trim() || 'there';
  const pipelineLine = args.pipelineName ? `Pipeline: ${args.pipelineName}` : null;
  const stageLine = args.stageName ? `Current stage: ${args.stageName}` : null;
  const subject = `Follow-up reminder: ${args.dealTitle} has been inactive for 3 days`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;">
      <p>Hi ${ownerName},</p>
      <p>
        The lead <strong>${escapeHtml(args.dealTitle)}</strong> has not had any logged activity in the last 3 days.
      </p>
      <ul>
        ${pipelineLine ? `<li>${escapeHtml(pipelineLine)}</li>` : ''}
        ${stageLine ? `<li>${escapeHtml(stageLine)}</li>` : ''}
        <li>Last touchpoint: ${escapeHtml(args.lastTouchedAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }))}</li>
      </ul>
      <p>Please log a follow-up activity if this lead is still active.</p>
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

async function getLatestActivityAt(args: {
  dealId: string;
  companyId?: string | null;
  primaryContactId?: string | null;
  linkedContactIds: string[];
}): Promise<Date | null> {
  const contactIds = Array.from(
    new Set(
      [args.primaryContactId, ...args.linkedContactIds]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    )
  );

  const activityConditions = [eq(activities.dealId, args.dealId)];

  if (args.companyId) {
    activityConditions.push(eq(activities.companyId, args.companyId));
  }

  if (contactIds.length > 0) {
    activityConditions.push(inArray(activities.contactId, contactIds));
  }

  const [row] = await db
    .select({ occurredAt: activities.occurredAt })
    .from(activities)
    .where(and(
      isNull(activities.deletedAt),
      or(...activityConditions),
    ))
    .orderBy(desc(activities.occurredAt))
    .limit(1);

  return row?.occurredAt ?? null;
}

async function hasRecentReminder(args: {
  userId: string;
  dealId: string;
  since: Date;
}): Promise<boolean> {
  const [row] = await db
    .select({ createdAt: notifications.createdAt })
    .from(notifications)
    .where(and(
      eq(notifications.userId, args.userId),
      eq(notifications.entityType, 'deal'),
      eq(notifications.entityId, args.dealId),
      eq(notifications.type, REMINDER_TYPE),
    ))
    .orderBy(desc(notifications.createdAt))
    .limit(1);

  return Boolean(row?.createdAt && row.createdAt >= args.since);
}

export async function sendDealInactivityReminders(now = new Date()): Promise<{ checked: number; sent: number }> {
  const settings = await getAutomationSettings();
  if (!settings.leadInactivityEnabled) {
    return { checked: 0, sent: 0 };
  }

  const inactivityWindowMs = settings.leadInactivityDays * 24 * 60 * 60 * 1000;
  const reminderCooldownMs = settings.leadInactivityCooldownHours * 60 * 60 * 1000;

  const openDeals = await db
    .select({
      id: deals.id,
      title: deals.title,
      createdAt: deals.createdAt,
      stageEnteredAt: deals.stageEnteredAt,
      pipelineName: pipelines.name,
      stageName: pipelineStages.name,
      status: deals.status,
      ownerId: deals.ownerId,
      ownerEmail: users.email,
      ownerFirstName: users.firstName,
      companyId: deals.companyId,
      primaryContactId: deals.primaryContactId,
    })
    .from(deals)
    .innerJoin(pipelines, eq(deals.pipelineId, pipelines.id))
    .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .leftJoin(users, eq(deals.ownerId, users.id))
    .where(and(
      isNull(deals.deletedAt),
      eq(deals.status, 'open'),
    ));

  const candidates = openDeals.filter((deal) =>
    isTargetPipeline(deal.pipelineName, settings.leadInactivityPipelines) &&
    Boolean(deal.ownerId) &&
    Boolean(deal.ownerEmail)
  );

  let sent = 0;

  for (const deal of candidates) {
    const linkedContacts = await db
      .select({ contactId: dealContacts.contactId })
      .from(dealContacts)
      .where(eq(dealContacts.dealId, deal.id));

    const linkedContactIds = linkedContacts.map((row) => row.contactId);
    const hasAnyContact = Boolean(deal.primaryContactId) || linkedContactIds.length > 0;
    if (!hasAnyContact) continue;

    const latestActivityAt = await getLatestActivityAt({
      dealId: deal.id,
      companyId: deal.companyId,
      primaryContactId: deal.primaryContactId,
      linkedContactIds,
    });

    const lastTouchedAt = latestActivityAt ?? deal.stageEnteredAt ?? deal.createdAt;
    if (now.getTime() - lastTouchedAt.getTime() < inactivityWindowMs) continue;

    const reminderCooldownSince = new Date(Math.max(
      lastTouchedAt.getTime(),
      now.getTime() - reminderCooldownMs,
    ));

    if (await hasRecentReminder({
      userId: deal.ownerId!,
      dealId: deal.id,
      since: reminderCooldownSince,
    })) {
      continue;
    }

    const { subject, html } = buildReminderEmail({
      ownerFirstName: deal.ownerFirstName,
      dealTitle: deal.title,
      pipelineName: deal.pipelineName,
      stageName: deal.stageName,
      lastTouchedAt,
    });

    try {
      await sendEmail(deal.ownerEmail!, subject, html);
      sent += 1;

      await db.insert(notifications).values({
        userId: deal.ownerId!,
        type: REMINDER_TYPE,
        title: `Follow up on ${deal.title}`,
        body: `No activity has been logged on this lead for 3 days.`,
        entityType: 'deal',
        entityId: deal.id,
        metadata: {
          pipelineName: deal.pipelineName,
          stageName: deal.stageName,
          lastTouchedAt: lastTouchedAt.toISOString(),
        },
      });
    } catch (error) {
      console.error(`[DealInactivity] Failed to send reminder for deal ${deal.id}:`, error);
    }
  }

  return { checked: candidates.length, sent };
}
