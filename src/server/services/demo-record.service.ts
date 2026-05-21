import { db } from '@/server/db';
import { activities, companies, contacts, deals, demoRecords, users } from '@/server/db/schema';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import type { SessionUser } from '@/lib/types';
import type { DemoCallType, DemoOutcome } from '@/server/db/schema/demo-records';

export async function listDemoRecords(filters: {
  contactId?: string;
  contactCompanyId?: string;
  dealId?: string;
  dealCompanyId?: string;
  companyId?: string;
}) {
  const conditions = [];

  if (filters.contactId && filters.contactCompanyId) {
    conditions.push(
      or(
        eq(demoRecords.contactId, filters.contactId),
        eq(demoRecords.companyId, filters.contactCompanyId),
      )!,
    );
  } else if (filters.contactId) {
    conditions.push(eq(demoRecords.contactId, filters.contactId));
  }

  if (filters.dealId && filters.dealCompanyId) {
    conditions.push(
      or(
        eq(demoRecords.dealId, filters.dealId),
        eq(demoRecords.companyId, filters.dealCompanyId),
      )!,
    );
  } else if (filters.dealId) {
    conditions.push(eq(demoRecords.dealId, filters.dealId));
  }

  if (filters.companyId) {
    conditions.push(
      or(
        eq(demoRecords.companyId, filters.companyId),
        eq(contacts.companyId, filters.companyId),
      )!,
    );
  }

  return db
    .select({
      id: demoRecords.id,
      contactId: demoRecords.contactId,
      dealId: demoRecords.dealId,
      companyId: demoRecords.companyId,
      activityId: demoRecords.activityId,
      callType: demoRecords.callType,
      scheduledAt: demoRecords.scheduledAt,
      durationMinutes: demoRecords.durationMinutes,
      outcome: demoRecords.outcome,
      attendees: demoRecords.attendees,
      clientRequirements: demoRecords.clientRequirements,
      painPoints: demoRecords.painPoints,
      objections: demoRecords.objections,
      nextAction: demoRecords.nextAction,
      nextActionDate: demoRecords.nextActionDate,
      demoNotes: demoRecords.demoNotes,
      conductedBy: demoRecords.conductedBy,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      companyName: companies.name,
      dealTitle: deals.title,
      conductedByFirstName: users.firstName,
      conductedByLastName: users.lastName,
      createdAt: demoRecords.createdAt,
      updatedAt: demoRecords.updatedAt,
    })
    .from(demoRecords)
    .leftJoin(contacts, eq(demoRecords.contactId, contacts.id))
    .leftJoin(companies, eq(demoRecords.companyId, companies.id))
    .leftJoin(deals, eq(demoRecords.dealId, deals.id))
    .leftJoin(users, eq(demoRecords.conductedBy, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(demoRecords.scheduledAt), desc(demoRecords.createdAt));
}

export async function createDemoRecord(
  user: SessionUser,
  data: {
    contactId?: string | null;
    dealId?: string | null;
    companyId?: string | null;
    callType: DemoCallType;
    scheduledAt?: string | null;
    durationMinutes?: number | null;
    outcome?: DemoOutcome | null;
    attendees?: string | null;
    clientRequirements?: string | null;
    painPoints?: string | null;
    objections?: string | null;
    nextAction?: string | null;
    nextActionDate?: string | null;
    demoNotes?: string | null;
    conductedBy?: string | null;
  }
) {
  const conductedBy = data.conductedBy ?? user.id;

  const [activity] = await db
    .insert(activities)
    .values({
      activityType: data.callType === 'discovery' || data.callType === 'demo' ? 'demo' : 'meeting',
      subject: `${data.callType.replace(/_/g, ' ')} logged`,
      body: data.demoNotes ?? data.clientRequirements ?? null,
      contactId: data.contactId ?? null,
      companyId: data.companyId ?? null,
      dealId: data.dealId ?? null,
      performedBy: conductedBy,
      occurredAt: data.scheduledAt ? new Date(data.scheduledAt) : new Date(),
      isAutomated: false,
      metadata: {
        outcome: data.outcome,
        nextAction: data.nextAction,
        nextActionDate: data.nextActionDate,
      },
    })
    .returning();

  const [record] = await db
    .insert(demoRecords)
    .values({
      ...data,
      conductedBy,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      activityId: activity?.id ?? null,
    })
    .returning();

  if (data.contactId) {
    await db
      .update(contacts)
      .set({
        lastContactedAt: new Date(),
        ...(data.outcome === 'interested' ? { leadScore: sql`${contacts.leadScore} + 15` } : {}),
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, data.contactId));
  }

  if (data.nextAction && data.nextActionDate) {
    await db.insert(activities).values({
      activityType: 'task',
      subject: data.nextAction,
      contactId: data.contactId ?? null,
      companyId: data.companyId ?? null,
      dealId: data.dealId ?? null,
      performedBy: conductedBy,
      taskDueDate: data.nextActionDate,
      taskPriority: 'high',
      isAutomated: false,
      occurredAt: new Date(),
      metadata: { demoRecordId: record?.id },
    });
  }

  return record;
}

export async function updateDemoRecord(id: string, data: Partial<Parameters<typeof createDemoRecord>[1]>) {
  const { scheduledAt, conductedBy, ...rest } = data;
  const [record] = await db
    .update(demoRecords)
    .set({
      ...rest,
      ...(conductedBy ? { conductedBy } : {}),
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      updatedAt: new Date(),
    })
    .where(eq(demoRecords.id, id))
    .returning();

  return record;
}

export async function deleteDemoRecord(id: string) {
  await db.delete(demoRecords).where(eq(demoRecords.id, id));
}

// Returns activities of type 'demo' that have no linked demo_record yet
export async function previewDemoBackfill() {
  return db
    .select({
      id: activities.id,
      subject: activities.subject,
      body: activities.body,
      occurredAt: activities.occurredAt,
      contactId: activities.contactId,
      companyId: activities.companyId,
      dealId: activities.dealId,
      performedBy: activities.performedBy,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      companyName: companies.name,
      dealTitle: deals.title,
      performerFirstName: users.firstName,
      performerLastName: users.lastName,
    })
    .from(activities)
    .leftJoin(demoRecords, eq(activities.id, demoRecords.activityId))
    .leftJoin(contacts, eq(activities.contactId, contacts.id))
    .leftJoin(companies, eq(activities.companyId, companies.id))
    .leftJoin(deals, eq(activities.dealId, deals.id))
    .leftJoin(users, eq(activities.performedBy, users.id))
    .where(
      and(
        eq(activities.activityType, 'demo'),
        isNull(activities.deletedAt),
        isNull(demoRecords.id),
      ),
    )
    .orderBy(desc(activities.occurredAt));
}

export async function runDemoBackfill(conductedById: string) {
  const toMigrate = await previewDemoBackfill();
  if (toMigrate.length === 0) return { migrated: 0 };

  for (const activity of toMigrate) {
    await db.insert(demoRecords).values({
      activityId: activity.id,
      contactId: activity.contactId,
      companyId: activity.companyId,
      dealId: activity.dealId,
      callType: 'demo',
      scheduledAt: activity.occurredAt,
      demoNotes: activity.body,
      conductedBy: activity.performedBy ?? conductedById,
    });
  }

  return { migrated: toMigrate.length };
}
