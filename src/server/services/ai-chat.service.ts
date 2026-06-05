import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db as defaultDb } from '@/server/db';
import {
  activities,
  aiChatMessages,
  aiChatSessions,
  companies,
  contacts,
  contactTags,
  deals,
  pipelines,
  roles,
  tagCategories,
  tags,
  users,
} from '@/server/db/schema';
import { writeAuditLog } from './audit.service';
import { executeSafeQuery, validateGeneratedSql } from './sql-safety.service';
import { generateChatResponse, type GeminiHistoryMessage } from './gemini.service';
import type { RolePermissions } from '@/lib/types';

type DbClient = typeof defaultDb;

type UserContext = {
  userId: string;
  userName: string;
  role: string;
  permissions: RolePermissions;
};

type ClarificationOption = {
  id?: string;
  label: string;
  count?: number;
};

type AmbiguityCheck = {
  isAmbiguous: boolean;
  clarificationNeeded: string;
  question?: string;
  options?: ClarificationOption[];
};

type ParsedGeminiResponse =
  | { phase: 'clarify'; question: string; options?: ClarificationOption[] }
  | { phase: 'query'; sql: string; explanation?: string }
  | { phase: 'answer'; answer: string; followUpSuggestions?: string[] }
  | null;

export type AiChatResponse = {
  message: {
    id: string;
    role: 'assistant';
    content: string;
    options?: ClarificationOption[];
    wasClarification: boolean;
    createdAt: Date;
  };
};

const friendlyError = 'I had trouble processing that query. Try rephrasing, or contact your admin.';

function formatCurrencyAmount(value: number, currency = 'INR'): string {
  const normalizedCurrency = (currency || 'INR').toUpperCase();
  const locale = normalizedCurrency === 'INR' ? 'en-IN' : 'en-US';

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: normalizedCurrency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${normalizedCurrency} ${value.toLocaleString(locale, { maximumFractionDigits: 2 })}`;
  }
}

function isPipelineValueQuestion(query: string): boolean {
  const normalized = query.toLowerCase();
  const mentionsDeals = /\b(deal|deals|prospect|prospects|pipeline)\b/.test(normalized);
  const asksValue = /\b(value|amount|total|worth|sum)\b/.test(normalized);
  return mentionsDeals && asksValue;
}

async function answerPipelineValueQuestion(query: string, db: DbClient, userContext: UserContext): Promise<string | null> {
  if (!isPipelineValueQuestion(query)) return null;
  if (userContext.role === 'sales_rep') {
    return 'Prospect values are restricted for your role, so I cannot show deal amounts, pipeline value, or revenue totals.';
  }

  const normalized = query.toLowerCase();
  const onlyOpenDeals = /\bopen\b/.test(normalized) || /\bpipeline value\b/.test(normalized);
  const salesPipelineOnly = /\bsales\b/.test(normalized);

  const rows = await db
    .select({
      currency: sql<string>`COALESCE(${deals.currency}, 'INR')`,
      dealCount: sql<number>`COUNT(*)::int`,
      totalValue: sql<string>`COALESCE(SUM(COALESCE(${deals.amount}, 0)::numeric), 0)::text`,
    })
    .from(deals)
    .leftJoin(pipelines, eq(deals.pipelineId, pipelines.id))
    .where(and(
      sql`${deals.deletedAt} IS NULL`,
      onlyOpenDeals ? eq(deals.status, 'open') : undefined,
      salesPipelineOnly ? ilike(pipelines.name, '%sales%') : undefined
    ))
    .groupBy(sql`COALESCE(${deals.currency}, 'INR')`)
    .orderBy(sql`COALESCE(${deals.currency}, 'INR')`);

  const dealCount = rows.reduce((sum, row) => sum + Number(row.dealCount ?? 0), 0);
  const totals = rows.map((row) => {
    const value = Number(row.totalValue ?? 0);
    return formatCurrencyAmount(value, row.currency);
  });

  const scope = `${onlyOpenDeals ? 'open ' : ''}${salesPipelineOnly ? 'sales pipeline ' : 'pipeline '}prospects`;

  if (rows.length === 0 || dealCount === 0) {
    return `There are no ${scope} with a value recorded.`;
  }

  return `You have **${dealCount} ${scope}** with a total value of **${totals.join(' + ')}**.\n\nI used each prospect's stored currency, so INR amounts are shown as rupees rather than dollars.`;
}

type ParsedUserActivityQuestion = {
  name: string;
  includeTasks: boolean;
  includeAutomated: boolean;
  timeframe: 'week' | 'month' | 'all_time';
  wantsMonthlySummary: boolean;
};

