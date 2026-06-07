import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import {
  activities, companies, contacts, deals, onboardingStageHistory, onboardings,
  pipelineStages, pipelines, projectMembers, projects, roles, users,
} from '@/server/db/schema';
import { createNotification } from './notification.service';
import { createOrSyncProjectFromDeal } from './project-sync.service';
import eventBus from '@/server/lib/event-bus';
import type { NewOnboarding } from '@/server/db/schema';
import type { OnboardingStage } from '@/lib/types';

export async function createOnboardingFromDeal(dealId: string, triggeredBy: string) {
  const [existing] = await db.select().from(onboardings).where(eq(onboardings.dealId, dealId)).limit(1);
  if (existing) return existing;
  const [deal] = await db.select().from(deals).where(and(eq(deals.id, dealId), isNull(deals.deletedAt))).limit(1);
  if (!deal) return null;
  const [onboarding] = await db.insert(onboardings).values({
    dealId, companyId: deal.companyId, primaryContactId: deal.primaryContactId,
    ownerId: deal.ownerId, createdBy: triggeredBy,
    engagementAmount: deal.amount, engagementCurrency: deal.currency ?? 'INR',
  }).returning();
  if (!onboarding) return null;
  await db.insert(onboardingStageHistory).values({
    onboardingId: onboarding.id, toStage: 'documents_pending', movedBy: triggeredBy,
    notes: `Onboarding auto-created when prospect "${deal.title}" was marked Won`,
  });
  await db.insert(activities).values({
    activityType: 'note', subject: `Onboarding started for "${deal.title}"`,
    dealId, companyId: deal.companyId, contactId: deal.primaryContactId,
    performedBy: triggeredBy, isAutomated: true,
    metadata: { onboardingId: onboarding.id, trigger: 'closed_won' },
  });
  const admins = await db.select({ id: users.id }).from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(and(eq(roles.slug, 'super_admin'), eq(users.status, 'active')));
  await Promise.all(admins.map((admin) => createNotification({
    userId: admin.id, type: 'onboarding_ready', title: 'New onboarding ready',
    body: `"${deal.title}" closed won - start onboarding`, entityType: 'deal', entityId: dealId,
    metadata: { onboardingId: onboarding.id },
  })));
  return onboarding;
}

export async function listOnboardings() {
  return db.select({
    id: onboardings.id, dealId: onboardings.dealId, stage: onboardings.stage,
    stageEnteredAt: onboardings.stageEnteredAt, status: onboardings.status,
    engagementAmount: onboardings.engagementAmount, engagementCurrency: onboardings.engagementCurrency,
    ownerId: onboardings.ownerId, createdAt: onboardings.createdAt,
    dealTitle: deals.title, salesEstimate: deals.amount, companyName: companies.name,
    contactFirstName: contacts.firstName, contactLastName: contacts.lastName,
    ownerFirstName: users.firstName, ownerLastName: users.lastName,
  }).from(onboardings)
    .innerJoin(deals, eq(onboardings.dealId, deals.id))
    .leftJoin(companies, eq(onboardings.companyId, companies.id))
    .leftJoin(contacts, eq(onboardings.primaryContactId, contacts.id))
    .leftJoin(users, eq(onboardings.ownerId, users.id))
    .orderBy(asc(onboardings.stageEnteredAt));
}

export async function getOnboarding(id: string) {
  const [row] = await db.select({
    onboarding: onboardings, dealTitle: deals.title, salesEstimate: deals.amount,
    companyName: companies.name, contactFirstName: contacts.firstName, contactLastName: contacts.lastName,
  }).from(onboardings).innerJoin(deals, eq(onboardings.dealId, deals.id))
    .leftJoin(companies, eq(onboardings.companyId, companies.id))
    .leftJoin(contacts, eq(onboardings.primaryContactId, contacts.id))
    .where(eq(onboardings.id, id)).limit(1);
  if (!row) return null;
  const history = await db.select().from(onboardingStageHistory)
    .where(eq(onboardingStageHistory.onboardingId, id)).orderBy(desc(onboardingStageHistory.enteredAt));
  return { ...row.onboarding, dealTitle: row.dealTitle, salesEstimate: row.salesEstimate, companyName: row.companyName, contactFirstName: row.contactFirstName, contactLastName: row.contactLastName, history };
}

