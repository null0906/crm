import { db } from '@/server/db';
import { activities, contacts, contactTags, tags, companies, users, roles } from '@/server/db/schema';
import { eq, and, isNull, or, ilike, inArray, sql, lt, desc, asc } from 'drizzle-orm';
import type { NewContact } from '@/server/db/schema';
import type { CompanyType, ContactSource, ContactStatus, FilterConfig, PaginatedResult, SessionUser } from '@/lib/types';
import { writeAuditLog, buildChangeDiff } from './audit.service';
import eventBus from '@/server/lib/event-bus';
import { getPermissionLevel } from '@/server/lib/permissions';
import { buildFilterWhere } from './filter.service';

function normalizeCompanyName(name?: string | null): string | null {
  const normalized = name?.trim().replace(/\s+/g, ' ');
  return normalized ? normalized : null;
}

function inferCompanyTypeFromContact(status?: ContactStatus | null, source?: ContactSource | null): CompanyType {
  if (status === 'converted') return 'customer';
  if (source === 'referral') return 'partner';
  return 'prospect';
}

function shouldPromoteCompanyType(
  existingType: CompanyType | null | undefined,
  inferredType: CompanyType
): boolean {
  if (!existingType) return true;
  if (existingType === inferredType) return false;
  if (inferredType === 'prospect') return false;
  return existingType === 'prospect' || existingType === 'other';
}

function latestContactedAtSql() {
  return sql<Date | null>`
    GREATEST(
      ${contacts.lastContactedAt},
      (
        SELECT MAX(a.occurred_at)
        FROM ${activities} a
        WHERE a.contact_id = ${contacts.id}
          AND a.deleted_at IS NULL
      )
    )
  `;
}

async function resolveCompanyForContact(
  user: SessionUser,
  data: Pick<NewContact, 'companyId' | 'companyName' | 'status' | 'source'>
): Promise<{ companyId: string | null; companyName: string | null }> {
  const normalizedCompanyName = normalizeCompanyName(data.companyName);
  const inferredCompanyType = inferCompanyTypeFromContact(
    data.status as ContactStatus | null | undefined,
    data.source as ContactSource | null | undefined
  );

  if (data.companyId) {
    const [existingCompany] = await db
      .select({
        id: companies.id,
        name: companies.name,
        companyType: companies.companyType,
      })
      .from(companies)
      .where(and(eq(companies.id, data.companyId), isNull(companies.deletedAt)))
      .limit(1);

    if (!existingCompany) {
      throw new Error('Selected company was not found');
    }

    if (shouldPromoteCompanyType(existingCompany.companyType as CompanyType | null | undefined, inferredCompanyType)) {
      await db
        .update(companies)
        .set({ companyType: inferredCompanyType, updatedAt: new Date() })
        .where(eq(companies.id, existingCompany.id));
    }

    return { companyId: existingCompany.id, companyName: existingCompany.name };
  }

  if (!normalizedCompanyName) {
    return { companyId: null, companyName: null };
  }

  const [matchedCompany] = await db
    .select({
      id: companies.id,
      name: companies.name,
      companyType: companies.companyType,
    })
    .from(companies)
    .where(and(ilike(companies.name, normalizedCompanyName), isNull(companies.deletedAt)))
    .limit(1);

  if (matchedCompany) {
    if (shouldPromoteCompanyType(matchedCompany.companyType as CompanyType | null | undefined, inferredCompanyType)) {
      await db
        .update(companies)
        .set({ companyType: inferredCompanyType, updatedAt: new Date() })
        .where(eq(companies.id, matchedCompany.id));
    }

    return { companyId: matchedCompany.id, companyName: matchedCompany.name };
  }

  const [createdCompany] = await db
    .insert(companies)
    .values({
      name: normalizedCompanyName,
      companyType: inferredCompanyType,
      status: 'active',
      createdBy: user.id,
      ownerId: user.id,
    })
    .returning({
      id: companies.id,
      name: companies.name,
    });

  return {
    companyId: createdCompany!.id,
    companyName: createdCompany!.name,
  };
}

