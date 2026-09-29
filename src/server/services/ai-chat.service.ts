import { and, desc, eq } from 'drizzle-orm';
import { type ModelMessage } from 'ai';
import { LlmRateLimitError, runText } from '@/server/lib/llm';
import { db as defaultDb } from '@/server/db';
import { aiChatMessages, aiChatSessions } from '@/server/db/schema';
import type { AiChatToolCall } from '@/server/db/schema/ai-chat';
import { createAiTools } from './ai-tools';
import type { SessionUser } from '@/lib/types';

type DbClient = typeof defaultDb;

type ClarificationOption = {
  id?: string;
  label: string;
  count?: number;
};

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
const MAX_STEPS = Number(process.env.GROQ_MAX_TOOL_STEPS ?? 6);

export function buildSystemPrompt(user: SessionUser): string {
  return `
You are the SecComply CRM Intelligence Assistant. You answer questions about contacts, companies,
Prospects (the CRM's deals/pipeline records), activities, and team performance by calling tools —
never by inventing numbers or guessing at data you haven't fetched.

## Current user
Name: ${user.firstName} ${user.lastName}
Role: ${user.role.name} (slug: ${user.role.slug})
User ID: ${user.id}

## Terminology
- The database calls them "deals" but you must always say "Prospect/Prospects" to the user, never "Deal/Deals".
- The role slug "sales_rep" is displayed to users as "Analyst" — say "Analyst" in your responses.

## Tool selection
- Prefer the most specific curated tool over run_custom_query. Curated tools already enforce
  correct access control and are guaranteed to run correctly — run_custom_query is a last resort
  for questions no curated tool covers.
- Call resolve_crm_user before get_activity_by_person or get_rep_report when a question names a
  person. If a match has isCurrentUser: true and the caller is plausibly asking about themselves,
  use it without asking. Only call ask_clarifying_question if multiple users remain equally likely.
- get_daily_metrics is always a company-wide total — never use it for "my numbers" questions;
  use get_rep_report or get_activity_by_person for anything personalized.
- If a tool result has forbidden: true, explain that plainly to the user (quoting its reason) —
  do not try another tool to route around an access restriction.
- Call ask_clarifying_question only when there is genuine ambiguity you cannot reasonably resolve
  (e.g. multiple similarly-named tags or people). Prefer answering over asking when a sensible
  default interpretation exists.
- Once you have enough information, respond with a clear, concise, well-formatted final answer —
  lead with the direct answer, then supporting detail. Never respond with raw JSON or code.
`.trim();
}

function toModelMessages(history: Array<{ role: 'user' | 'assistant'; content: string }>, userMessage: string): ModelMessage[] {
  return [
    ...history.map((message): ModelMessage => ({ role: message.role, content: message.content })),
    { role: 'user', content: userMessage },
  ];
}

function formatClarification(question: string, options: ClarificationOption[] = []): string {
  if (!options.length) return question;
  const lines = options.map((option, index) => {
    const count = typeof option.count === 'number' ? ` (${option.count})` : '';
    return `${index + 1}. ${option.label}${count}`;
  });
  return `${question}\n\n${lines.join('\n')}`;
}

function summarizeToolOutput(output: unknown): string {
  try {
    const json = JSON.stringify(output);
    return json.length > 300 ? `${json.slice(0, 300)}…` : json;
  } catch {
    return String(output);
  }
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
  toolCalls?: AiChatToolCall[];
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
      toolCalls: args.toolCalls?.length ? args.toolCalls : null,
    })
    .returning();

  await args.db
    .update(aiChatSessions)
    .set({ lastMessageAt: new Date() })
    .where(eq(aiChatSessions.id, args.sessionId));

  return message!;
}

/**
 * The provider call, the fallback chain and the rate limiter now live in
 * `@/server/lib/llm`, so a second feature can use them without dragging the assistant's tool
 * set along. Behaviour here is unchanged: same model order, same step cap, and the same 0.1
 * temperature, which suits prose even though the shared default is 0.
 */
async function runAgent(params: {
  systemPrompt: string;
  messages: ModelMessage[];
  tools: ReturnType<typeof createAiTools>;
  userId: string;
}) {
  return runText({
    purpose: 'chat',
    userId: params.userId,
    systemPrompt: params.systemPrompt,
    messages: params.messages,
    tools: params.tools,
    maxSteps: MAX_STEPS,
    temperature: Number(process.env.GROQ_TEMPERATURE ?? 0.1),
  });
}

export async function handleMessage(
  sessionId: string,
  user: SessionUser,
  userMessage: string,
  db: DbClient = defaultDb
): Promise<AiChatResponse> {
  let userMessageStored = false;

  try {
    await assertSessionAccess(sessionId, user.id, db);

    const historyRows = await db
      .select({ role: aiChatMessages.role, content: aiChatMessages.content })
      .from(aiChatMessages)
      .where(eq(aiChatMessages.sessionId, sessionId))
      .orderBy(desc(aiChatMessages.createdAt))
      .limit(6);

    await db.insert(aiChatMessages).values({ sessionId, role: 'user', content: userMessage });
    userMessageStored = true;

    await db
      .update(aiChatSessions)
      .set({ lastMessageAt: new Date() })
      .where(eq(aiChatSessions.id, sessionId));

    const tools = createAiTools(user, sessionId, db);
    const systemPrompt = buildSystemPrompt(user);
    const messages = toModelMessages(historyRows.reverse(), userMessage);

    const result = await runAgent({ systemPrompt, messages, tools, userId: user.id });

    const toolCallLog: AiChatToolCall[] = result.toolResults.map((toolResult) => ({
      tool: toolResult.toolName,
      args: toolResult.input as Record<string, unknown>,
      resultSummary: summarizeToolOutput(toolResult.output),
    }));

    const clarifyCall = result.finalStep.toolCalls.find((call) => call.toolName === 'ask_clarifying_question');

    if (clarifyCall) {
      const clarifyInput = clarifyCall.input as { question: string; options?: ClarificationOption[] };
      const content = formatClarification(clarifyInput.question, clarifyInput.options);
      const message = await storeAssistantMessage({
        db,
        sessionId,
        content,
        wasClarification: true,
        toolCalls: toolCallLog,
      });

      return {
        message: {
          id: message.id,
          role: 'assistant',
          content,
          options: clarifyInput.options,
          wasClarification: true,
          createdAt: message.createdAt,
        },
      };
    }

    const content = result.text.trim() || friendlyError;
    const customQueryResult = result.toolResults.find((toolResult) => toolResult.toolName === 'run_custom_query');
    const customQueryOutput = customQueryResult?.output as { sql?: string; rowCount?: number; trueTotalCount?: number } | undefined;

    const message = await storeAssistantMessage({
      db,
      sessionId,
      content,
      sqlQuery: customQueryOutput?.sql ?? null,
      queryResultCount: customQueryOutput ? (customQueryOutput.trueTotalCount ?? customQueryOutput.rowCount ?? null) : null,
      toolCalls: toolCallLog,
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

    // Being throttled is not a failure the user should have to guess at — it is temporary
    // and it has a wait time, unlike the generic error, which reads as "something is broken".
    const content = error instanceof LlmRateLimitError ? error.message : friendlyError;

    if (userMessageStored) {
      try {
        const message = await storeAssistantMessage({ db, sessionId, content });

        return {
          message: {
            id: message.id,
            role: 'assistant',
            content,
            wasClarification: false,
            createdAt: message.createdAt,
          },
        };
      } catch (storeError) {
        console.error('[AI Chat] Failed to store fallback assistant message:', storeError);
      }
    }

    throw new Error(content);
  }
}
