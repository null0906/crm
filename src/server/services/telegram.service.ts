/**
 * Telegram bot command handler.
 * Authenticates callers, routes commands, calls existing CRM services,
 * formats responses, and logs all interactions.
 */

import { db } from '@/server/db';
import {
  telegramUsers,
  telegramMessageLog,
  users,
  roles,
  contacts,
  companies,
  tags,
  contactTags,
  activities,
  deals,
} from '@/server/db/schema';
import { eq, and, isNull, ilike, or, count, sql, lt, gte } from 'drizzle-orm';
import * as contactService from './contact.service';
import * as companyService from './company.service';
import { writeAuditLog } from './audit.service';
import { sendMessage } from '@/server/lib/telegram-bot';
import {
  parseStructuredMessage,
  parseName,
  parseTags,
  parsePhone,
  validateEmail,
  normalizeDomain,
} from '@/server/lib/telegram-parser';
import type { SessionUser } from '@/lib/types';

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function notifyUser(userId: string, message: string): Promise<boolean> {
  const [record] = await db
    .select({ telegramUserId: telegramUsers.telegramUserId })
    .from(telegramUsers)
    .where(and(eq(telegramUsers.crmUserId, userId), eq(telegramUsers.isActive, true)))
    .limit(1);

  if (!record) return false;

  await sendMessage(record.telegramUserId, message, 'Markdown');
  return true;
}

async function getAuthorizedUser(telegramUserId: number): Promise<{
  sessionUser: SessionUser;
  telegramRecord: typeof telegramUsers.$inferSelect;
} | null> {
  const [record] = await db
    .select({
      tg: telegramUsers,
      user: {
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        avatarUrl: users.avatarUrl,
        roleId: users.roleId,
      },
      role: {
        id: roles.id,
        name: roles.name,
        slug: roles.slug,
        permissions: roles.permissions,
      },
    })
    .from(telegramUsers)
    .innerJoin(users, eq(telegramUsers.crmUserId, users.id))
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(
      and(
        eq(telegramUsers.telegramUserId, telegramUserId),
        eq(telegramUsers.isActive, true)
      )
    )
    .limit(1);

  if (!record) return null;

  const sessionUser: SessionUser = {
    id: record.user.id,
    email: record.user.email,
    firstName: record.user.firstName,
    lastName: record.user.lastName,
    avatarUrl: record.user.avatarUrl,
    roleId: record.user.roleId,
    role: {
      id: record.role.id,
      name: record.role.name,
      slug: record.role.slug,
      permissions: record.role.permissions as SessionUser['role']['permissions'],
    },
  };

  return { sessionUser, telegramRecord: record.tg };
}

// ── Logging ───────────────────────────────────────────────────────────────────

async function logMessage(params: {
  telegramUserId: number;
  direction: 'inbound' | 'outbound';
  command?: string;
  rawMessage?: string;
  parsedData?: unknown;
  resultStatus: 'success' | 'error' | 'unauthorized' | 'ignored';
  resultMessage?: string;
  entityType?: string;
  entityId?: string;
}) {
  try {
    await db.insert(telegramMessageLog).values({
      telegramUserId: params.telegramUserId,
      direction: params.direction,
      command: params.command,
      rawMessage: params.rawMessage,
      parsedData: params.parsedData as Record<string, unknown> ?? null,
      resultStatus: params.resultStatus,
      resultMessage: params.resultMessage,
      entityType: params.entityType,
      entityId: params.entityId,
    });
  } catch (err) {
    console.error('[TelegramLog] Failed to log message:', err);
  }
}

// ── Tag helpers ───────────────────────────────────────────────────────────────

async function resolveOrCreateTags(
  tagNames: string[],
  createdBy: string
): Promise<string[]> {
  const ids: string[] = [];
  for (const name of tagNames) {
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const [existing] = await db
      .select({ id: tags.id })
      .from(tags)
      .where(ilike(tags.name, name))
      .limit(1);

    if (existing) {
      ids.push(existing.id);
    } else {
      const [created] = await db
        .insert(tags)
        .values({ name, slug: `${slug}-${Date.now()}`, color: '#6B7280', createdBy })
        .returning({ id: tags.id });
      if (created) ids.push(created.id);
    }
  }
  return ids;
}

