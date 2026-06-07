import { db } from '@/server/db';
import { deals, dealTags, dealContacts, dealStageHistory, dealTeamMembers, dealTasks, tags, companies, contacts, users, pipelineStages, pipelines, activities, projects } from '@/server/db/schema';
import { eq, and, isNull, or, ilike, sql, lt, desc, asc, inArray, SQL, type SQLWrapper } from 'drizzle-orm';
import type { NewDeal } from '@/server/db/schema';
import type { DealStatus, FilterConfig, PaginatedResult, SessionUser, StageType } from '@/lib/types';
import { writeAuditLog, buildChangeDiff } from './audit.service';
import eventBus from '@/server/lib/event-bus';
import { getPermissionLevel } from '@/server/lib/permissions';
import { buildFilterWhere } from './filter.service';
import {
  createOrSyncProjectFromDeal,
  maybeCreateOrSyncProjectForDealStage,
  syncDealFieldsToProject,
  syncDealTeamToProject,
  syncProgressToProject,
} from './project-sync.service';
import { syncContactActivitiesToDeal } from './activity-sync.service';
import { createOnboardingFromDeal } from './onboarding.service';
import { getProspectVisibilityFilter } from '@/server/lib/visibility-filters';

interface StageContext {
  id: string;
  pipelineId: string;
  stageType: StageType;
}

function canViewDealAmounts(user: SessionUser) {
  return user.role.slug !== 'sales_rep';
}

function maskDealAmountForUser<T extends Record<string, unknown>>(user: SessionUser, row: T): T {
  if (canViewDealAmounts(user)) return row;
  return { ...row, amount: null } as T;
}

function maskDealAmountsForUser<T extends Record<string, unknown>>(user: SessionUser, rows: T[]): T[] {
  return canViewDealAmounts(user) ? rows : rows.map((row) => maskDealAmountForUser(user, row));
}

function sanitizeDealWriteDataForUser<T extends Record<string, unknown>>(user: SessionUser, data: T): T {
  if (canViewDealAmounts(user)) return data;
  const sanitized = { ...data };
  delete sanitized.amount;
  return sanitized as T;
}

function getEffectiveDealStatusSql(stageTypeColumn: SQLWrapper): SQL<DealStatus> {
  return sql<DealStatus>`
    CASE
      WHEN ${deals.status} <> 'open' THEN ${deals.status}
      WHEN ${stageTypeColumn} = 'won' THEN 'won'
      WHEN ${stageTypeColumn} = 'lost' THEN 'lost'
      ELSE 'open'
    END
  `;
}

function deriveStatusFromStageType(stageType: StageType, preferredStatus?: DealStatus | null): DealStatus {
  if (stageType === 'won') return 'won';
  if (stageType === 'lost') return preferredStatus === 'abandoned' ? 'abandoned' : 'lost';
  return 'open';
}

function normalizeDateValue(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString().split('T')[0] ?? null;
  return null;
}

function resolveActualCloseDate(nextStatus: DealStatus, previousStatus?: DealStatus | null, previousActualCloseDate?: unknown): string | null {
  if (nextStatus === 'open') return null;
  const normalizedPreviousCloseDate = normalizeDateValue(previousActualCloseDate);
  if (previousStatus === nextStatus && normalizedPreviousCloseDate) {
    return normalizedPreviousCloseDate;
  }
  return new Date().toISOString().split('T')[0] ?? null;
}

async function getStageContext(stageId: string): Promise<StageContext | null> {
  const [stage] = await db
    .select({
      id: pipelineStages.id,
      pipelineId: pipelineStages.pipelineId,
      stageType: pipelineStages.stageType,
    })
    .from(pipelineStages)
    .where(eq(pipelineStages.id, stageId))
    .limit(1);

  return stage ?? null;
}

async function getFirstStageForType(pipelineId: string, stageType: StageType): Promise<StageContext | null> {
  const [stage] = await db
    .select({
      id: pipelineStages.id,
      pipelineId: pipelineStages.pipelineId,
      stageType: pipelineStages.stageType,
    })
    .from(pipelineStages)
    .where(and(eq(pipelineStages.pipelineId, pipelineId), eq(pipelineStages.stageType, stageType)))
    .orderBy(asc(pipelineStages.position))
    .limit(1);

  return stage ?? null;
}

async function resolveStageAndStatus(params: {
  pipelineId: string;
  stageId?: string | null;
  status?: DealStatus | null;
  fallbackStageId?: string | null;
  fallbackStatus?: DealStatus | null;
}): Promise<{ stageId: string; stageType: StageType; status: DealStatus }> {
  const preferredStatus = params.status ?? params.fallbackStatus ?? 'open';

  if (params.stageId) {
    const stage = await getStageContext(params.stageId);
    if (!stage) throw new Error('Selected stage was not found');
    return {
      stageId: stage.id,
      stageType: stage.stageType,
      status: deriveStatusFromStageType(stage.stageType, preferredStatus),
    };
  }

  const currentStage = params.fallbackStageId ? await getStageContext(params.fallbackStageId) : null;
  const targetStageType: StageType =
    preferredStatus === 'won' ? 'won' :
    preferredStatus === 'open' ? 'active' :
    'lost';

  if (currentStage && currentStage.pipelineId === params.pipelineId && currentStage.stageType === targetStageType) {
    return {
      stageId: currentStage.id,
      stageType: currentStage.stageType,
      status: deriveStatusFromStageType(currentStage.stageType, preferredStatus),
    };
  }

  const targetStage = await getFirstStageForType(params.pipelineId, targetStageType);
  if (targetStage) {
    return {
      stageId: targetStage.id,
      stageType: targetStage.stageType,
      status: deriveStatusFromStageType(targetStage.stageType, preferredStatus),
    };
  }

  if (currentStage) {
    return {
      stageId: currentStage.id,
      stageType: currentStage.stageType,
      status: deriveStatusFromStageType(currentStage.stageType, preferredStatus),
    };
  }

  throw new Error('Unable to resolve a valid stage for this prospect');
}

