import { db } from '@/server/db';
import { companies, companyTags, tags, contacts, users } from '@/server/db/schema';
import { eq, and, isNull, or, ilike, inArray, sql, lt, desc, asc, count, sum } from 'drizzle-orm';
import type { NewCompany } from '@/server/db/schema';
import type { FilterConfig, PaginatedResult, SessionUser } from '@/lib/types';
import { writeAuditLog, buildChangeDiff } from './audit.service';
import eventBus from '@/server/lib/event-bus';
import { getPermissionLevel } from '@/server/lib/permissions';
import { buildFilterWhere } from './filter.service';

export async function listCompanies(
  user: SessionUser,
  opts: {
    filters?: FilterConfig;
    search?: string;
    sort?: { field: string; direction: 'asc' | 'desc' };
    pagination: { cursor?: string; limit: number };
  }
): Promise<PaginatedResult<Record<string, unknown>>> {
  const { filters, search, sort, pagination } = opts;
  const limit = Math.min(pagination.limit, 500);

  const readLevel = getPermissionLevel(user.role.permissions, 'companies', 'read');
  if (!readLevel) return { items: [], nextCursor: null, hasMore: false };

  const conditions = [isNull(companies.deletedAt)];

  if (readLevel === 'own') {
    conditions.push(eq(companies.ownerId, user.id));
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
        ilike(companies.name, searchTerm),
        ilike(companies.domain, searchTerm),
        ilike(companies.industry, searchTerm)
      )!;
    });

    if (tokenConditions.length > 0) {
      conditions.push(and(...tokenConditions)!);
    }
  }

  if (filters?.conditions?.length) {
    const filterWhere = buildFilterWhere(filters, 'company');
    if (filterWhere) conditions.push(filterWhere);
  }

  if (pagination.cursor) {
    try {
      const [cursorDate, cursorId] = pagination.cursor.split('__');
      if (cursorDate && cursorId) {
        conditions.push(
          or(
            lt(companies.createdAt, new Date(cursorDate)),
            and(eq(companies.createdAt, new Date(cursorDate)), lt(companies.id, cursorId))
          )!
        );
      }
    } catch { /* ignore */ }
  }

  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      domain: companies.domain,
      website: companies.website,
      industry: companies.industry,
      companySize: companies.companySize,
      companyType: companies.companyType,
      status: companies.status,
      country: companies.country,
      city: companies.city,
      ownerId: companies.ownerId,
      logoUrl: companies.logoUrl,
      customFields: companies.customFields,
      lastContactedAt: companies.lastContactedAt,
      createdAt: companies.createdAt,
      ownerFirstName: users.firstName,
      ownerLastName: users.lastName,
    })
    .from(companies)
    .leftJoin(users, eq(companies.ownerId, users.id))
    .where(and(...conditions))
    .orderBy(sort?.direction === 'asc' ? asc(companies.createdAt) : desc(companies.createdAt), desc(companies.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1]!;
    nextCursor = `${last.createdAt.toISOString()}__${last.id}`;
  }

  return { items: items as Record<string, unknown>[], nextCursor, hasMore };
}

export async function getCompanyById(
  user: SessionUser,
  id: string
): Promise<Record<string, unknown> | null> {
  const readLevel = getPermissionLevel(user.role.permissions, 'companies', 'read');
  if (!readLevel) return null;

  const [company] = await db
    .select({
      id: companies.id,
      name: companies.name,
      domain: companies.domain,
      website: companies.website,
      industry: companies.industry,
      subIndustry: companies.subIndustry,
      companySize: companies.companySize,
      annualRevenueRange: companies.annualRevenueRange,
      companyType: companies.companyType,
      phone: companies.phone,
      email: companies.email,
      addressLine1: companies.addressLine1,
      addressLine2: companies.addressLine2,
      city: companies.city,
      state: companies.state,
      postalCode: companies.postalCode,
      country: companies.country,
      location: companies.location,
      linkedinUrl: companies.linkedinUrl,
      twitterUrl: companies.twitterUrl,
      logoUrl: companies.logoUrl,
      description: companies.description,
      status: companies.status,
      ownerId: companies.ownerId,
      customFields: companies.customFields,
      lastContactedAt: companies.lastContactedAt,
      createdAt: companies.createdAt,
      updatedAt: companies.updatedAt,
      deletedAt: companies.deletedAt,
      createdBy: companies.createdBy,
      ownerFirstName: users.firstName,
      ownerLastName: users.lastName,
    })
    .from(companies)
    .leftJoin(users, eq(companies.ownerId, users.id))
    .where(and(eq(companies.id, id), isNull(companies.deletedAt)))
    .limit(1);

  if (!company) return null;
  if (readLevel === 'own' && company.ownerId !== user.id) return null;

  // Fetch tags
  const companyTagRows = await db
    .select({ tag: tags })
    .from(companyTags)
    .innerJoin(tags, eq(companyTags.tagId, tags.id))
    .where(eq(companyTags.companyId, id));

  // Roll-up metrics
  const [metrics] = await db
    .select({
      contactCount: count(contacts.id),
    })
    .from(contacts)
    .where(and(eq(contacts.companyId, id), isNull(contacts.deletedAt)));

  return {
    ...company,
    tags: companyTagRows.map((r) => r.tag),
    metrics: { contactCount: metrics?.contactCount ?? 0 },
  };
}