// ── Command Handlers ──────────────────────────────────────────────────────────

async function handleAdd(
  fields: Record<string, string>,
  sessionUser: SessionUser
): Promise<{ text: string; entityType?: string; entityId?: string }> {
  const nameRaw = fields['name'] ?? fields['full name'];
  if (!nameRaw) {
    return { text: '❌ Missing required field: name\nUsage:\n/add\nname: John Smith\nemail: john@example.com' };
  }

  const { firstName, lastName } = parseName(nameRaw);
  if (!firstName) {
    return { text: '❌ Could not parse name. Use "First Last" format.' };
  }

  const companyName = fields['company'];
  const email = fields['email'];
  if (email && !validateEmail(email)) {
    return { text: `❌ Invalid email address: ${email}` };
  }

  const phone = fields['phone'] ? parsePhone(fields['phone']) : undefined;
  const tagNames = fields['tags'] ? parseTags(fields['tags']) : [];
  const tagIds = tagNames.length
    ? await resolveOrCreateTags(tagNames, sessionUser.id)
    : [];

  const statusMap: Record<string, string> = {
    new: 'new', contacted: 'contacted', qualified: 'qualified',
    unqualified: 'unqualified', nurturing: 'nurturing',
    converted: 'converted', lost: 'lost', archived: 'archived',
  };
  const statusRaw = (fields['status'] ?? 'new').toLowerCase();
  const status = (statusMap[statusRaw] ?? 'new') as import('@/lib/types').ContactStatus;

  const sourceMap: Record<string, string> = {
    apollo: 'apollo', manual: 'manual', website: 'website',
    referral: 'referral', event: 'event', cold_outreach: 'cold_outreach',
  };
  const sourceRaw = (fields['source'] ?? '').toLowerCase();
  const source = sourceMap[sourceRaw] as import('@/lib/types').ContactSource | undefined;

  const contact = await contactService.createContact(sessionUser, {
    firstName,
    lastName,
    email: email || undefined,
    phone,
    jobTitle: fields['title'] ?? fields['job title'],
    description: fields['notes'] ?? fields['note'],
    companyName,
    ownerId: sessionUser.id,
    status,
    source,
  });

  if (tagIds.length) {
    await contactService.addContactTags(sessionUser, contact.id as string, tagIds);
  }

  await writeAuditLog({
    userId: sessionUser.id,
    userEmail: sessionUser.email,
    action: 'create',
    entityType: 'contact',
    entityId: contact.id as string,
    entityName: `${firstName} ${lastName}`,
    metadata: { source: 'telegram' },
  });

  const lines = [
    `✅ Contact created: *${firstName} ${lastName}*`,
    email ? `📧 ${email}` : '',
    phone ? `📞 ${phone}` : '',
    companyName ? `🏢 ${companyName}` : '',
    tagNames.length ? `🏷 ${tagNames.join(', ')}` : '',
  ].filter(Boolean);

  return {
    text: lines.join('\n'),
    entityType: 'contact',
    entityId: contact.id as string,
  };
}

async function handleAddCompany(
  fields: Record<string, string>,
  sessionUser: SessionUser
): Promise<{ text: string; entityType?: string; entityId?: string }> {
  const name = fields['name'];
  if (!name) {
    return { text: '❌ Missing required field: name\nUsage:\n/addcompany\nname: Acme Corp\ndomain: acme.com' };
  }

  const domain = fields['domain'] ? normalizeDomain(fields['domain']) : undefined;
  const tagNames = fields['tags'] ? parseTags(fields['tags']) : [];
  const tagIds = tagNames.length
    ? await resolveOrCreateTags(tagNames, sessionUser.id)
    : [];

  const company = await companyService.createCompany(sessionUser, {
    name,
    domain,
    industry: fields['industry'],
    companySize: fields['size'] as import('@/lib/types').CompanySize | undefined,
    companyType: fields['type'] as import('@/lib/types').CompanyType | undefined,
    phone: fields['phone'] ? parsePhone(fields['phone']) : undefined,
    city: fields['city'],
    country: fields['country'],
    description: fields['notes'] ?? fields['note'],
    status: 'active',
  });

  if (tagIds.length) {
    await companyService.addCompanyTags(sessionUser, company.id as string, tagIds);
  }

  await writeAuditLog({
    userId: sessionUser.id,
    userEmail: sessionUser.email,
    action: 'create',
    entityType: 'company',
    entityId: company.id as string,
    entityName: name,
    metadata: { source: 'telegram' },
  });

  const lines = [
    `✅ Company created: *${name}*`,
    domain ? `🌐 ${domain}` : '',
    fields['industry'] ? `🏭 ${fields['industry']}` : '',
    tagNames.length ? `🏷 ${tagNames.join(', ')}` : '',
  ].filter(Boolean);

  return { text: lines.join('\n'), entityType: 'company', entityId: company.id as string };
}