async function promoteCompanyToPartnerIfEligible(
  companyId: string | null | undefined,
  pipelineId: string,
  stageId: string
) {
  if (!companyId) return;

  const [stageContext] = await db
    .select({
      pipelineName: pipelines.name,
      stageName: pipelineStages.name,
      stageSlug: pipelineStages.slug,
    })
    .from(pipelineStages)
    .innerJoin(pipelines, eq(pipelineStages.pipelineId, pipelines.id))
    .where(and(
      eq(pipelineStages.id, stageId),
      eq(pipelines.id, pipelineId),
    ))
    .limit(1);

  if (!stageContext) return;

  const isPartnerPipeline = stageContext.pipelineName.toLowerCase().includes('partner');
  const isActivePartnerStage =
    stageContext.stageSlug === 'active_partner' ||
    stageContext.stageName.toLowerCase() === 'active partner';

  if (!isPartnerPipeline || !isActivePartnerStage) return;

  await db
    .update(companies)
    .set({
      companyType: 'partner',
      status: 'active',
      updatedAt: new Date(),
    })
    .where(and(eq(companies.id, companyId), isNull(companies.deletedAt)));
}

async function validatePartnerAssignment(pipelineId: string, partnerCompanyId?: string | null) {
  if (!partnerCompanyId) return;

  const [pipeline] = await db
    .select({ id: pipelines.id, name: pipelines.name })
    .from(pipelines)
    .where(eq(pipelines.id, pipelineId))
    .limit(1);

  if (!pipeline) {
    throw new Error('Pipeline not found');
  }

  if (!pipeline.name.toLowerCase().includes('sales')) {
    throw new Error('Partners can only be linked to prospects in a sales pipeline');
  }

  const [partnerCompany] = await db
    .select({ id: companies.id, companyType: companies.companyType, deletedAt: companies.deletedAt })
    .from(companies)
    .where(eq(companies.id, partnerCompanyId))
    .limit(1);

  if (!partnerCompany || partnerCompany.deletedAt) {
    throw new Error('Selected partner company was not found');
  }

  if (partnerCompany.companyType !== 'partner') {
    throw new Error('Only companies marked as partners can be linked as prospect partners');
  }
}

async function resolvePrimaryContactSnapshot(primaryContactId?: string | null) {
  if (!primaryContactId) {
    return {
      primaryContactName: null,
      primaryContactEmail: null,
      primaryContactPhone: null,
      primaryContactTitle: null,
    };
  }

  const [contact] = await db
    .select({
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      mobile: contacts.mobile,
      jobTitle: contacts.jobTitle,
    })
    .from(contacts)
    .where(and(eq(contacts.id, primaryContactId), isNull(contacts.deletedAt)))
    .limit(1);

  if (!contact) {
    return {
      primaryContactName: null,
      primaryContactEmail: null,
      primaryContactPhone: null,
      primaryContactTitle: null,
    };
  }

  return {
    primaryContactName: [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() || null,
    primaryContactEmail: contact.email ?? null,
    primaryContactPhone: contact.phone ?? contact.mobile ?? null,
    primaryContactTitle: contact.jobTitle ?? null,
  };
}

export async function listDeals(
  user: SessionUser,
  opts: {
    filters?: FilterConfig;
    search?: string;
    sort?: { field: string; direction: 'asc' | 'desc' };
    pagination: { cursor?: string; limit: number };
    pipelineId?: string;
  }
): Promise<PaginatedResult<Record<string, unknown>>> {
  const { filters, search, sort, pagination, pipelineId } = opts;
  const limit = Math.min(pagination.limit, 500);
  const contactsAlias = contacts;

  const readLevel = getPermissionLevel(user.role.permissions, 'deals', 'read');
  if (!readLevel) return { items: [], nextCursor: null, hasMore: false };

  const conditions = [isNull(deals.deletedAt)];
  const visibilityFilter = getProspectVisibilityFilter(user);
  if (visibilityFilter) conditions.push(visibilityFilter);

  if (pipelineId) {
    conditions.push(eq(deals.pipelineId, pipelineId));
  }

  if (search?.trim()) {
    const searchTokens = search
      .trim()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);

    const tokenConditions = searchTokens.map((token) => {
      const searchTerm = `%${token}%`;
      return or(
        ilike(deals.title, searchTerm),
        ilike(companies.name, searchTerm),
        ilike(sql<string>`concat(${contactsAlias.firstName}, ' ', ${contactsAlias.lastName})`, searchTerm),
        ilike(contactsAlias.email, searchTerm)
      )!;
    });

    if (tokenConditions.length > 0) {
      conditions.push(and(...tokenConditions)!);
    }
  }

  if (filters?.conditions?.length) {
    const filterWhere = buildFilterWhere(filters, 'deal');
    if (filterWhere) conditions.push(filterWhere);
  }

  if (pagination.cursor) {
    try {
      const [cursorDate, cursorId] = pagination.cursor.split('__');
      if (cursorDate && cursorId) {
        conditions.push(
          or(
            lt(deals.createdAt, new Date(cursorDate)),
            and(eq(deals.createdAt, new Date(cursorDate)), lt(deals.id, cursorId))
          )!
        );
      }
    } catch { /* ignore */ }
  }

  const rows = await db
    .select({
      id: deals.id,
      title: deals.title,
      amount: deals.amount,
      effectiveValue: sql<string>`COALESCE((SELECT o.engagement_amount FROM onboardings o WHERE o.deal_id = ${deals.id} AND o.status != 'cancelled' LIMIT 1), ${deals.amount}, 0)::text`,
      currency: deals.currency,
      probability: deals.probability,
      status: getEffectiveDealStatusSql(pipelineStages.stageType),
      services: deals.services,
      serviceOther: deals.serviceOther,
      pipelineId: deals.pipelineId,
      stageId: deals.stageId,
      stageEnteredAt: deals.stageEnteredAt,
      expectedCloseDate: deals.expectedCloseDate,
      ownerId: deals.ownerId,
      companyId: deals.companyId,
      partnerCompanyId: deals.partnerCompanyId,
      referredByPartnerId: deals.referredByPartnerId,
      linkedProjectId: deals.linkedProjectId,
      primaryContactId: deals.primaryContactId,
      primaryContactSnapshotName: deals.primaryContactName,
      primaryContactEmail: deals.primaryContactEmail,
      primaryContactPhone: deals.primaryContactPhone,
      primaryContactTitle: deals.primaryContactTitle,
      projectStartDate: deals.projectStartDate,
      projectEndDate: deals.projectEndDate,
      projectActualEndDate: deals.projectActualEndDate,
      projectProgressPercent: deals.projectProgressPercent,
      isDelayed: deals.isDelayed,
      delayReason: deals.delayReason,
      revisedEndDate: deals.revisedEndDate,
      customFields: deals.customFields,
      positionInStage: deals.positionInStage,
      isVelocitySlow: deals.isVelocitySlow,
      createdAt: deals.createdAt,
      updatedAt: deals.updatedAt,
      ownerFirstName: users.firstName,
      ownerLastName: users.lastName,
      ownerName: sql<string | null>`NULLIF(TRIM(CONCAT(${users.firstName}, ' ', ${users.lastName})), '')`,
      companyName: companies.name,
      partnerCompanyName: sql<string | null>`(SELECT c.name FROM companies c WHERE c.id = ${deals.partnerCompanyId})`,
      referredByPartnerName: sql<string | null>`(SELECT c.name FROM companies c WHERE c.id = ${deals.referredByPartnerId})`,
      stageName: pipelineStages.name,
      stageColor: pipelineStages.color,
      pipelineType: pipelines.pipelineType,
      taskCount: sql<number>`(SELECT COUNT(*)::int FROM deal_tasks dt WHERE dt.deal_id = ${deals.id})`,
      completedTaskCount: sql<number>`(SELECT COUNT(*)::int FROM deal_tasks dt WHERE dt.deal_id = ${deals.id} AND dt.status = 'completed')`,
      teamMemberCount: sql<number>`(SELECT COUNT(*)::int FROM deal_team_members dtm WHERE dtm.deal_id = ${deals.id})`,
      primaryContactName: sql<string | null>`COALESCE(${deals.primaryContactName}, NULLIF(TRIM(CONCAT(${contactsAlias.firstName}, ' ', ${contactsAlias.lastName})), ''))`,
    })
    .from(deals)
    .leftJoin(users, eq(deals.ownerId, users.id))
    .leftJoin(companies, eq(deals.companyId, companies.id))
    .leftJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .leftJoin(pipelines, eq(deals.pipelineId, pipelines.id))
    .leftJoin(contactsAlias, eq(deals.primaryContactId, contactsAlias.id))
    .where(and(...conditions))
    .orderBy(sort?.direction === 'asc' ? asc(deals.createdAt) : desc(deals.createdAt), desc(deals.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = maskDealAmountsForUser(user, hasMore ? rows.slice(0, limit) : rows);
  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1]!;
    nextCursor = `${last.createdAt.toISOString()}__${last.id}`;
  }

  return { items: items as Record<string, unknown>[], nextCursor, hasMore };
}