export async function listContacts(
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

  // RBAC: ownership filtering
  const readLevel = getPermissionLevel(user.role.permissions, 'contacts', 'read');

  const conditions = [isNull(contacts.deletedAt)];

  if (readLevel === 'own') {
    conditions.push(eq(contacts.ownerId, user.id));
  } else if (readLevel === 'team') {
    // For now, team = all (can be scoped by team logic later)
  } else if (!readLevel) {
    return { items: [], nextCursor: null, hasMore: false };
  }

  // Search
  if (search && search.trim()) {
    const searchTokens = search
      .trim()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);

    const tokenConditions = searchTokens.map((token) => {
      const searchTerm = `%${token}%`;
      return or(
        ilike(contacts.firstName, searchTerm),
        ilike(contacts.lastName, searchTerm),
        ilike(contacts.email, searchTerm),
        ilike(contacts.phone, searchTerm),
        ilike(contacts.jobTitle, searchTerm),
        ilike(sql<string>`concat(${contacts.firstName}, ' ', ${contacts.lastName})`, searchTerm)
      )!;
    });

    if (tokenConditions.length > 0) {
      conditions.push(and(...tokenConditions)!);
    }
  }

  // Custom filters
  if (filters?.conditions?.length) {
    const filterWhere = buildFilterWhere(filters, 'contact');
    if (filterWhere) conditions.push(filterWhere);
  }

  // Cursor pagination
  if (pagination.cursor) {
    try {
      const [cursorDate, cursorId] = pagination.cursor.split('__');
      if (cursorDate && cursorId) {
        conditions.push(
          or(
            lt(contacts.createdAt, new Date(cursorDate)),
            and(eq(contacts.createdAt, new Date(cursorDate)), lt(contacts.id, cursorId))
          )!
        );
      }
    } catch {
      // invalid cursor, ignore
    }
  }

  const sortField = sort?.field ?? 'createdAt';
  const sortDir = sort?.direction ?? 'desc';

  const rows = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      secondaryEmail: contacts.secondaryEmail,
      phone: contacts.phone,
      mobile: contacts.mobile,
      jobTitle: contacts.jobTitle,
      department: contacts.department,
      status: contacts.status,
      source: contacts.source,
      leadScore: contacts.leadScore,
      city: contacts.city,
      state: contacts.state,
      postalCode: contacts.postalCode,
      country: contacts.country,
      location: contacts.location,
      linkedinUrl: contacts.linkedinUrl,
      description: contacts.description,
      ownerId: contacts.ownerId,
      companyId: contacts.companyId,
      customFields: contacts.customFields,
      lastContactedAt: latestContactedAtSql(),
      createdAt: contacts.createdAt,
      updatedAt: contacts.updatedAt,
      ownerFirstName: users.firstName,
      ownerLastName: users.lastName,
      companyName: sql<string | null>`COALESCE(${companies.name}, ${contacts.companyName})`,
    })
    .from(contacts)
    .leftJoin(users, eq(contacts.ownerId, users.id))
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(and(...conditions))
    .orderBy(sortDir === 'desc' ? desc(contacts.createdAt) : asc(contacts.createdAt), desc(contacts.id))
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

export async function getContactsByCompany(
  user: SessionUser,
  companyId: string
): Promise<Record<string, unknown>[]> {
  const readLevel = getPermissionLevel(user.role.permissions, 'contacts', 'read');
  if (!readLevel) return [];

  const conditions = [
    isNull(contacts.deletedAt),
    eq(contacts.companyId, companyId),
    ...(readLevel === 'own' ? [eq(contacts.ownerId, user.id)] : []),
  ];

  const rows = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      jobTitle: contacts.jobTitle,
      status: contacts.status,
      createdAt: contacts.createdAt,
    })
    .from(contacts)
    .where(and(...conditions))
    .orderBy(desc(contacts.createdAt));

  return rows as Record<string, unknown>[];
}

