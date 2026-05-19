import { db } from '@/server/db';
import { activities, dealContacts, deals, notifications, pipelineStages, pipelines, users } from '@/server/db/schema';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { sendEmail } from '@/server/lib/mailer';
import { getAutomationSettings } from './automation-settings.service';

const REMINDER_TYPE = 'deal_inactivity_email';

function isTargetPipeline(name: string | null | undefined, configuredPipelines: string[]): boolean {
  const normalized = String(name ?? '').toLowerCase();
  return configuredPipelines.some((keyword) => normalized.includes(keyword));
}

function buildReminderEmail(args: {
  ownerFirstName?: string | null;
  deals: Array<{
    title: string;
    pipelineName?: string | null;
    stageName?: string | null;
    lastTouchedAt: Date;
    daysInactive: number;
    daysInStage: number;
  }>;
}) {
  const ownerName = args.ownerFirstName?.trim() || 'there';
  const subject = `Follow-up reminders: ${args.deals.length} inactive ${args.deals.length === 1 ? 'prospect' : 'prospects'}`;
  const rows = args.deals.map((deal) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;">${escapeHtml(deal.title)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(deal.pipelineName ?? 'Pipeline')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(deal.stageName ?? 'Stage')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${deal.daysInStage}d</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${deal.daysInactive}d</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(deal.lastTouchedAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }))}</td>
    </tr>
  `).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;">
      <p>Hi ${ownerName},</p>
      <p>
        These open prospects have not had any logged activity within the configured follow-up window.
      </p>
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
        <tbody>${rows}</tbody>
      </table>
      <p>Please log follow-up activities for any prospects that are still active.</p>
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

function getWholeDaysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
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
      stageType: pipelineStages.stageType,
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
      eq(pipelineStages.stageType, 'active'),
    ));

  const candidates = openDeals.filter((deal) =>
    isTargetPipeline(deal.pipelineName, settings.leadInactivityPipelines) &&
    Boolean(deal.ownerId) &&
    Boolean(deal.ownerEmail)
  );

  const remindersByOwner = new Map<string, {
    ownerId: string;
    ownerEmail: string;
    ownerFirstName?: string | null;
    deals: Array<{
      id: string;
      title: string;
      pipelineName?: string | null;
      stageName?: string | null;
      lastTouchedAt: Date;
      daysInactive: number;
      daysInStage: number;
    }>;
  }>();

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

    const ownerKey = deal.ownerId!;
    const existingOwner = remindersByOwner.get(ownerKey);
    const group = existingOwner ?? {
      ownerId: deal.ownerId!,
      ownerEmail: deal.ownerEmail!,
      ownerFirstName: deal.ownerFirstName,
      deals: [],
    };

    group.deals.push({
      id: deal.id,
      title: deal.title,
      pipelineName: deal.pipelineName,
      stageName: deal.stageName,
      lastTouchedAt,
      daysInactive: getWholeDaysBetween(lastTouchedAt, now),
      daysInStage: getWholeDaysBetween(deal.stageEnteredAt ?? deal.createdAt, now),
    });
    remindersByOwner.set(ownerKey, group);
  }

  let sent = 0;

  for (const group of remindersByOwner.values()) {
    const { subject, html } = buildReminderEmail({
      ownerFirstName: group.ownerFirstName,
      deals: group.deals,
    });

    try {
      await sendEmail(group.ownerEmail, subject, html);
      sent += 1;

      await db.insert(notifications).values(group.deals.map((deal) => ({
        userId: group.ownerId,
        type: REMINDER_TYPE,
        title: `Follow up on ${deal.title}`,
        body: `No activity has been logged on this prospect for ${deal.daysInactive} days.`,
        entityType: 'deal',
        entityId: deal.id,
        metadata: {
          pipelineName: deal.pipelineName,
          stageName: deal.stageName,
          lastTouchedAt: deal.lastTouchedAt.toISOString(),
          daysInactive: deal.daysInactive,
          daysInStage: deal.daysInStage,
          batched: true,
        },
      })));
    } catch (error) {
      console.error(`[DealInactivity] Failed to send reminder digest for user ${group.ownerId}:`, error);
    }
  }

  return { checked: candidates.length, sent };
}