export async function getDealsByStage(
  user: SessionUser,
  pipelineId: string,
  opts?: {
    filters?: FilterConfig;
    search?: string;
  }
): Promise<Record<string, unknown[]>> {
  const readLevel = getPermissionLevel(user.role.permissions, 'deals', 'read');
  if (!readLevel) return {};

  const conditions = [isNull(deals.deletedAt), eq(deals.pipelineId, pipelineId)];
  const visibilityFilter = getProspectVisibilityFilter(user);
  if (visibilityFilter) conditions.push(visibilityFilter);
  const pipelineStageRows = await db
    .select({
      id: pipelineStages.id,
      stageType: pipelineStages.stageType,
    })
    .from(pipelineStages)
    .where(eq(pipelineStages.pipelineId, pipelineId))
    .orderBy(asc(pipelineStages.position));

  const firstActiveStageId = pipelineStageRows.find((stage) => stage.stageType === 'active')?.id;
  const firstWonStageId = pipelineStageRows.find((stage) => stage.stageType === 'won')?.id;
  const firstLostStageId = pipelineStageRows.find((stage) => stage.stageType === 'lost')?.id;

  if (opts?.search?.trim()) {
    const searchTokens = opts.search
      .trim()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);

    const tokenConditions = searchTokens.map((token) => {
      const searchTerm = `%${token}%`;
      return or(
        ilike(deals.title, searchTerm),
        ilike(companies.name, searchTerm),
        ilike(sql<string>`concat(${contacts.firstName}, ' ', ${contacts.lastName})`, searchTerm),
        ilike(contacts.email, searchTerm)
      )!;
    });

    if (tokenConditions.length > 0) {
      conditions.push(and(...tokenConditions)!);
    }
  }

  if (opts?.filters?.conditions?.length) {
    const filterWhere = buildFilterWhere(opts.filters, 'deal');
    if (filterWhere) conditions.push(filterWhere);
  }

  const rows = await db
    .select({
      id: deals.id,
      title: deals.title,
      amount: deals.amount,
      effectiveValue: sql<string>`COALESCE((SELECT o.engagement_amount FROM onboardings o WHERE o.deal_id = ${deals.id} AND o.status != 'cancelled' LIMIT 1), ${deals.amount}, 0)::text`,
      currency: deals.currency,
      probability: deals.probability,
      status: getEffectiveDealStatusSql(pipelineStages.stageType),
      services: deals.services,
      serviceOther: deals.serviceOther,
      stageId: deals.stageId,
      stageType: pipelineStages.stageType,
      stageEnteredAt: deals.stageEnteredAt,
      expectedCloseDate: deals.expectedCloseDate,
      ownerId: deals.ownerId,
      companyId: deals.companyId,
      partnerCompanyId: deals.partnerCompanyId,
      referredByPartnerId: deals.referredByPartnerId,
      primaryContactId: deals.primaryContactId,
      primaryContactSnapshotName: deals.primaryContactName,
      primaryContactEmail: deals.primaryContactEmail,
      primaryContactPhone: deals.primaryContactPhone,
      primaryContactTitle: deals.primaryContactTitle,
      projectStartDate: deals.projectStartDate,
      projectEndDate: deals.projectEndDate,
      projectActualEndDate: deals.projectActualEndDate,
      projectProgressPercent: deals.projectProgressPercent,
      isDelayed: deals.isDelayed,
      delayReason: deals.delayReason,
      revisedEndDate: deals.revisedEndDate,
      positionInStage: deals.positionInStage,
      isVelocitySlow: deals.isVelocitySlow,
      createdAt: deals.createdAt,
      ownerFirstName: users.firstName,
      ownerLastName: users.lastName,
      ownerName: sql<string | null>`NULLIF(TRIM(CONCAT(${users.firstName}, ' ', ${users.lastName})), '')`,
      ownerAvatarUrl: users.avatarUrl,
      companyName: companies.name,
      partnerCompanyName: sql<string | null>`(SELECT c.name FROM companies c WHERE c.id = ${deals.partnerCompanyId})`,
      referredByPartnerName: sql<string | null>`(SELECT c.name FROM companies c WHERE c.id = ${deals.referredByPartnerId})`,
      pipelineType: pipelines.pipelineType,
      taskCount: sql<number>`(SELECT COUNT(*)::int FROM deal_tasks dt WHERE dt.deal_id = ${deals.id})`,
      completedTaskCount: sql<number>`(SELECT COUNT(*)::int FROM deal_tasks dt WHERE dt.deal_id = ${deals.id} AND dt.status = 'completed')`,
      teamMemberCount: sql<number>`(SELECT COUNT(*)::int FROM deal_team_members dtm WHERE dtm.deal_id = ${deals.id})`,
      primaryContactName: sql<string | null>`COALESCE(${deals.primaryContactName}, NULLIF(TRIM(CONCAT(${contacts.firstName}, ' ', ${contacts.lastName})), ''))`,
    })
    .from(deals)
    .leftJoin(users, eq(deals.ownerId, users.id))
    .leftJoin(companies, eq(deals.companyId, companies.id))
    .leftJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .leftJoin(pipelines, eq(deals.pipelineId, pipelines.id))
    .leftJoin(contacts, eq(deals.primaryContactId, contacts.id))
    .where(and(...conditions))
    .orderBy(asc(deals.positionInStage), desc(deals.createdAt));

  // Group by stage
  const grouped: Record<string, Record<string, unknown>[]> = {};
  for (const row of rows) {
    let groupedStageId = row.stageId;
    const shouldGroupByLifecycleStatus = row.pipelineType !== 'active_delivery';

    if (shouldGroupByLifecycleStatus && row.status === 'won' && row.stageType !== 'won' && firstWonStageId) {
      groupedStageId = firstWonStageId;
    } else if (shouldGroupByLifecycleStatus && (row.status === 'lost' || row.status === 'abandoned') && row.stageType !== 'lost' && firstLostStageId) {
      groupedStageId = firstLostStageId;
    } else if (shouldGroupByLifecycleStatus && row.status === 'open' && row.stageType !== 'active' && firstActiveStageId) {
      groupedStageId = firstActiveStageId;
    }

    const normalizedRow = maskDealAmountForUser(user, { ...row, stageId: groupedStageId } as Record<string, unknown>);
    if (!grouped[groupedStageId]) grouped[groupedStageId] = [];
    grouped[groupedStageId]!.push(normalizedRow);
  }
  return grouped;
}