export async function createCompany(
  user: SessionUser,
  data: Omit<NewCompany, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>
): Promise<Record<string, unknown>> {
  const [company] = await db
    .insert(companies)
    .values({ ...data, ownerId: data.ownerId ?? user.id, createdBy: user.id })
    .returning();

  eventBus.emit('company.created', { companyId: company!.id, createdBy: user.id });

  await writeAuditLog({
    userId: user.id,
    userEmail: user.email,
    action: 'create',
    entityType: 'company',
    entityId: company!.id,
    entityName: company!.name,
    changes: { name: { new: company!.name } },
  });

  return company as Record<string, unknown>;
}

export async function updateCompany(
  user: SessionUser,
  id: string,
  data: Partial<Omit<NewCompany, 'id' | 'createdAt' | 'createdBy'>>
): Promise<Record<string, unknown>> {
  const existing = await getCompanyById(user, id);
  if (!existing) throw new Error('Company not found');

  const updateLevel = getPermissionLevel(user.role.permissions, 'companies', 'update');
  if (updateLevel === 'own' && existing.ownerId !== user.id) {
    throw new Error('You can only update your own companies');
  }
  if (!updateLevel) throw new Error('Insufficient permissions');

  const [updated] = await db
    .update(companies)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(companies.id, id), isNull(companies.deletedAt)))
    .returning();

  const changes = buildChangeDiff(existing as Record<string, unknown>, updated as Record<string, unknown>);
  eventBus.emit('company.updated', { companyId: id, changes, updatedBy: user.id });

  await writeAuditLog({
    userId: user.id,
    userEmail: user.email,
    action: 'update',
    entityType: 'company',
    entityId: id,
    entityName: updated!.name,
    changes,
  });

  return updated as Record<string, unknown>;
}

export async function deleteCompany(user: SessionUser, id: string): Promise<void> {
  const company = await getCompanyById(user, id);
  if (!company) throw new Error('Company not found');

  await db
    .update(companies)
    .set({ deletedAt: new Date() })
    .where(and(eq(companies.id, id), isNull(companies.deletedAt)));

  eventBus.emit('company.deleted', { companyId: id, deletedBy: user.id });

  await writeAuditLog({
    userId: user.id,
    userEmail: user.email,
    action: 'delete',
    entityType: 'company',
    entityId: id,
    entityName: company.name as string,
  });
}

export async function addCompanyTags(user: SessionUser, companyId: string, tagIds: string[]): Promise<void> {
  for (const tagId of tagIds) {
    await db.insert(companyTags).values({ companyId, tagId, taggedBy: user.id }).onConflictDoNothing();
    await db.execute(sql`UPDATE tags SET usage_count = usage_count + 1 WHERE id = ${tagId}`);
    eventBus.emit('tag.added', { entityType: 'company', entityId: companyId, tagId, taggedBy: user.id });
  }
}

export async function removeCompanyTags(user: SessionUser, companyId: string, tagIds: string[]): Promise<void> {
  for (const tagId of tagIds) {
    await db.delete(companyTags).where(and(eq(companyTags.companyId, companyId), eq(companyTags.tagId, tagId)));
    await db.execute(sql`UPDATE tags SET usage_count = GREATEST(0, usage_count - 1) WHERE id = ${tagId}`);
    eventBus.emit('tag.removed', { entityType: 'company', entityId: companyId, tagId, untaggedBy: user.id });
  }
}
