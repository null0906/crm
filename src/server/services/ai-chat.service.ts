import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db as defaultDb } from '@/server/db';
import {
  aiChatMessages,
  aiChatSessions,
  contactTags,
  roles,
  tagCategories,
  tags,
  users,
} from '@/server/db/schema';
import { writeAuditLog } from './audit.service';
import { executeSafeQuery, validateGeneratedSql } from './sql-safety.service';
import { generateChatResponse, GeminiServiceError, type GeminiHistoryMessage } from './gemini.service';
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

export function buildSystemPrompt(userContext: UserContext): string {
  return `
You are the SecComply CRM Intelligence Assistant. You help the sales team and management query their CRM data using natural language.

## Your Capabilities
- Answer questions about contacts, companies, deals, activities, pipelines, tags, and team performance
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

### deals
id (uuid), title, pipeline_id (-> pipelines.id), stage_id (-> pipeline_stages.id), amount (decimal), currency,
probability (0-100), services (jsonb text array), service_other, status (open/won/lost/abandoned),
expected_close_date, actual_close_date, primary_contact_id (-> contacts.id), company_id (-> companies.id),
partner_company_id (-> companies.id), owner_id (-> users.id), stage_entered_at, is_velocity_slow, created_at, deleted_at

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
- If user role is 'sales_rep' or permissions are own-scoped, add owner filters:
  - contacts.owner_id = '${userContext.userId}' for contacts
  - deals.owner_id = '${userContext.userId}' for deals
  - companies.owner_id = '${userContext.userId}' for companies
  - activities.performed_by = '${userContext.userId}' for activity-only queries
- Sales managers, admins, and super admins can query team-wide data
- Never expose password_hash, sensitive auth fields, system tables, or internal auth data
- Only SELECT queries are permitted. Never generate INSERT, UPDATE, DELETE, DROP, TRUNCATE, ALTER, CREATE, GRANT, or REVOKE

## How to Handle Ambiguous Queries
- If they mention "Delhi event" or any event name, list matching event-like tags and ask which ones
- If they mention a person by first name only and there are multiple users or contacts, list them and ask
- If they mention "this quarter/month/year", use the current date context and include the exact date range in the query explanation
- If they ask "how many" without specifying a breakdown, ask if they want a total or breakdown only when the answer would otherwise be unclear

## Response Format
For data answers: Lead with a summary line, then structured breakdown. Include the direct answer prominently, relevant context, and a suggested follow-up action if useful.

For clarifying questions: List the options clearly and ask what they want. Keep it concise.

For no results: Say so clearly and suggest why the filter may be too narrow.

IMPORTANT: Respond in one JSON object only:
{"phase":"clarify","question":"...","options":[{"label":"..."}]} if clarification is needed, OR
{"phase":"query","sql":"SELECT ...","explanation":"what this query does"} if a safe read-only query should run.
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
    const parsed = JSON.parse(rawJson) as Partial<ParsedGeminiResponse>;
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
  } catch {
    return null;
  }

  return null;
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

    await db
      .update(aiChatSessions)
      .set({ lastMessageAt: new Date() })
      .where(eq(aiChatSessions.id, sessionId));

    const userContext = await getUserContext(userId, db);
    const systemPrompt = buildSystemPrompt(userContext);
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

    const formattedResponse = await generateChatResponse(formatterPrompt, [], systemPrompt);
    const message = await storeAssistantMessage({
      db,
      sessionId,
      content: formattedResponse,
      sqlQuery: parsed.sql,
      queryResultCount: rows.length,
    });

    return {
      message: {
        id: message.id,
        role: 'assistant',
        content: formattedResponse,
        wasClarification: false,
        createdAt: message.createdAt,
      },
    };
  } catch (error) {
    if (error instanceof GeminiServiceError) {
      throw error;
    }
    console.error('[AI Chat] Failed to handle message:', error);
    throw new Error(friendlyError);
  }
}