export async function getDealById(
  user: SessionUser,
  id: string
): Promise<Record<string, unknown> | null> {
  const readLevel = getPermissionLevel(user.role.permissions, 'deals', 'read');
  if (!readLevel) return null;

  // Use aliases to avoid Drizzle column name conflicts
  const ownerUsers = users;
  const primaryContacts = contacts;

  const [deal] = await db
    .select({
      id: deals.id,
      title: deals.title,
      description: deals.description,
      amount: deals.amount,
      currency: deals.currency,
      probability: deals.probability,
      status: getEffectiveDealStatusSql(pipelineStages.stageType),
      services: deals.services,
      serviceOther: deals.serviceOther,
      pipelineId: deals.pipelineId,
      stageId: deals.stageId,
      stageEnteredAt: deals.stageEnteredAt,
      expectedCloseDate: deals.expectedCloseDate,
      actualCloseDate: deals.actualCloseDate,
      lostReason: deals.lostReason,
      wonReason: deals.wonReason,
      ownerId: deals.ownerId,
      companyId: deals.companyId,
      partnerCompanyId: deals.partnerCompanyId,
      referredByPartnerId: deals.referredByPartnerId,
      primaryContactId: deals.primaryContactId,
      primaryContactName: deals.primaryContactName,
      primaryContactEmail: deals.primaryContactEmail,
      primaryContactPhone: deals.primaryContactPhone,
      primaryContactTitle: deals.primaryContactTitle,
      projectStartDate: deals.projectStartDate,
      projectEndDate: deals.projectEndDate,
      projectActualEndDate: deals.projectActualEndDate,
      projectProgressPercent: deals.projectProgressPercent,
      isDelayed: deals.isDelayed,
      delayReason: deals.delayReason,
      revisedEndDate: deals.revisedEndDate,
      customFields: deals.customFields,
      positionInStage: deals.positionInStage,
      createdAt: deals.createdAt,
      updatedAt: deals.updatedAt,
      createdBy: deals.createdBy,
      // Joined fields
      ownerFirstName: ownerUsers.firstName,
      ownerLastName: ownerUsers.lastName,
      companyName: companies.name,
      partnerCompanyName: sql<string | null>`(SELECT c.name FROM companies c WHERE c.id = ${deals.partnerCompanyId})`,
      referredByPartnerName: sql<string | null>`(SELECT c.name FROM companies c WHERE c.id = ${deals.referredByPartnerId})`,
      stageName: pipelineStages.name,
      stageColor: pipelineStages.color,
      pipelineType: pipelines.pipelineType,
      primaryContactFirstName: primaryContacts.firstName,
      primaryContactLastName: primaryContacts.lastName,
      primaryContactJoinedName: sql<string | null>`NULLIF(TRIM(CONCAT(${primaryContacts.firstName}, ' ', ${primaryContacts.lastName})), '')`,
      primaryContactJoinedEmail: primaryContacts.email,
      primaryContactJoinedPhone: primaryContacts.phone,
      primaryContactJoinedMobile: primaryContacts.mobile,
      primaryContactJoinedTitle: primaryContacts.jobTitle,
    })
    .from(deals)
    .leftJoin(ownerUsers, eq(deals.ownerId, ownerUsers.id))
    .leftJoin(companies, eq(deals.companyId, companies.id))
    .leftJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .leftJoin(pipelines, eq(deals.pipelineId, pipelines.id))
    .leftJoin(primaryContacts, eq(deals.primaryContactId, primaryContacts.id))
    .where(and(eq(deals.id, id), isNull(deals.deletedAt), getProspectVisibilityFilter(user)))
    .limit(1);

  if (!deal) return null;

  const dealTagRows = await db
    .select({ tag: tags })
    .from(dealTags)
    .innerJoin(tags, eq(dealTags.tagId, tags.id))
    .where(eq(dealTags.dealId, id));

  const dealContactRows = await db
    .select({
      contact: contacts,
      role: dealContacts.role,
    })
    .from(dealContacts)
    .innerJoin(contacts, eq(dealContacts.contactId, contacts.id))
    .where(eq(dealContacts.dealId, id));

  // Stage history with resolved stage names
  const stageHistoryRows = await db
    .select({
      id: dealStageHistory.id,
      fromStageId: dealStageHistory.fromStageId,
      toStageId: dealStageHistory.toStageId,
      movedAt: dealStageHistory.createdAt,
    })
    .from(dealStageHistory)
    .where(eq(dealStageHistory.dealId, id))
    .orderBy(asc(dealStageHistory.createdAt));

  // Resolve stage names for history in one go
  const allStageIds = new Set<string>();
  for (const h of stageHistoryRows) {
    if (h.fromStageId) allStageIds.add(h.fromStageId);
    if (h.toStageId) allStageIds.add(h.toStageId);
  }
  const stageNameMap: Record<string, string> = {};
  if (allStageIds.size > 0) {
    const stageRows = await db
      .select({ id: pipelineStages.id, name: pipelineStages.name })
      .from(pipelineStages)
      .where(inArray(pipelineStages.id, Array.from(allStageIds)));
    for (const s of stageRows) stageNameMap[s.id] = s.name;
  }

  const stageHistory = stageHistoryRows.map((h) => ({
    ...h,
    fromStageName: h.fromStageId ? stageNameMap[h.fromStageId] ?? null : null,
    toStageName: h.toStageId ? stageNameMap[h.toStageId] ?? null : null,
  }));

  const teamMembers = await db
    .select({
      id: dealTeamMembers.id,
      userId: dealTeamMembers.userId,
      role: dealTeamMembers.role,
      assignedAt: dealTeamMembers.assignedAt,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      avatarUrl: users.avatarUrl,
    })
    .from(dealTeamMembers)
    .leftJoin(users, eq(dealTeamMembers.userId, users.id))
    .where(eq(dealTeamMembers.dealId, id))
    .orderBy(asc(dealTeamMembers.assignedAt));

  const tasks = await db
    .select({
      id: dealTasks.id,
      title: dealTasks.title,
      description: dealTasks.description,
      status: dealTasks.status,
      priority: dealTasks.priority,
      assignedTo: dealTasks.assignedTo,
      dueDate: dealTasks.dueDate,
      completedAt: dealTasks.completedAt,
      position: dealTasks.position,
      createdAt: dealTasks.createdAt,
      assigneeFirstName: users.firstName,
      assigneeLastName: users.lastName,
      assigneeEmail: users.email,
      assigneeAvatarUrl: users.avatarUrl,
    })
    .from(dealTasks)
    .leftJoin(users, eq(dealTasks.assignedTo, users.id))
    .where(eq(dealTasks.dealId, id))
    .orderBy(asc(dealTasks.position), asc(dealTasks.dueDate), asc(dealTasks.createdAt));

  return maskDealAmountForUser(user, {
    ...deal,
    primaryContactName: deal.primaryContactName ?? deal.primaryContactJoinedName,
    primaryContactEmail: deal.primaryContactEmail ?? deal.primaryContactJoinedEmail,
    primaryContactPhone: deal.primaryContactPhone ?? deal.primaryContactJoinedPhone ?? deal.primaryContactJoinedMobile,
    primaryContactTitle: deal.primaryContactTitle ?? deal.primaryContactJoinedTitle,
    tags: dealTagRows.map((r) => r.tag),
    contacts: dealContactRows.map((r) => ({ ...r.contact, role: r.role })),
    stageHistory,
    teamMembers,
    tasks,
    taskCount: tasks.length,
    completedTaskCount: tasks.filter((task) => task.status === 'completed').length,
  });
}