export async function getContactById(
  user: SessionUser,
  id: string
): Promise<Record<string, unknown> | null> {
  const readLevel = getPermissionLevel(user.role.permissions, 'contacts', 'read');
  if (!readLevel) return null;

  const [contact] = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      secondaryEmail: contacts.secondaryEmail,
      phone: contacts.phone,
      mobile: contacts.mobile,
      jobTitle: contacts.jobTitle,
      department: contacts.department,
      companyName: sql<string | null>`COALESCE(${companies.name}, ${contacts.companyName})`,
      companyId: contacts.companyId,
      linkedinUrl: contacts.linkedinUrl,
      source: contacts.source,
      status: contacts.status,
      leadScore: contacts.leadScore,
      ownerId: contacts.ownerId,
      addressLine1: contacts.addressLine1,
      addressLine2: contacts.addressLine2,
      city: contacts.city,
      state: contacts.state,
      postalCode: contacts.postalCode,
      country: contacts.country,
      location: contacts.location,
      description: contacts.description,
      customFields: contacts.customFields,
      lastContactedAt: latestContactedAtSql(),
      createdAt: contacts.createdAt,
      updatedAt: contacts.updatedAt,
      deletedAt: contacts.deletedAt,
      ownerFirstName: users.firstName,
      ownerLastName: users.lastName,
    })
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .leftJoin(users, eq(contacts.ownerId, users.id))
    .where(and(eq(contacts.id, id), isNull(contacts.deletedAt)))
    .limit(1);

  if (!contact) return null;

  if (readLevel === 'own' && contact.ownerId !== user.id) return null;

  // Fetch tags
  const contactTagRows = await db
    .select({ tag: tags })
    .from(contactTags)
    .innerJoin(tags, eq(contactTags.tagId, tags.id))
    .where(eq(contactTags.contactId, id));

  return { ...contact, tags: contactTagRows.map((r) => r.tag) };
}

export async function createContact(
  user: SessionUser,
  data: Omit<NewContact, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>
): Promise<Record<string, unknown>> {
  const resolvedCompany = await resolveCompanyForContact(user, data);

  const [contact] = await db
    .insert(contacts)
    .values({
      ...data,
      ownerId: data.ownerId ?? user.id,
      companyId: resolvedCompany.companyId,
      companyName: resolvedCompany.companyName,
      createdBy: user.id,
    })
    .returning();

  eventBus.emit('contact.created', { contactId: contact!.id, createdBy: user.id });

  await writeAuditLog({
    userId: user.id,
    userEmail: user.email,
    action: 'create',
    entityType: 'contact',
    entityId: contact!.id,
    entityName: `${contact!.firstName} ${contact!.lastName}`,
    changes: { firstName: { new: contact!.firstName }, lastName: { new: contact!.lastName }, email: { new: contact!.email } },
  });

  return contact as Record<string, unknown>;
}

export async function updateContact(
  user: SessionUser,
  id: string,
  data: Partial<Omit<NewContact, 'id' | 'createdAt' | 'createdBy'>>
): Promise<Record<string, unknown>> {
  const updateLevel = getPermissionLevel(user.role.permissions, 'contacts', 'update');
  if (!updateLevel) throw new Error('Insufficient permissions');

  const existing = await getContactById(user, id);
  if (!existing) throw new Error('Contact not found');

  if (updateLevel === 'own' && existing.ownerId !== user.id) {
    throw new Error('You can only update your own contacts');
  }

  let resolvedCompanyUpdate: Partial<Pick<NewContact, 'companyId' | 'companyName'>> = {};
  if ('companyId' in data || 'companyName' in data || data.status !== undefined || data.source !== undefined) {
    resolvedCompanyUpdate = await resolveCompanyForContact(user, {
      companyId: data.companyId ?? (existing.companyId as string | null | undefined) ?? null,
      companyName: data.companyName ?? (existing.companyName as string | null | undefined) ?? null,
      status: (data.status ?? existing.status) as NewContact['status'],
      source: (data.source ?? existing.source) as NewContact['source'],
    });
  }

  const [updated] = await db
    .update(contacts)
    .set({ ...data, ...resolvedCompanyUpdate, updatedAt: new Date() })
    .where(and(eq(contacts.id, id), isNull(contacts.deletedAt)))
    .returning();

  const changes = buildChangeDiff(existing as Record<string, unknown>, updated as Record<string, unknown>);

  eventBus.emit('contact.updated', { contactId: id, changes, updatedBy: user.id });

  await writeAuditLog({
    userId: user.id,
    userEmail: user.email,
    action: 'update',
    entityType: 'contact',
    entityId: id,
    entityName: `${updated!.firstName} ${updated!.lastName}`,
    changes,
  });

  return updated as Record<string, unknown>;
}