async function handleNote(
  fields: Record<string, string>,
  sessionUser: SessionUser,
  forceType?: string
): Promise<{ text: string; entityType?: string; entityId?: string }> {
  const contactRef = fields['contact'] ?? fields['to'] ?? fields['for'];
  if (!contactRef) {
    return { text: '❌ Missing field: contact\nSpecify by email or full name.' };
  }

  // Look up contact by email or name
  let contactId: string | undefined;
  let contactName = '';

  if (contactRef.includes('@')) {
    const [found] = await db
      .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName })
      .from(contacts)
      .where(and(ilike(contacts.email, contactRef.trim()), isNull(contacts.deletedAt)))
      .limit(1);
    if (found) {
      contactId = found.id;
      contactName = `${found.firstName} ${found.lastName}`;
    }
  } else {
    const { firstName, lastName } = parseName(contactRef);
    const rows = await db
      .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName })
      .from(contacts)
      .where(
        and(
          isNull(contacts.deletedAt),
          or(
            and(ilike(contacts.firstName, firstName), ilike(contacts.lastName, lastName || '%')),
            ilike(contacts.firstName, `%${contactRef}%`)
          )
        )
      )
      .limit(5);

    if (rows.length === 1) {
      contactId = rows[0]!.id;
      contactName = `${rows[0]!.firstName} ${rows[0]!.lastName}`;
    } else if (rows.length > 1) {
      const list = rows.map((r, i) => `${i + 1}. ${r.firstName} ${r.lastName}`).join('\n');
      return {
        text: `⚠️ Multiple contacts found for "${contactRef}". Please use their email:\n${list}`,
      };
    }
  }

  if (!contactId) {
    return { text: `❌ Contact not found: ${contactRef}` };
  }

  const activityTypeRaw = forceType ?? fields['type'] ?? 'note';
  const validTypes = ['call', 'email_sent', 'email_received', 'meeting', 'note', 'task', 'sms', 'whatsapp', 'linkedin', 'demo', 'proposal', 'document', 'custom'];
  const activityType = (validTypes.includes(activityTypeRaw) ? activityTypeRaw : 'note') as import('@/lib/types').ActivityType;

  const durationRaw = fields['duration'];
  const callDurationSeconds = durationRaw ? parseInt(durationRaw, 10) * 60 : undefined;

  const outcomeMap: Record<string, string> = {
    connected: 'connected', voicemail: 'voicemail', no_answer: 'no_answer', busy: 'busy', wrong_number: 'wrong_number',
  };
  const callOutcome = fields['outcome'] ? outcomeMap[fields['outcome'].toLowerCase()] as import('@/lib/types').CallOutcome | undefined : undefined;

  const [activity] = await db
    .insert(activities)
    .values({
      activityType,
      subject: fields['subject'] ?? `${activityType} with ${contactName}`,
      body: fields['body'] ?? fields['notes'] ?? fields['note'],
      contactId,
      performedBy: sessionUser.id,
      callDurationSeconds: callDurationSeconds ?? null,
      callOutcome: callOutcome ?? null,
      isAutomated: false,
      metadata: { source: 'telegram' },
    })
    .returning();

  await writeAuditLog({
    userId: sessionUser.id,
    userEmail: sessionUser.email,
    action: 'create',
    entityType: 'activity',
    entityId: activity!.id,
    entityName: activity!.subject ?? activityType,
    metadata: { source: 'telegram' },
  });

  return {
    text: `✅ ${activityType.replace('_', ' ')} logged for *${contactName}*`,
    entityType: 'activity',
    entityId: activity!.id,
  };
}