export async function createDeal(
  user: SessionUser,
  data: Omit<NewDeal, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>
): Promise<Record<string, unknown>> {
  const writeData = sanitizeDealWriteDataForUser(user, data as Record<string, unknown>) as typeof data;
  await validatePartnerAssignment(writeData.pipelineId, writeData.partnerCompanyId);
  const resolvedLifecycle = await resolveStageAndStatus({
    pipelineId: writeData.pipelineId,
    stageId: writeData.stageId,
    status: (writeData.status as DealStatus | null | undefined) ?? 'open',
  });
  const primaryContactSnapshot = await resolvePrimaryContactSnapshot(writeData.primaryContactId);

  const [deal] = await db
    .insert(deals)
    .values({
      ...writeData,
      ...primaryContactSnapshot,
      stageId: resolvedLifecycle.stageId,
      status: resolvedLifecycle.status,
      actualCloseDate: resolveActualCloseDate(resolvedLifecycle.status),
      ownerId: writeData.ownerId ?? user.id,
      createdBy: user.id,
    })
    .returning();

  // Create initial stage history
  await db.insert(dealStageHistory).values({
    dealId: deal!.id,
    fromStageId: null,
    toStageId: resolvedLifecycle.stageId,
    movedBy: user.id,
  });

  // Auto-log deal_created activity so it surfaces in contact/company activity feeds
  await db.insert(activities).values({
    activityType: 'note',
    subject: `Prospect created: ${deal!.title}`,
    dealId: deal!.id,
    companyId: writeData.companyId ?? null,
    contactId: writeData.primaryContactId ?? null,
    performedBy: user.id,
    isAutomated: true,
    occurredAt: new Date(),
    metadata: { dealTitle: deal!.title, stageId: resolvedLifecycle.stageId },
  });

  await promoteCompanyToPartnerIfEligible(writeData.companyId, writeData.pipelineId, resolvedLifecycle.stageId);
  if (deal!.primaryContactId) {
    await syncContactActivitiesToDeal(deal!.id, deal!.primaryContactId, user.id);
  }
  if (resolvedLifecycle.status === 'won') {
    await createOnboardingFromDeal(deal!.id, user.id);
  }
  await createOrSyncProjectFromDeal(deal!.id, user.id);

  eventBus.emit('deal.created', { dealId: deal!.id, createdBy: user.id });

  await writeAuditLog({
    userId: user.id,
    userEmail: user.email,
    action: 'create',
    entityType: 'deal',
    entityId: deal!.id,
    entityName: deal!.title,
    changes: { title: { new: deal!.title } },
  });

  return maskDealAmountForUser(user, deal as Record<string, unknown>);
}