export async function deleteContact(user: SessionUser, id: string): Promise<void> {
  const contact = await getContactById(user, id);
  if (!contact) throw new Error('Contact not found');

  await db
    .update(contacts)
    .set({ deletedAt: new Date() })
    .where(and(eq(contacts.id, id), isNull(contacts.deletedAt)));

  eventBus.emit('contact.deleted', { contactId: id, deletedBy: user.id });

  await writeAuditLog({
    userId: user.id,
    userEmail: user.email,
    action: 'delete',
    entityType: 'contact',
    entityId: id,
    entityName: `${contact.firstName} ${contact.lastName}`,
  });
}

export async function addContactTags(
  user: SessionUser,
  contactId: string,
  tagIds: string[]
): Promise<void> {
  for (const tagId of tagIds) {
    await db
      .insert(contactTags)
      .values({ contactId, tagId, taggedBy: user.id })
      .onConflictDoNothing();

    // Increment usage count
    await db.execute(sql`UPDATE tags SET usage_count = usage_count + 1 WHERE id = ${tagId}`);

    eventBus.emit('tag.added', { entityType: 'contact', entityId: contactId, tagId, taggedBy: user.id });

    await writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: 'tag_add',
      entityType: 'contact',
      entityId: contactId,
      changes: { tagId: { new: tagId } },
    });
  }
}

export async function removeContactTags(
  user: SessionUser,
  contactId: string,
  tagIds: string[]
): Promise<void> {
  for (const tagId of tagIds) {
    await db
      .delete(contactTags)
      .where(and(eq(contactTags.contactId, contactId), eq(contactTags.tagId, tagId)));

    await db.execute(sql`UPDATE tags SET usage_count = GREATEST(0, usage_count - 1) WHERE id = ${tagId}`);

    eventBus.emit('tag.removed', { entityType: 'contact', entityId: contactId, tagId, untaggedBy: user.id });

    await writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: 'tag_remove',
      entityType: 'contact',
      entityId: contactId,
      changes: { tagId: { old: tagId } },
    });
  }
}

export async function bulkUpdateContacts(
  user: SessionUser,
  ids: string[],
  data: { ownerId?: string | null; status?: string; tagIdsToAdd?: string[]; tagIdsToRemove?: string[] }
): Promise<{ updated: number }> {
  if (!ids.length) return { updated: 0 };

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (data.ownerId !== undefined) updateData.ownerId = data.ownerId;
  if (data.status) updateData.status = data.status;

  if (Object.keys(updateData).length > 1) {
    await db
      .update(contacts)
      .set(updateData as Partial<typeof contacts.$inferInsert>)
      .where(and(inArray(contacts.id, ids), isNull(contacts.deletedAt)));
  }

  for (const id of ids) {
    if (data.tagIdsToAdd?.length) await addContactTags(user, id, data.tagIdsToAdd);
    if (data.tagIdsToRemove?.length) await removeContactTags(user, id, data.tagIdsToRemove);
  }

  await writeAuditLog({
    userId: user.id,
    userEmail: user.email,
    action: 'bulk_update',
    entityType: 'contact',
    metadata: { ids, changes: data },
  });

  return { updated: ids.length };
}