async function handleFind(
  searchTerm: string
): Promise<{ text: string }> {
  const term = `%${searchTerm}%`;

  // Search contacts
  const contactRows = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      jobTitle: contacts.jobTitle,
      status: contacts.status,
      companyId: contacts.companyId,
      lastContactedAt: contacts.lastContactedAt,
    })
    .from(contacts)
    .where(
      and(
        isNull(contacts.deletedAt),
        or(
          ilike(contacts.email, searchTerm.includes('@') ? searchTerm : term),
          ilike(contacts.firstName, term),
          ilike(contacts.lastName, term)
        )
      )
    )
    .limit(1);

  if (contactRows[0]) {
    const c = contactRows[0];
    let companyName = '';
    if (c.companyId) {
      const [co] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, c.companyId)).limit(1);
      companyName = co?.name ?? '';
    }

    const tagRows = await db
      .select({ name: tags.name })
      .from(contactTags)
      .innerJoin(tags, eq(contactTags.tagId, tags.id))
      .where(eq(contactTags.contactId, c.id));

    const openDeals = await db
      .select({ count: count() })
      .from(deals)
      .where(and(eq(deals.primaryContactId, c.id), eq(deals.status, 'open'), isNull(deals.deletedAt)));

    const lines = [
      `👤 *${c.firstName} ${c.lastName}*`,
      c.jobTitle ? `💼 ${c.jobTitle}` : '',
      companyName ? `🏢 ${companyName}` : '',
      c.email ? `📧 ${c.email}` : '',
      c.phone ? `📞 ${c.phone}` : '',
      `📊 Status: ${c.status}`,
      tagRows.length ? `🏷 ${tagRows.map((t) => t.name).join(', ')}` : '',
      c.lastContactedAt ? `🕐 Last contacted: ${c.lastContactedAt.toLocaleDateString()}` : '',
      `💼 Open prospects: ${openDeals[0]?.count ?? 0}`,
    ].filter(Boolean);

    return { text: lines.join('\n') };
  }

  // Search companies
  const companyRows = await db
    .select({ id: companies.id, name: companies.name, domain: companies.domain, industry: companies.industry, city: companies.city })
    .from(companies)
    .where(and(isNull(companies.deletedAt), or(ilike(companies.name, term), ilike(companies.domain, term))))
    .limit(1);

  if (companyRows[0]) {
    const co = companyRows[0];
    const contactCount = await db.select({ count: count() }).from(contacts).where(and(eq(contacts.companyId, co.id), isNull(contacts.deletedAt)));
    const lines = [
      `🏢 *${co.name}*`,
      co.domain ? `🌐 ${co.domain}` : '',
      co.industry ? `🏭 ${co.industry}` : '',
      co.city ? `📍 ${co.city}` : '',
      `👥 Contacts: ${contactCount[0]?.count ?? 0}`,
    ].filter(Boolean);
    return { text: lines.join('\n') };
  }

  return { text: `🔍 No results found for "${searchTerm}"` };
}