export async function updateDeal(
  user: SessionUser,
  id: string,
  data: Partial<Omit<NewDeal, 'id' | 'createdAt' | 'createdBy'>>
): Promise<Record<string, unknown>> {
  const writeData = sanitizeDealWriteDataForUser(user, data as Record<string, unknown>) as typeof data;
  const existing = await getDealById(user, id);
  if (!existing) throw new Error('Prospect not found');

  const updateLevel = getPermissionLevel(user.role.permissions, 'deals', 'update');
  if (updateLevel === 'own' && existing.ownerId !== user.id) throw new Error('Insufficient permissions');
  if (!updateLevel) throw new Error('Insufficient permissions');

  const nextPipelineId = (writeData.pipelineId ?? existing.pipelineId) as string;
  const nextPartnerCompanyId = writeData.partnerCompanyId !== undefined
    ? writeData.partnerCompanyId
    : (existing.partnerCompanyId as string | null | undefined);

  await validatePartnerAssignment(nextPipelineId, nextPartnerCompanyId);
  const pipelineChanged = nextPipelineId !== (existing.pipelineId as string);
  const shouldSyncLifecycle = writeData.stageId !== undefined || writeData.status !== undefined || pipelineChanged;
  const resolvedLifecycle = shouldSyncLifecycle
    ? await resolveStageAndStatus({
        pipelineId: nextPipelineId,
        stageId: writeData.stageId as string | null | undefined,
        status: writeData.status as DealStatus | null | undefined,
        fallbackStageId: existing.stageId as string | null | undefined,
        fallbackStatus: existing.status as DealStatus | null | undefined,
      })
    : null;

  const nextStageId = resolvedLifecycle?.stageId ?? (writeData.stageId as string | undefined) ?? (existing.stageId as string);
  const nextStatus = resolvedLifecycle?.status ?? (writeData.status as DealStatus | undefined) ?? (existing.status as DealStatus);
  const isStageChange = nextStageId !== existing.stageId;
  const isStatusChange = nextStatus !== existing.status;
  const updatePayload: Partial<Omit<NewDeal, 'id' | 'createdAt' | 'createdBy'>> & { updatedAt: Date; stageEnteredAt?: Date } = {
    ...writeData,
    updatedAt: new Date(),
  };

  if (writeData.primaryContactId !== undefined) {
    Object.assign(updatePayload, await resolvePrimaryContactSnapshot(writeData.primaryContactId));
  }

  if (resolvedLifecycle) {
    updatePayload.stageId = resolvedLifecycle.stageId;
    updatePayload.status = resolvedLifecycle.status;
    updatePayload.actualCloseDate = resolveActualCloseDate(
      resolvedLifecycle.status,
      existing.status as DealStatus | null | undefined,
      existing.actualCloseDate
    );
  }

  if (isStageChange) {
    updatePayload.stageEnteredAt = new Date();
  }

  const [updated] = await db
    .update(deals)
    .set(updatePayload)
    .where(and(eq(deals.id, id), isNull(deals.deletedAt)))
    .returning();

  if (isStageChange) {
    // Close previous stage history entry
    await db
      .update(dealStageHistory)
      .set({ exitedAt: new Date() })
      .where(and(eq(dealStageHistory.dealId, id), isNull(dealStageHistory.exitedAt)));

    // Create new stage history entry
    await db.insert(dealStageHistory).values({
      dealId: id,
      fromStageId: existing.stageId as string,
      toStageId: nextStageId,
      movedBy: user.id,
    });

    eventBus.emit('deal.stage_changed', {
      dealId: id,
      fromStageId: existing.stageId as string,
      toStageId: nextStageId,
      movedBy: user.id,
    });

    const [toStage] = await db
      .select({ name: pipelineStages.name })
      .from(pipelineStages)
      .where(eq(pipelineStages.id, nextStageId))
      .limit(1);

    if (toStage) {
      await maybeCreateOrSyncProjectForDealStage(id, toStage.name, user.id);
    }

    // Auto-log stage_change activity
    await db.insert(activities).values({
      activityType: 'stage_change',
      subject: `Stage changed`,
      dealId: id,
      companyId: (existing.companyId as string | null | undefined) ?? null,
      contactId: (existing.primaryContactId as string | null | undefined) ?? null,
      performedBy: user.id,
      isAutomated: true,
      occurredAt: new Date(),
      metadata: {
        dealTitle: existing.title,
        fromStageId: existing.stageId,
        toStageId: nextStageId,
        companyId: existing.companyId,
        primaryContactId: existing.primaryContactId,
      },
    });

    await promoteCompanyToPartnerIfEligible(
      (updated?.companyId as string | null | undefined) ?? (existing.companyId as string | null | undefined),
      nextPipelineId,
      nextStageId
    );
  }

  if (isStatusChange && nextStatus === 'won') {
    eventBus.emit('deal.won', { dealId: id, amount: Number(existing.amount ?? 0), wonBy: user.id });
    await createOnboardingFromDeal(id, user.id);
  } else if (isStatusChange && (nextStatus === 'lost' || nextStatus === 'abandoned')) {
    eventBus.emit('deal.lost', { dealId: id, reason: (writeData.lostReason as string | undefined) ?? '', lostBy: user.id });
  }

  const changes = buildChangeDiff(existing as Record<string, unknown>, updated as Record<string, unknown>);
  eventBus.emit('deal.updated', { dealId: id, changes, updatedBy: user.id });

  await writeAuditLog({
    userId: user.id,
    userEmail: user.email,
    action: isStageChange ? 'stage_change' : 'update',
    entityType: 'deal',
    entityId: id,
    entityName: updated!.title,
    changes,
  });

  await syncDealFieldsToProject(id);
  if (writeData.primaryContactId && writeData.primaryContactId !== existing.primaryContactId) {
    await syncContactActivitiesToDeal(id, writeData.primaryContactId, user.id);
  }

  return maskDealAmountForUser(user, updated as Record<string, unknown>);
}