export async function updateOnboarding(id: string, data: Partial<NewOnboarding>, userId: string) {
  const [existing] = await db.select().from(onboardings).where(eq(onboardings.id, id)).limit(1);
  if (!existing) throw new Error('Onboarding not found');
  const payload = { ...data, updatedAt: new Date() };
  const [updated] = await db.update(onboardings).set(payload).where(eq(onboardings.id, id)).returning();
  if (data.engagementAmount !== undefined && String(data.engagementAmount ?? '') !== String(existing.engagementAmount ?? '')) {
    await db.insert(activities).values({
      activityType: 'note',
      subject: `Engagement amount updated: ${existing.engagementAmount ?? 'Not set'} -> ${data.engagementAmount ?? 'Not set'}`,
      dealId: existing.dealId, companyId: existing.companyId, performedBy: userId, isAutomated: false,
      metadata: { onboardingId: id, field: 'engagement_amount', oldValue: existing.engagementAmount, newValue: data.engagementAmount, varianceReason: data.amountVarianceReason },
    });
  }
  return updated!;
}

export async function moveOnboardingStage(id: string, stage: OnboardingStage, userId: string, notes?: string) {
  const [existing] = await db.select().from(onboardings).where(eq(onboardings.id, id)).limit(1);
  if (!existing) throw new Error('Onboarding not found');
  if (existing.stage === stage) return existing;
  await db.update(onboardingStageHistory).set({ exitedAt: new Date() })
    .where(and(eq(onboardingStageHistory.onboardingId, id), isNull(onboardingStageHistory.exitedAt)));
  await db.insert(onboardingStageHistory).values({ onboardingId: id, fromStage: existing.stage, toStage: stage, movedBy: userId, notes });
  const status = stage === 'completed' ? 'completed' : stage === 'cancelled' ? 'cancelled' : 'active';
  const [updated] = await db.update(onboardings).set({
    stage, status, stageEnteredAt: new Date(), completedAt: stage === 'completed' ? new Date() : null, updatedAt: new Date(),
  }).where(eq(onboardings.id, id)).returning();

  if (stage === 'completed') {
    const [activePipeline] = await db.select().from(pipelines).where(eq(pipelines.pipelineType, 'active_delivery')).limit(1);
    if (!activePipeline) throw new Error('Active Pipeline not found');
    const [firstStage] = await db.select().from(pipelineStages).where(eq(pipelineStages.pipelineId, activePipeline.id)).orderBy(asc(pipelineStages.position)).limit(1);
    if (!firstStage) throw new Error('Active Pipeline has no stages');
    const [deal] = await db.select({ stageId: deals.stageId }).from(deals).where(eq(deals.id, existing.dealId)).limit(1);
    await db.update(deals).set({ pipelineId: activePipeline.id, stageId: firstStage.id, stageEnteredAt: new Date(), status: 'open', updatedAt: new Date() }).where(eq(deals.id, existing.dealId));
    eventBus.emit('deal.stage_changed', { dealId: existing.dealId, fromStageId: deal?.stageId ?? null, toStageId: firstStage.id, movedBy: userId });
    const projectId = await createOrSyncProjectFromDeal(existing.dealId, userId);
    if (projectId) {
      await db.update(onboardings).set({ convertedToProjectId: projectId }).where(eq(onboardings.id, id));
      if (existing.deliveryTeamAssigned?.length) {
        await db.insert(projectMembers).values(existing.deliveryTeamAssigned.map((memberId) => ({ projectId, userId: memberId, role: 'member' as const }))).onConflictDoNothing();
      }
    }
  }
  return updated!;
}