async function handleToday(): Promise<{ text: string }> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Open pipeline
  const [openPipeline] = await db
    .select({
      dealCount: count(),
      totalValue: sql<string>`COALESCE(SUM(CAST(amount AS NUMERIC)), 0)`,
    })
    .from(deals)
    .where(and(eq(deals.status, 'open'), isNull(deals.deletedAt)));

  // Won this month
  const [wonMonth] = await db
    .select({ count: count(), total: sql<string>`COALESCE(SUM(CAST(amount AS NUMERIC)), 0)` })
    .from(deals)
    .where(and(eq(deals.status, 'won'), isNull(deals.deletedAt), gte(deals.actualCloseDate, startOfMonth.toISOString().split('T')[0]!)));

  // Lost this month
  const [lostMonth] = await db
    .select({ count: count() })
    .from(deals)
    .where(and(eq(deals.status, 'lost'), isNull(deals.deletedAt), gte(deals.actualCloseDate, startOfMonth.toISOString().split('T')[0]!)));

  // Today's activities
  const [todayActivities] = await db
    .select({ count: count() })
    .from(activities)
    .where(and(isNull(activities.deletedAt), gte(activities.occurredAt, todayStart)));

  // Stale prospects (no activity in 7 days)
  const staleDealsResult = await db
    .select({ dealId: deals.id })
    .from(deals)
    .where(and(eq(deals.status, 'open'), isNull(deals.deletedAt), lt(deals.updatedAt, sevenDaysAgo)));

  // Unassigned contacts
  const [unassigned] = await db
    .select({ count: count() })
    .from(contacts)
    .where(and(isNull(contacts.ownerId), isNull(contacts.deletedAt)));

  const fmt = (n: number | string) => {
    const num = typeof n === 'string' ? parseFloat(n) : n;
    if (num >= 10000000) return `₹${(num / 10000000).toFixed(1)}Cr`;
    if (num >= 100000) return `₹${(num / 100000).toFixed(1)}L`;
    return `₹${num.toLocaleString()}`;
  };

  const lines = [
    `📊 *SecComply Daily Snapshot*`,
    `📅 ${now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}`,
    ``,
    `💰 *Pipeline*`,
    `  Open prospects: ${openPipeline?.dealCount ?? 0} (${fmt(openPipeline?.totalValue ?? 0)})`,
    `  Won this month: ${wonMonth?.count ?? 0} (${fmt(wonMonth?.total ?? 0)})`,
    `  Lost this month: ${lostMonth?.count ?? 0}`,
    ``,
    `⚡ *Today*`,
    `  Activities logged: ${todayActivities?.count ?? 0}`,
    `  Stale prospects (>7d): ${staleDealsResult.length}`,
    `  Unassigned leads: ${unassigned?.count ?? 0}`,
  ];

  return { text: lines.join('\n') };
}

async function handleMyTasks(sessionUser: SessionUser): Promise<{ text: string }> {
  const today = new Date().toISOString().split('T')[0]!;

  const rows = await db
    .select({
      id: activities.id,
      subject: activities.subject,
      taskDueDate: activities.taskDueDate,
      taskPriority: activities.taskPriority,
    })
    .from(activities)
    .where(
      and(
        eq(activities.activityType, 'task'),
        isNull(activities.taskCompletedAt),
        eq(activities.performedBy, sessionUser.id),
        isNull(activities.deletedAt)
      )
    )
    .orderBy(activities.taskDueDate)
    .limit(20);

  if (!rows.length) {
    return { text: '✅ No open tasks. You\'re all caught up!' };
  }

  const overdue = rows.filter((r) => r.taskDueDate && r.taskDueDate < today);
  const dueToday = rows.filter((r) => r.taskDueDate === today);
  const upcoming = rows.filter((r) => !r.taskDueDate || r.taskDueDate > today).slice(0, 5);

  const formatTask = (r: typeof rows[0]) =>
    `  • ${r.subject ?? 'Untitled task'}${r.taskDueDate ? ` (${r.taskDueDate})` : ''}`;

  const lines = ['📋 *My Tasks*', ''];
  if (overdue.length) {
    lines.push(`🔴 *Overdue (${overdue.length})*`);
    lines.push(...overdue.map(formatTask));
    lines.push('');
  }
  if (dueToday.length) {
    lines.push(`🟡 *Due Today (${dueToday.length})*`);
    lines.push(...dueToday.map(formatTask));
    lines.push('');
  }
  if (upcoming.length) {
    lines.push(`🟢 *Upcoming (${upcoming.length})*`);
    lines.push(...upcoming.map(formatTask));
  }

  return { text: lines.join('\n') };
}

const HELP_TEXT = `*SecComply CRM Bot Commands*

/add — Add a new contact
  name: Full Name _(required)_
  email: address@example.com
  phone: +91 99999 99999
  company: Company Name
  title: Job Title
  tags: tag1, tag2
  status: new|contacted|qualified
  notes: Any free text

/addcompany — Add a new company
  name: Company Name _(required)_
  domain: example.com
  industry: Technology
  size: 11-50
  type: prospect|customer|partner
  city: Mumbai
  country: India
  tags: tag1, tag2

/note — Log an activity
  contact: email or full name _(required)_
  type: call|note|email_sent|meeting|task
  subject: Short description
  body: Detailed notes
  duration: Minutes (for calls)
  outcome: connected|voicemail|no_answer

/log — Shorthand for /note with type: call
  contact: email or name _(required)_
  subject: Call subject
  body: Notes
  duration: Minutes

/find <search term> — Search contacts and companies

/today — Daily pipeline & activity snapshot

/mytasks — Your open tasks

/help — Show this message`;