export async function deleteDeal(user: SessionUser, id: string): Promise<void> {
  const deal = await getDealById(user, id);
  if (!deal) throw new Error('Prospect not found');

  await db.update(deals).set({ deletedAt: new Date() }).where(and(eq(deals.id, id), isNull(deals.deletedAt)));
  if (deal.linkedProjectId) {
    await db.update(projects).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(projects.id, deal.linkedProjectId as string));
  }
  eventBus.emit('deal.deleted', { dealId: id, deletedBy: user.id });

  await writeAuditLog({
    userId: user.id,
    userEmail: user.email,
    action: 'delete',
    entityType: 'deal',
    entityId: id,
    entityName: deal.title as string,
  });
}

export async function getDealsByContact(
  user: SessionUser,
  contactId: string
): Promise<Record<string, unknown>[]> {
  const readLevel = getPermissionLevel(user.role.permissions, 'deals', 'read');
  if (!readLevel) return [];

  // Deals linked via primaryContactId or via the dealContacts join table
  const primaryRows = await db
    .select({
      id: deals.id,
      title: deals.title,
      amount: deals.amount,
      currency: deals.currency,
      status: getEffectiveDealStatusSql(pipelineStages.stageType),
      stageId: deals.stageId,
      expectedCloseDate: deals.expectedCloseDate,
      createdAt: deals.createdAt,
      companyName: companies.name,
      stageName: pipelineStages.name,
      stageColor: pipelineStages.color,
    })
    .from(deals)
    .leftJoin(companies, eq(deals.companyId, companies.id))
    .leftJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .where(and(
      isNull(deals.deletedAt),
      eq(deals.primaryContactId, contactId),
      ...(getProspectVisibilityFilter(user) ? [getProspectVisibilityFilter(user)!] : [])
    ));

  const linkedRows = await db
    .select({
      id: deals.id,
      title: deals.title,
      amount: deals.amount,
      currency: deals.currency,
      status: getEffectiveDealStatusSql(pipelineStages.stageType),
      stageId: deals.stageId,
      expectedCloseDate: deals.expectedCloseDate,
      createdAt: deals.createdAt,
      companyName: companies.name,
      stageName: pipelineStages.name,
      stageColor: pipelineStages.color,
    })
    .from(dealContacts)
    .innerJoin(deals, eq(dealContacts.dealId, deals.id))
    .leftJoin(companies, eq(deals.companyId, companies.id))
    .leftJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .where(and(
      isNull(deals.deletedAt),
      eq(dealContacts.contactId, contactId),
      ...(getProspectVisibilityFilter(user) ? [getProspectVisibilityFilter(user)!] : [])
    ));

  // Deduplicate by id
  const seen = new Set<string>();
  const combined: Record<string, unknown>[] = [];
  for (const row of [...primaryRows, ...linkedRows]) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      combined.push(row as Record<string, unknown>);
    }
  }
  return maskDealAmountsForUser(user, combined);
}

export async function getDealsByCompany(
  user: SessionUser,
  companyId: string
): Promise<Record<string, unknown>[]> {
  const readLevel = getPermissionLevel(user.role.permissions, 'deals', 'read');
  if (!readLevel) return [];

  const conditions = [
    isNull(deals.deletedAt),
    eq(deals.companyId, companyId),
    ...(getProspectVisibilityFilter(user) ? [getProspectVisibilityFilter(user)!] : []),
  ];

  const rows = await db
    .select({
      id: deals.id,
      title: deals.title,
      amount: deals.amount,
      currency: deals.currency,
      status: getEffectiveDealStatusSql(pipelineStages.stageType),
      stageId: deals.stageId,
      expectedCloseDate: deals.expectedCloseDate,
      createdAt: deals.createdAt,
      stageName: pipelineStages.name,
      stageColor: pipelineStages.color,
      primaryContactName: sql<string | null>`NULLIF(TRIM(CONCAT(${contacts.firstName}, ' ', ${contacts.lastName})), '')`,
    })
    .from(deals)
    .leftJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .leftJoin(contacts, eq(deals.primaryContactId, contacts.id))
    .where(and(...conditions))
    .orderBy(desc(deals.createdAt));

  return maskDealAmountsForUser(user, rows as Record<string, unknown>[]);
}

