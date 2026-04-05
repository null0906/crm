import { db } from '@/server/db';
import { contacts, contactTags, tags, companies, users, roles } from '@/server/db/schema';
import { eq, and, isNull, or, ilike, inArray, sql, lt, desc, asc } from 'drizzle-orm';
import type { NewContact } from '@/server/db/schema';
import type { FilterConfig, PaginatedResult, SessionUser } from '@/lib/types';
import { writeAuditLog, buildChangeDiff } from './audit.service';
import eventBus from '@/server/lib/event-bus';
import { getPermissionLevel } from '@/server/lib/permissions';
import { buildFilterWhere } from './filter.service';

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
  const limit = Math.min(pagination.limit, 200);

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
    const searchTerm = `%${search.trim()}%`;
    conditions.push(
      or(
        ilike(contacts.firstName, searchTerm),
        ilike(contacts.lastName, searchTerm),
        ilike(contacts.email, searchTerm),
        ilike(contacts.phone, searchTerm),
        ilike(contacts.jobTitle, searchTerm)
      )!
    );
  }

  // Custom filters
  if (filters?.conditions?.length) {
    const filterWhere = buildFilterWhere(filters, 'contacts');
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
      phone: contacts.phone,
      mobile: contacts.mobile,
      jobTitle: contacts.jobTitle,
      department: contacts.department,
      status: contacts.status,
      source: contacts.source,
      leadScore: contacts.leadScore,
      ownerId: contacts.ownerId,
      companyId: contacts.companyId,
      customFields: contacts.customFields,
      lastContactedAt: contacts.lastContactedAt,
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

export async function getContactById(
  user: SessionUser,
  id: string
): Promise<Record<string, unknown> | null> {
  const readLevel = getPermissionLevel(user.role.permissions, 'contacts', 'read');
  if (!readLevel) return null;

  const [contact] = await db
    .select()
    .from(contacts)
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
  const [contact] = await db
    .insert(contacts)
    .values({ ...data, createdBy: user.id })
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

  const [updated] = await db
    .update(contacts)
    .set({ ...data, updatedAt: new Date() })
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