// ── Main Entry Point ──────────────────────────────────────────────────────────

export async function handleMessage(
  telegramUserId: number,
  messageText: string,
  senderInfo?: { username?: string }
): Promise<void> {
  // Update last active timestamp in background (don't await)
  db.update(telegramUsers)
    .set({ lastActiveAt: new Date(), telegramUsername: senderInfo?.username })
    .where(eq(telegramUsers.telegramUserId, telegramUserId))
    .catch(() => {});

  const auth = await getAuthorizedUser(telegramUserId);

  if (!auth) {
    await sendMessage(
      telegramUserId,
      'Your Telegram account is not linked to a CRM user. Contact your admin to set up access.'
    );
    await logMessage({
      telegramUserId,
      direction: 'inbound',
      rawMessage: messageText,
      resultStatus: 'unauthorized',
      resultMessage: 'No matching telegram_users record',
    });
    return;
  }

  const { sessionUser } = auth;
  const parsed = parseStructuredMessage(messageText);

  let responseText = '';
  let entityType: string | undefined;
  let entityId: string | undefined;
  let status: 'success' | 'error' = 'success';

  try {
    switch (parsed.command) {
      case '/add': {
        const result = await handleAdd(parsed.fields, sessionUser);
        responseText = result.text;
        entityType = result.entityType;
        entityId = result.entityId;
        if (result.text.startsWith('❌')) status = 'error';
        break;
      }
      case '/addcompany': {
        const result = await handleAddCompany(parsed.fields, sessionUser);
        responseText = result.text;
        entityType = result.entityType;
        entityId = result.entityId;
        if (result.text.startsWith('❌')) status = 'error';
        break;
      }
      case '/note': {
        const result = await handleNote(parsed.fields, sessionUser);
        responseText = result.text;
        entityType = result.entityType;
        entityId = result.entityId;
        if (result.text.startsWith('❌')) status = 'error';
        break;
      }
      case '/log': {
        const result = await handleNote({ ...parsed.fields, type: 'call' }, sessionUser, 'call');
        responseText = result.text;
        entityType = result.entityType;
        entityId = result.entityId;
        if (result.text.startsWith('❌')) status = 'error';
        break;
      }
      case '/find': {
        const result = await handleFind(parsed.searchArg ?? '');
        responseText = result.text;
        break;
      }
      case '/today': {
        const result = await handleToday();
        responseText = result.text;
        break;
      }
      case '/mytasks': {
        const result = await handleMyTasks(sessionUser);
        responseText = result.text;
        break;
      }
      case '/help': {
        responseText = HELP_TEXT;
        break;
      }
      case '/start': {
        responseText = `Welcome to SecComply CRM Bot, ${sessionUser.firstName}! 👋\nUse /help to see available commands.`;
        break;
      }
      default: {
        if (parsed.command) {
          responseText = 'Unknown command. Use /help to see available commands.';
        } else {
          responseText = 'Send a /command to interact with CRM. Use /help for a list of commands.';
        }
        status = 'error';
      }
    }
  } catch (err) {
    console.error(`[TelegramBot] Error handling command ${parsed.command}:`, err);
    responseText = `❌ An error occurred: ${err instanceof Error ? err.message : 'Unknown error'}`;
    status = 'error';
  }

  // Truncate to Telegram's 4096 char limit
  if (responseText.length > 4096) {
    responseText = responseText.slice(0, 4050) + '\n\n_(message truncated)_';
  }

  await sendMessage(telegramUserId, responseText, 'Markdown');

  await logMessage({
    telegramUserId,
    direction: 'inbound',
    command: parsed.command,
    rawMessage: messageText,
    parsedData: { fields: parsed.fields, errors: parsed.errors },
    resultStatus: status,
    resultMessage: responseText,
    entityType,
    entityId,
  });
}