function cleanPersonName(value: string): string {
  return value
    .replace(/'s\b/gi, '')
    .replace(/\b(all|the|calls?|emails?|activities?|activity|done|did|has|have|had|this|week|month|monthly|till|date|from|start|structured|tabular|format|numbers?|which)\b/gi, ' ')
    .replace(/[^a-zA-Z\s.'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseUserActivityQuestion(query: string): ParsedUserActivityQuestion | null {
  const normalized = query.toLowerCase();
  const mentionsActivity = /\b(activit(?:y|ies)|calls?|emails?|whatsapp|meetings?|logged|done)\b/.test(normalized);
  if (!mentionsActivity) return null;

  const nameMatch =
    query.match(/\bthat\s+([a-z][a-z\s.'-]{1,60}?)\s+(?:has|have|had|did|done)\b/i) ??
    query.match(/\b([a-z][a-z\s.'-]{1,60}?)(?:'s)\s+(?:activit(?:y|ies)|calls?|emails?|whatsapp|meetings?)\b/i) ??
    query.match(/\bshow\s+me\s+([a-z][a-z\s.'-]{1,60}?)(?:'s|\s+activity|\s+activities|\s+calls|\s+emails)/i) ??
    query.match(/\b(?:by|for)\s+([a-z][a-z\s.'-]{1,60}?)(?:\s+from|\s+till|\s+this|\s+in|\s*$)/i);

  const name = nameMatch?.[1] ? cleanPersonName(nameMatch[1]) : '';
  if (!name) return null;

  const timeframe = /\b(this week|week)\b/.test(normalized)
    ? 'week'
    : /\b(this month)\b/.test(normalized)
      ? 'month'
      : 'all_time';

  return {
    name,
    includeTasks: /\b(all activities|task|tasks|reminder|reminders|todo|to-do)\b/i.test(query),
    includeAutomated: /\b(automated|automation|system)\b/i.test(query),
    timeframe,
    wantsMonthlySummary: /\b(month|monthly|which month|tabular|table|numbers?)\b/i.test(query),
  };
}

function getCurrentIstWeekRange(now = new Date()): { start: Date; end: Date } {
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffsetMs);
  const day = istNow.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const mondayIstMidnight = Date.UTC(
    istNow.getUTCFullYear(),
    istNow.getUTCMonth(),
    istNow.getUTCDate() + diffToMonday,
    0,
    0,
    0,
    0
  );

  return {
    start: new Date(mondayIstMidnight - istOffsetMs),
    end: new Date(mondayIstMidnight + 7 * 24 * 60 * 60 * 1000 - istOffsetMs),
  };
}

function formatActivityType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatActivityTimestamp(value: Date): string {
  return value.toLocaleString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

function getActivityRange(parsed: ParsedUserActivityQuestion): { start?: Date; end?: Date; label: string } {
  if (parsed.timeframe === 'week') {
    const { start, end } = getCurrentIstWeekRange();
    return { start, end, label: 'this week' };
  }

  if (parsed.timeframe === 'month') {
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(Date.now() + istOffsetMs);
    const monthStartIst = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), 1, 0, 0, 0, 0);
    const nextMonthStartIst = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth() + 1, 1, 0, 0, 0, 0);
    return {
      start: new Date(monthStartIst - istOffsetMs),
      end: new Date(nextMonthStartIst - istOffsetMs),
      label: 'this month',
    };
  }

  return { label: 'from the start till date' };
}

async function resolveActivityUser(
  parsed: ParsedUserActivityQuestion,
  db: DbClient,
  currentUserId?: string
): Promise<
  | { user: { id: string; firstName: string | null; lastName: string | null; email: string | null }; clarification?: never }
  | { user?: never; clarification: string }
> {
  const normalizedName = parsed.name.toLowerCase();
  const matchingUsers = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(users)
    .where(and(
      sql`${users.status} != 'inactive'`,
      or(
        sql`concat_ws(' ', ${users.firstName}, ${users.lastName}) ILIKE ${`%${parsed.name}%`}`,
        ilike(users.firstName, parsed.name),
        ilike(users.lastName, parsed.name)
      )
    ))
    .limit(10);

  if (matchingUsers.length === 0) {
    return { clarification: `I could not find a CRM user matching **${parsed.name}**. Try using their full name.` };
  }

  if (matchingUsers.length === 1) {
    return { user: matchingUsers[0]! };
  }

  const currentUserMatch = matchingUsers.find((user) => {
    if (user.id !== currentUserId) return false;
    const firstName = user.firstName?.toLowerCase() ?? '';
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').toLowerCase();
    return firstName === normalizedName || fullName.includes(normalizedName);
  });

  if (currentUserMatch) {
    return { user: currentUserMatch };
  }

  const { start, end } = getActivityRange(parsed);
  const typeFilter = parsed.includeTasks
    ? undefined
    : sql`${activities.activityType} != 'task'`;
  const automationFilter = parsed.includeAutomated
    ? undefined
    : sql`COALESCE(${activities.isAutomated}, false) = false`;

  const activityCounts = await db
    .select({
      userId: activities.performedBy,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(activities)
    .where(and(
      inArray(activities.performedBy, matchingUsers.map((user) => user.id)),
      sql`${activities.deletedAt} IS NULL`,
      start ? sql`${activities.occurredAt} >= ${start}` : undefined,
      end ? sql`${activities.occurredAt} < ${end}` : undefined,
      typeFilter,
      automationFilter
    ))
    .groupBy(activities.performedBy);

  const usersWithActivity = activityCounts
    .filter((row) => Number(row.count ?? 0) > 0)
    .map((row) => matchingUsers.find((user) => user.id === row.userId))
    .filter(Boolean);

  if (usersWithActivity.length === 1) {
    return { user: usersWithActivity[0]! };
  }

  return {
    clarification: `I found multiple users matching **${parsed.name}**:\n\n${matchingUsers
      .map((user, index) => `${index + 1}. ${[user.firstName, user.lastName].filter(Boolean).join(' ')} (${user.email})`)
      .join('\n')}\n\nPlease ask again with the full name.`,
  };
}

async function answerUserActivityQuestion(query: string, db: DbClient, currentUserId?: string): Promise<string | null> {
  const parsed = parseUserActivityQuestion(query);
  if (!parsed) return null;

  const resolvedUser = await resolveActivityUser(parsed, db, currentUserId);
  if (resolvedUser.clarification) return resolvedUser.clarification;
  if (!resolvedUser.user) {
    return `I could not find a CRM user matching **${parsed.name}**. Try using their full name.`;
  }

  const matchedUser = resolvedUser.user;
  const { start, end, label } = getActivityRange(parsed);
  const typeFilter = parsed.includeTasks
    ? undefined
    : sql`${activities.activityType} != 'task'`;
  const automationFilter = parsed.includeAutomated
    ? undefined
    : sql`COALESCE(${activities.isAutomated}, false) = false`;
  const displayName = [matchedUser.firstName, matchedUser.lastName].filter(Boolean).join(' ') || parsed.name;

  if (parsed.wantsMonthlySummary || parsed.timeframe === 'all_time') {
    const rows = await db
      .select({
        monthStart: sql<string>`to_char(date_trunc('month', ${activities.occurredAt} AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM')`,
        monthLabel: sql<string>`to_char(date_trunc('month', ${activities.occurredAt} AT TIME ZONE 'Asia/Kolkata'), 'Mon YYYY')`,
        total: sql<number>`COUNT(*)::int`,
        calls: sql<number>`COUNT(*) FILTER (WHERE ${activities.activityType} = 'call')::int`,
        emails: sql<number>`COUNT(*) FILTER (WHERE ${activities.activityType} IN ('email_sent', 'email_received'))::int`,
        whatsapp: sql<number>`COUNT(*) FILTER (WHERE ${activities.activityType} = 'whatsapp')::int`,
        meetings: sql<number>`COUNT(*) FILTER (WHERE ${activities.activityType} IN ('meeting', 'demo'))::int`,
        notes: sql<number>`COUNT(*) FILTER (WHERE ${activities.activityType} = 'note')::int`,
        tasks: sql<number>`COUNT(*) FILTER (WHERE ${activities.activityType} = 'task')::int`,
        other: sql<number>`COUNT(*) FILTER (WHERE ${activities.activityType} NOT IN ('call', 'email_sent', 'email_received', 'whatsapp', 'meeting', 'demo', 'note', 'task'))::int`,
      })
      .from(activities)
      .where(and(
        eq(activities.performedBy, matchedUser.id),
        sql`${activities.deletedAt} IS NULL`,
        start ? sql`${activities.occurredAt} >= ${start}` : undefined,
        end ? sql`${activities.occurredAt} < ${end}` : undefined,
        typeFilter,
        automationFilter
      ))
      .groupBy(sql`date_trunc('month', ${activities.occurredAt} AT TIME ZONE 'Asia/Kolkata')`)
      .orderBy(sql`date_trunc('month', ${activities.occurredAt} AT TIME ZONE 'Asia/Kolkata')`);

    if (rows.length === 0) {
      const filteredNote = parsed.includeTasks || parsed.includeAutomated
        ? ''
      : ' I excluded automated CRM tasks and stale-prospect reminders from this activity summary.';
      return `I did not find any human activity logged by **${displayName}** ${label}.${filteredNote}`;
    }

    const totals = rows.reduce(
      (acc, row) => ({
        total: acc.total + Number(row.total ?? 0),
        calls: acc.calls + Number(row.calls ?? 0),
        emails: acc.emails + Number(row.emails ?? 0),
        whatsapp: acc.whatsapp + Number(row.whatsapp ?? 0),
        meetings: acc.meetings + Number(row.meetings ?? 0),
        notes: acc.notes + Number(row.notes ?? 0),
        tasks: acc.tasks + Number(row.tasks ?? 0),
        other: acc.other + Number(row.other ?? 0),
      }),
      { total: 0, calls: 0, emails: 0, whatsapp: 0, meetings: 0, notes: 0, tasks: 0, other: 0 }
    );

    const tableRows = rows.map((row) => (
      `| ${row.monthLabel} | ${row.total} | ${row.calls} | ${row.emails} | ${row.whatsapp} | ${row.meetings} | ${row.notes} | ${row.tasks} | ${row.other} |`
    ));

    const exclusions = parsed.includeTasks || parsed.includeAutomated
      ? ''
      : '\n\nI excluded automated system tasks and stale-prospect reminders so this reflects actual logged activity.';

    return `Here is **${displayName}'s activity summary ${label}**, grouped by month.\n\n| Month | Total | Calls | Emails | WhatsApp | Meetings/Demos | Notes | Tasks | Other |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n${tableRows.join('\n')}\n| **Total** | **${totals.total}** | **${totals.calls}** | **${totals.emails}** | **${totals.whatsapp}** | **${totals.meetings}** | **${totals.notes}** | **${totals.tasks}** | **${totals.other}** |\n\n[View full report →](/reports/${matchedUser.id}?preset=this_month)${exclusions}`;
  }

  const rows = await db
    .select({
      activityType: activities.activityType,
      subject: activities.subject,
      occurredAt: activities.occurredAt,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      companyName: companies.name,
      dealTitle: deals.title,
    })
    .from(activities)
    .leftJoin(contacts, eq(activities.contactId, contacts.id))
    .leftJoin(companies, eq(activities.companyId, companies.id))
    .leftJoin(deals, eq(activities.dealId, deals.id))
    .where(and(
      eq(activities.performedBy, matchedUser.id),
      sql`${activities.deletedAt} IS NULL`,
      start ? sql`${activities.occurredAt} >= ${start}` : undefined,
      end ? sql`${activities.occurredAt} < ${end}` : undefined,
      typeFilter,
      automationFilter
    ))
    .orderBy(desc(activities.occurredAt))
    .limit(25);

  if (rows.length === 0) {
    const filteredNote = parsed.includeTasks || parsed.includeAutomated
      ? ''
      : ' I excluded automated CRM tasks and stale-prospect reminders from this activity view.';
    return `I did not find any human activity logged by **${displayName}** ${label}.${filteredNote}`;
  }

  const lines = rows.map((row) => {
    const related = [
      [row.contactFirstName, row.contactLastName].filter(Boolean).join(' '),
      row.companyName,
      row.dealTitle ? `Prospect: ${row.dealTitle}` : '',
    ].filter(Boolean);
    const relatedText = related.length ? ` — ${related.join(' · ')}` : '';
    return `- **${formatActivityType(row.activityType)}:** ${row.subject || 'No subject'}${relatedText} _(${formatActivityTimestamp(row.occurredAt)})_`;
  });

  const exclusions = parsed.includeTasks || parsed.includeAutomated
    ? ''
    : '\n\nI excluded automated system tasks and stale-prospect reminders so this reflects actual logged activity.';
  const capped = rows.length === 25 ? '\n\nShowing the latest 25 activities for this week.' : '';

  return `**${displayName} has ${rows.length} human activit${rows.length === 1 ? 'y' : 'ies'} logged ${label}:**\n\n${lines.join('\n')}${capped}\n\n[View full report →](/reports/${matchedUser.id}?preset=this_month)${exclusions}`;
}

export function buildSystemPrompt(userContext: UserContext): string {
  return `
You are the SecComply CRM Intelligence Assistant. You help the sales team and management query their CRM data using natural language.

## Your Capabilities
- Answer questions about contacts, companies, prospects, activities, pipelines, tags, and team performance
- Generate SQL queries against the SecComply CRM PostgreSQL database
- Ask smart clarifying questions when a query is ambiguous
- Format results in a clean, readable way with relevant context
- Suggest follow-up actions when appropriate

## Database Schema

### contacts
id (uuid), first_name, last_name, email, secondary_email, phone, mobile, job_title, department,
company_id (-> companies.id), company_name, source, status (new/contacted/qualified/unqualified/nurturing/converted/lost/archived),
lead_score (0-100), owner_id (-> users.id), city, state, country, location, created_at, last_contacted_at,
custom_fields (jsonb), deleted_at (null = active)

### companies
id (uuid), name, domain, website, industry, sub_industry, company_size, company_type (prospect/customer/partner/vendor/competitor/other),
phone, email, city, state, country, location, owner_id (-> users.id), status, created_at, deleted_at

### deals (called "Prospects" in the UI)
id (uuid), title, pipeline_id (-> pipelines.id), stage_id (-> pipeline_stages.id), amount (decimal), currency,
probability (0-100), services (jsonb text array), service_other, status (open/won/lost/abandoned),
expected_close_date, actual_close_date, primary_contact_id (-> contacts.id), company_id (-> companies.id),
partner_company_id (-> companies.id), owner_id (-> users.id), stage_entered_at, is_velocity_slow, created_at, deleted_at

NOTE: Users will refer to these as "prospects" in natural language queries.
When a user asks about "prospects", query the deals table.
When responding, always use the word "prospect/prospects" not "deal/deals".

### deal_contacts
deal_id (-> deals.id), contact_id (-> contacts.id), role

### activities
id (uuid), activity_type (call/email_sent/email_received/meeting/note/task/sms/whatsapp/linkedin/demo/proposal/document/stage_change/status_change/assignment/custom),
subject, body, contact_id, company_id, deal_id, performed_by (-> users.id), occurred_at, task_due_date,
task_completed_at, task_priority, call_duration_seconds, call_outcome, is_automated, deleted_at

### tags
id (uuid), name, slug, color, category_id, usage_count

### tag_categories
id (uuid), name, color, description

### contact_tags, company_tags, deal_tags
contact_tags.contact_id/tag_id, company_tags.company_id/tag_id, deal_tags.deal_id/tag_id

### users
id (uuid), first_name, last_name, email, role_id, status

### roles
id (uuid), name, slug, permissions

### pipelines
id (uuid), name

### pipeline_stages
id (uuid), pipeline_id, name, position, stage_type (active/won/lost), default_probability

### deal_stage_history
id, deal_id, from_stage_id, to_stage_id, entered_at, exited_at, moved_by, created_at

### pipeline_benchmarks
id, pipeline_id, stage_id, avg_days_in_stage, sample_size, calculated_at

## Current User Context
Name: ${userContext.userName}
Role: ${userContext.role}
User ID: ${userContext.userId}
Permissions JSON: ${JSON.stringify(userContext.permissions)}

## RBAC Rules for SQL Generation
- Always add WHERE deleted_at IS NULL to contacts, companies, activities, and deals queries when those tables are used
- Never guess currency. Prospect values are stored in deals.amount and deals.currency. When aggregating prospect amount, include deals.currency in SELECT and GROUP BY unless the user explicitly asks for a single-currency conversion.
- Format INR as INR/₹, USD as USD/$, and never use $ for prospect values unless deals.currency = 'USD'.
- If user role is 'sales_rep', never SELECT, summarize, calculate, or reveal deals.amount, project contract values, pipeline value, revenue, weighted pipeline, average deal size, or any prospect/deal monetary amount.
- Sales reps can see all prospects and deals; do not add a deals.owner_id filter just because the role is sales_rep.
- When a user asks for someone's "activity", default to human logged activity: activities.performed_by = that user's id, activities.is_automated = false, and exclude activity_type = 'task' unless they explicitly ask for tasks/reminders/automations.
- Do not treat stale-prospect reminders such as "Prospect stuck..." as sales activity unless the user explicitly asks for automated tasks.
- If permissions are own-scoped for a non-sales-rep role, add owner filters:
  - contacts.owner_id = '${userContext.userId}' for contacts
  - deals.owner_id = '${userContext.userId}' for deals
  - companies.owner_id = '${userContext.userId}' for companies
  - activities.performed_by = '${userContext.userId}' for activity-only queries
- Sales managers, admins, and super admins can query team-wide data
- Never expose password_hash, sensitive auth fields, system tables, or internal auth data
- Only SELECT queries are permitted. Never generate INSERT, UPDATE, DELETE, DROP, TRUNCATE, ALTER, CREATE, GRANT, or REVOKE

IMPORTANT TERMINOLOGY:
- The database table is called "deals" but users call them "Prospects"
- Always use "Prospect/Prospects" in your responses, never "Deal/Deals"
- Example: "You have 8 open prospects worth ₹24,00,000" NOT "8 open deals"
- Pipeline stages, pipeline names, and all other terms remain unchanged

## How to Handle Ambiguous Queries
- If they mention "Delhi event" or any event name, list matching event-like tags and ask which ones
- For activity/performance questions, treat a mentioned first name as a CRM user first, not a contact. If the first name matches the current user, use the current user without asking. Only ask for clarification when multiple active CRM users are equally likely after applying that preference.
- If they mention a person by first name only for non-activity questions and there are multiple users or contacts, list them and ask
- If they mention "this quarter/month/year", use the current date context and include the exact date range in the query explanation
- If they ask "how many" without specifying a breakdown, ask if they want a total or breakdown only when the answer would otherwise be unclear

## Response Format
For data answers: Lead with a summary line, then structured breakdown. Include the direct answer prominently, relevant context, and a suggested follow-up action if useful.

For clarifying questions: List the options clearly and ask what they want. Keep it concise.

For no results: Say so clearly and suggest why the filter may be too narrow.

IMPORTANT: For this SQL-planning step, respond in one JSON object only:
{"phase":"clarify","question":"...","options":[{"label":"..."}]} if clarification is needed, OR
{"phase":"query","sql":"SELECT ...","explanation":"what this query does"} if a safe read-only query should run.
Do not use phase "answer" in this step. CRM data answers must come from SQL results.
`.trim();
}

export async function checkForAmbiguity(query: string, db: DbClient = defaultDb): Promise<AmbiguityCheck> {
  const normalized = query.toLowerCase();
  const eventKeywords = ['event', 'conference', 'summit', 'expo', 'meetup'];
  const mentionsEvent = eventKeywords.some((keyword) => normalized.includes(keyword));

  if (!mentionsEvent) {
    return { isAmbiguous: false, clarificationNeeded: '' };
  }

  const eventTags = await db
    .select({
      id: tags.id,
      label: tags.name,
      count: sql<number>`COUNT(${contactTags.contactId})::int`,
    })
    .from(tags)
    .leftJoin(tagCategories, eq(tags.categoryId, tagCategories.id))
    .leftJoin(contactTags, eq(contactTags.tagId, tags.id))
    .where(or(
      ilike(tagCategories.name, '%event%'),
      ilike(tags.name, '%event%'),
      ilike(tags.name, '%summit%'),
      ilike(tags.name, '%conference%'),
      ilike(tags.name, '%expo%'),
      ilike(tags.name, '%meetup%')
    ))
    .groupBy(tags.id, tags.name)
    .orderBy(desc(sql<number>`COUNT(${contactTags.contactId})`))
    .limit(8);

  if (eventTags.length >= 2) {
    return {
      isAmbiguous: true,
      clarificationNeeded: 'multiple_events',
      question: 'I found multiple event tags. Which event should I use?',
      options: [
        ...eventTags.map((tag) => ({
          id: tag.id,
          label: tag.label,
          count: Number(tag.count ?? 0),
        })),
        { label: 'All matching events combined' },
      ],
    };
  }

  return { isAmbiguous: false, clarificationNeeded: '' };
}

function parseGeminiJsonBlock(response: string): ParsedGeminiResponse {
  const trimmed = response.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const rawJson = fencedMatch?.[1]?.trim() ?? trimmed.match(/\{[\s\S]*\}/)?.[0]?.trim();

  if (!rawJson) return null;

  try {
    const parsed = JSON.parse(rawJson) as {
      phase?: string;
      question?: unknown;
      options?: unknown;
      sql?: unknown;
      explanation?: unknown;
      answer?: unknown;
      follow_up_suggestions?: unknown;
      followUpSuggestions?: unknown;
    };
    if (parsed?.phase === 'clarify' && typeof parsed.question === 'string') {
      return {
        phase: 'clarify',
        question: parsed.question,
        options: Array.isArray(parsed.options) ? parsed.options as ClarificationOption[] : undefined,
      };
    }
    if (parsed?.phase === 'query' && typeof parsed.sql === 'string') {
      return {
        phase: 'query',
        sql: parsed.sql,
        explanation: typeof parsed.explanation === 'string' ? parsed.explanation : undefined,
      };
    }
    if (parsed?.phase === 'answer' && typeof parsed.answer === 'string') {
      const suggestions = Array.isArray(parsed.follow_up_suggestions)
        ? parsed.follow_up_suggestions
        : parsed.followUpSuggestions;

      return {
        phase: 'answer',
        answer: parsed.answer,
        followUpSuggestions: Array.isArray(suggestions)
          ? suggestions.filter((suggestion): suggestion is string => typeof suggestion === 'string')
          : undefined,
      };
    }
  } catch {
    return null;
  }

  return null;
}

function formatAnswer(answer: string, followUpSuggestions: string[] = []): string {
  if (!followUpSuggestions.length) return answer;

  const suggestions = followUpSuggestions
    .map((suggestion) => `- ${suggestion}`)
    .join('\n');

  return `${answer}\n\nSuggested next steps:\n${suggestions}`;
}

function humanizeColumnName(column: string): string {
  return column
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (value instanceof Date) return value.toLocaleString('en-IN');
  if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString('en-IN') : value.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(formatCellValue).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatRowsDeterministically(userMessage: string, rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) {
    return 'I did not find any matching CRM records for that query. You can try broadening the filter or using the exact tag/source name.';
  }

  const columns = Object.keys(rows[0] ?? {});
  const countColumn = columns.find((column) => /(^|_)(count|total|lead_count|deal_count)($|_)/i.test(column));
  const nameColumn = columns.find((column) => /(name|title|tag|source|stage|status|owner|company|contact)/i.test(column));

  if (rows.length === 1 && countColumn) {
    const label = nameColumn ? ` for **${formatCellValue(rows[0]?.[nameColumn])}**` : '';
    return `I found **${formatCellValue(rows[0]?.[countColumn])}** result${label}.`;
  }

  const visibleRows = rows.slice(0, 20);
  const header = `Here are the results for: **${userMessage}**`;
  const tableHeader = `| ${columns.map(humanizeColumnName).join(' | ')} |`;
  const divider = `| ${columns.map(() => '---').join(' | ')} |`;
  const tableRows = visibleRows.map((row) => `| ${columns.map((column) => formatCellValue(row[column]).replace(/\|/g, '\\|')).join(' | ')} |`);
  const cappedNote = rows.length > visibleRows.length ? `\n\nShowing the first ${visibleRows.length} of ${rows.length} rows.` : '';

  return `${header}\n\n${[tableHeader, divider, ...tableRows].join('\n')}${cappedNote}`;
}

function isJsonLikeInternalResponse(response: string): boolean {
  const trimmed = response.trim();
  return trimmed.startsWith('{') && /"phase"\s*:\s*"(query|clarify|answer)"/i.test(trimmed);
}

function formatClarification(question: string, options: ClarificationOption[] = []): string {
  if (!options.length) return question;
  const lines = options.map((option, index) => {
    const count = typeof option.count === 'number' ? ` (${option.count})` : '';
    return `${index + 1}. ${option.label}${count}`;
  });
  return `${question}\n\n${lines.join('\n')}`;
}

function toGeminiHistory(messages: Array<{ role: 'user' | 'assistant'; content: string }>): GeminiHistoryMessage[] {
  return messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));
}

async function getUserContext(userId: string, db: DbClient): Promise<UserContext> {
  const [row] = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      roleName: roles.name,
      roleSlug: roles.slug,
      permissions: roles.permissions,
    })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) {
    throw new Error('User not found');
  }

  return {
    userId: row.id,
    userName: [row.firstName, row.lastName].filter(Boolean).join(' '),
    role: row.roleSlug || row.roleName,
    permissions: row.permissions as RolePermissions,
  };
}

async function assertSessionAccess(sessionId: string, userId: string, db: DbClient): Promise<void> {
  const [session] = await db
    .select({ id: aiChatSessions.id })
    .from(aiChatSessions)
    .where(and(eq(aiChatSessions.id, sessionId), eq(aiChatSessions.userId, userId)))
    .limit(1);

  if (!session) {
    throw new Error('Chat session not found');
  }
}

async function storeAssistantMessage(args: {
  db: DbClient;
  sessionId: string;
  content: string;
  sqlQuery?: string | null;
  queryResultCount?: number | null;
  wasClarification?: boolean;
}) {
  const [message] = await args.db
    .insert(aiChatMessages)
    .values({
      sessionId: args.sessionId,
      role: 'assistant',
      content: args.content,
      sqlQuery: args.sqlQuery ?? null,
      queryResultCount: args.queryResultCount ?? null,
      wasClarification: args.wasClarification ?? false,
    })
    .returning();

  await args.db
    .update(aiChatSessions)
    .set({ lastMessageAt: new Date() })
    .where(eq(aiChatSessions.id, args.sessionId));

  return message!;
}

export async function handleMessage(
  sessionId: string,
  userId: string,
  userMessage: string,
  db: DbClient = defaultDb
): Promise<AiChatResponse> {
  let userMessageStored = false;

  try {
    await assertSessionAccess(sessionId, userId, db);

    const historyRows = await db
      .select({ role: aiChatMessages.role, content: aiChatMessages.content })
      .from(aiChatMessages)
      .where(eq(aiChatMessages.sessionId, sessionId))
      .orderBy(desc(aiChatMessages.createdAt))
      .limit(6);

    await db.insert(aiChatMessages).values({
      sessionId,
      role: 'user',
      content: userMessage,
    });
    userMessageStored = true;

    await db
      .update(aiChatSessions)
      .set({ lastMessageAt: new Date() })
      .where(eq(aiChatSessions.id, sessionId));

    const userContext = await getUserContext(userId, db);
    const systemPrompt = buildSystemPrompt(userContext);
    const pipelineValueAnswer = await answerPipelineValueQuestion(userMessage, db, userContext);
    const userActivityAnswer = await answerUserActivityQuestion(userMessage, db, userContext.userId);

    if (pipelineValueAnswer) {
      const message = await storeAssistantMessage({ db, sessionId, content: pipelineValueAnswer });

      return {
        message: {
          id: message.id,
          role: 'assistant',
          content: pipelineValueAnswer,
          wasClarification: false,
          createdAt: message.createdAt,
        },
      };
    }

    if (userActivityAnswer) {
      const message = await storeAssistantMessage({ db, sessionId, content: userActivityAnswer });

      return {
        message: {
          id: message.id,
          role: 'assistant',
          content: userActivityAnswer,
          wasClarification: false,
          createdAt: message.createdAt,
        },
      };
    }

    const ambiguity = await checkForAmbiguity(userMessage, db);

    if (ambiguity.isAmbiguous) {
      const content = formatClarification(ambiguity.question ?? 'Can you clarify what you want to use?', ambiguity.options);
      const message = await storeAssistantMessage({
        db,
        sessionId,
        content,
        wasClarification: true,
      });

      return {
        message: {
          id: message.id,
          role: 'assistant',
          content,
          options: ambiguity.options,
          wasClarification: true,
          createdAt: message.createdAt,
        },
      };
    }

    const history = toGeminiHistory(historyRows.reverse());
    const response = await generateChatResponse(userMessage, history, systemPrompt);
    const parsed = parseGeminiJsonBlock(response);

    if (!parsed) {
      const message = await storeAssistantMessage({ db, sessionId, content: response });
      return {
        message: {
          id: message.id,
          role: 'assistant',
          content: response,
          wasClarification: false,
          createdAt: message.createdAt,
        },
      };
    }

    if (parsed.phase === 'clarify') {
      const content = formatClarification(parsed.question, parsed.options);
      const message = await storeAssistantMessage({
        db,
        sessionId,
        content,
        wasClarification: true,
      });

      return {
        message: {
          id: message.id,
          role: 'assistant',
          content,
          options: parsed.options,
          wasClarification: true,
          createdAt: message.createdAt,
        },
      };
    }

    if (parsed.phase === 'answer') {
      await writeAuditLog({
        userId,
        action: 'api_access',
        entityType: 'ai_chat',
        entityId: sessionId,
        entityName: 'Rejected direct AI answer',
        metadata: {
          reason: 'Gemini returned a direct CRM data answer before SQL execution',
          answer: parsed.answer,
        },
      });

      throw new Error('AI returned a direct answer before querying CRM data');
    }

    const validation = validateGeneratedSql(parsed.sql);
    if (!validation.valid) {
      await writeAuditLog({
        userId,
        action: 'api_access',
        entityType: 'ai_chat',
        entityId: sessionId,
        entityName: 'Rejected AI SQL',
        metadata: {
          reason: validation.reason,
          sql: parsed.sql,
        },
      });

      const message = await storeAssistantMessage({
        db,
        sessionId,
        content: friendlyError,
        sqlQuery: parsed.sql,
      });

      return {
        message: {
          id: message.id,
          role: 'assistant',
          content: friendlyError,
          wasClarification: false,
          createdAt: message.createdAt,
        },
      };
    }

    const rows = await executeSafeQuery(db, parsed.sql);
    const formatterPrompt = `
The user asked: ${userMessage}

The safe SQL explanation was: ${parsed.explanation ?? 'No explanation provided'}

The query returned ${rows.length} row(s), capped at 500:
${JSON.stringify(rows, null, 2)}

Format this into a concise, useful CRM answer. If there are no rows, say that clearly and suggest a likely next step.
`.trim();

    const formattingSystemPrompt = `
You format SecComply CRM query results into concise, readable Markdown for the user.
Return plain Markdown text only.
Do not return JSON.
Do not wrap the answer in a phase object.
Respect currency fields exactly. Use ₹/INR only for INR rows and $/USD only for USD rows. Never invent or convert currencies.
Lead with the direct answer, then include useful context or suggested next steps if helpful.
`.trim();

    const formattedResponse = await generateChatResponse(formatterPrompt, [], formattingSystemPrompt);
    const parsedFormattedResponse = parseGeminiJsonBlock(formattedResponse);
    const content = parsedFormattedResponse?.phase === 'answer'
      ? formatAnswer(parsedFormattedResponse.answer, parsedFormattedResponse.followUpSuggestions)
      : parsedFormattedResponse || isJsonLikeInternalResponse(formattedResponse)
        ? formatRowsDeterministically(userMessage, rows)
        : formattedResponse;

    const message = await storeAssistantMessage({
      db,
      sessionId,
      content,
      sqlQuery: parsed.sql,
      queryResultCount: rows.length,
    });

    return {
      message: {
        id: message.id,
        role: 'assistant',
        content,
        wasClarification: false,
        createdAt: message.createdAt,
      },
    };
  } catch (error) {
    console.error('[AI Chat] Failed to handle message:', error);

    if (userMessageStored) {
      try {
        const message = await storeAssistantMessage({
          db,
          sessionId,
          content: friendlyError,
        });

        return {
          message: {
            id: message.id,
            role: 'assistant',
            content: friendlyError,
            wasClarification: false,
            createdAt: message.createdAt,
          },
        };
      } catch (storeError) {
        console.error('[AI Chat] Failed to store fallback assistant message:', storeError);
      }
    }

    throw new Error(friendlyError);
  }
}