export async function addDealTags(user: SessionUser, dealId: string, tagIds: string[]): Promise<void> {
  for (const tagId of tagIds) {
    await db.insert(dealTags).values({ dealId, tagId, taggedBy: user.id }).onConflictDoNothing();
    await db.execute(sql`UPDATE tags SET usage_count = usage_count + 1 WHERE id = ${tagId}`);
    eventBus.emit('tag.added', { entityType: 'deal', entityId: dealId, tagId, taggedBy: user.id });
  }
}

export async function removeDealTags(user: SessionUser, dealId: string, tagIds: string[]): Promise<void> {
  for (const tagId of tagIds) {
    await db.delete(dealTags).where(and(eq(dealTags.dealId, dealId), eq(dealTags.tagId, tagId)));
    await db.execute(sql`UPDATE tags SET usage_count = GREATEST(0, usage_count - 1) WHERE id = ${tagId}`);
    eventBus.emit('tag.removed', { entityType: 'deal', entityId: dealId, tagId, untaggedBy: user.id });
  }
}

export async function bulkUpdateDeals(
  user: SessionUser,
  ids: string[],
  data: { ownerId?: string | null; status?: string; tagIdsToAdd?: string[] }
): Promise<{ updated: number }> {
  if (!ids.length) return { updated: 0 };

  if (data.status !== undefined) {
    for (const id of ids) {
      await updateDeal(user, id, {
        ...(data.ownerId !== undefined ? { ownerId: data.ownerId } : {}),
        status: data.status as DealStatus,
      });
      if (data.tagIdsToAdd?.length) {
        await addDealTags(user, id, data.tagIdsToAdd);
      }
    }

    await writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: 'bulk_update',
      entityType: 'deal',
      metadata: { ids, changes: data },
    });

    return { updated: ids.length };
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (data.ownerId !== undefined) updateData.ownerId = data.ownerId;

  if (Object.keys(updateData).length > 1) {
    await db
      .update(deals)
      .set(updateData as Partial<typeof deals.$inferInsert>)
      .where(and(inArray(deals.id, ids), isNull(deals.deletedAt)));
    await Promise.all(ids.map((id) => syncDealFieldsToProject(id)));
  }

  for (const id of ids) {
    if (data.tagIdsToAdd?.length) await addDealTags(user, id, data.tagIdsToAdd);
  }

  await writeAuditLog({
    userId: user.id,
    userEmail: user.email,
    action: 'bulk_update',
    entityType: 'deal',
    metadata: { ids, changes: data },
  });

  return { updated: ids.length };
}

export async function moveDealToStage(
  user: SessionUser,
  dealId: string,
  toStageId: string,
  positionInStage?: number,
  lostReason?: string
): Promise<Record<string, unknown>> {
  return updateDeal(user, dealId, {
    stageId: toStageId,
    positionInStage: positionInStage ?? 0,
    ...(lostReason ? { lostReason } : {}),
  });
}

export async function getProjectDetails(user: SessionUser, dealId: string): Promise<Record<string, unknown> | null> {
  return getDealById(user, dealId);
}

export async function updateProjectProgress(
  user: SessionUser,
  dealId: string,
  data: {
    progressPercent: number;
    isDelayed?: boolean;
    delayReason?: string | null;
    revisedEndDate?: string | null;
  }
): Promise<Record<string, unknown>> {
  const updated = await updateDeal(user, dealId, {
    projectProgressPercent: data.progressPercent,
    ...(data.isDelayed !== undefined ? { isDelayed: data.isDelayed } : {}),
    ...(data.delayReason !== undefined ? { delayReason: data.delayReason } : {}),
    ...(data.revisedEndDate !== undefined ? { revisedEndDate: data.revisedEndDate } : {}),
  });

  await db.insert(activities).values({
    activityType: 'note',
    subject: `Project progress updated to ${data.progressPercent}%`,
    dealId,
    companyId: (updated.companyId as string | null | undefined) ?? null,
    contactId: (updated.primaryContactId as string | null | undefined) ?? null,
    performedBy: user.id,
    isAutomated: true,
    occurredAt: new Date(),
    metadata: {
      dealTitle: updated.title,
      progressPercent: data.progressPercent,
      isDelayed: data.isDelayed,
    },
  });

  eventBus.emit('deal.progress_updated', {
    dealId,
    progressPercent: data.progressPercent,
    isDelayed: data.isDelayed,
    delayReason: data.delayReason,
    revisedEndDate: data.revisedEndDate,
  });

  await syncProgressToProject(
    dealId,
    data.progressPercent,
    data.isDelayed ?? false,
    data.delayReason,
    data.revisedEndDate
  );

  return updated;
}

export async function addTeamMember(
  user: SessionUser,
  dealId: string,
  userId: string,
  role = 'member'
): Promise<Record<string, unknown>> {
  const deal = await getDealById(user, dealId);
  if (!deal) throw new Error('Prospect not found');

  const [member] = await db
    .insert(dealTeamMembers)
    .values({ dealId, userId, role })
    .onConflictDoUpdate({
      target: [dealTeamMembers.dealId, dealTeamMembers.userId],
      set: { role },
    })
    .returning();

  await syncDealTeamToProject(dealId);

  return member as Record<string, unknown>;
}

export async function removeTeamMember(user: SessionUser, dealId: string, userId: string): Promise<void> {
  const deal = await getDealById(user, dealId);
  if (!deal) throw new Error('Prospect not found');

  await db.delete(dealTeamMembers).where(and(eq(dealTeamMembers.dealId, dealId), eq(dealTeamMembers.userId, userId)));
  await syncDealTeamToProject(dealId);
}
