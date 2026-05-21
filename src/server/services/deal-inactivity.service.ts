import { db } from '@/server/db';
import { activities, companies, contacts, dealContacts, deals, notifications, pipelineStages, pipelines, users } from '@/server/db/schema';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { getAutomationSettings } from './automation-settings.service';

const REMINDER_TYPE = 'deal_inactivity_email';
export const REMINDER_CC_RECIPIENTS = ['runal@seccomply.net', 'shivani@seccomply.net'];

export type DealInactivityReminderGroup = {
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
};

function isTargetPipeline(name: string | null | undefined, configuredPipelines: string[]): boolean {
  const normalized = String(name ?? '').toLowerCase();
  return configuredPipelines.some((keyword) => normalized.includes(keyword));
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

    // Activities logged from a contact page often carry only contact_id.
    // Count any activity on any contact at the same company as a touchpoint
    // for the prospect, even if that contact is not explicitly linked to it.
    activityConditions.push(sql`EXISTS (
      SELECT 1
      FROM ${contacts}
      WHERE ${contacts.id} = ${activities.contactId}
        AND ${contacts.companyId} = ${args.companyId}
        AND ${contacts.deletedAt} IS NULL
    )`);
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

  const latestActivityAt = row?.occurredAt ?? null;

  if (!args.companyId) return latestActivityAt;

  const [companyTouchpoint] = await db
    .select({ lastContactedAt: companies.lastContactedAt })
    .from(companies)
    .where(eq(companies.id, args.companyId))
    .limit(1);

  const companyLastContactedAt = companyTouchpoint?.lastContactedAt ?? null;
  if (!latestActivityAt) return companyLastContactedAt;
  if (!companyLastContactedAt) return latestActivityAt;

  return latestActivityAt > companyLastContactedAt ? latestActivityAt : companyLastContactedAt;
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

export async function collectDealInactivityReminderGroups(now = new Date()): Promise<{ checked: number; groups: DealInactivityReminderGroup[] }> {
  const settings = await getAutomationSettings();
  if (!settings.leadInactivityEnabled) {
    return { checked: 0, groups: [] };
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

  const remindersByOwner = new Map<string, DealInactivityReminderGroup>();

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

  return { checked: candidates.length, groups: Array.from(remindersByOwner.values()).filter((group) => group.deals.length > 0) };
}

export async function recordDealInactivityReminderNotifications(group: DealInactivityReminderGroup): Promise<void> {
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
}
