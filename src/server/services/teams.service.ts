/**
 * Microsoft Teams bot command handler.
 * Authenticates callers, routes commands, calls existing CRM services,
 * formats responses, and logs all interactions.
 *
 * See teams-bot.ts for why this transport uses the official Teams SDK instead of a
 * hand-rolled fetch wrapper (JWT/JWKS validation shouldn't be hand-rolled).
 */

import { db } from '@/server/db';
import { teamsUsers, teamsMessageLog, users, roles } from '@/server/db/schema';
import { eq, and, notInArray, inArray, isNotNull, count } from 'drizzle-orm';
import { createTeamsApp } from '@/server/lib/teams-bot';
import { getUserByEmail } from '@/server/lib/microsoft-graph';
import { parseStructuredMessage } from '@/server/lib/telegram-parser';
import {
  handleAdd,
  handleAddCompany,
  handleNote,
  handleFind,
  handleToday,
  handleMyTasks,
  HELP_TEXT,
} from './bot-commands.service';
import type { SessionUser } from '@/lib/types';
import type { App, IActivityContext } from '@microsoft/teams.apps';
import type { Activity } from '@microsoft/teams.api';

const SOURCE = 'teams';

type MessageContext = IActivityContext<Extract<Activity, { type: 'message' }>>;

// ── App singleton ────────────────────────────────────────────────────────────

let appPromise: Promise<App> | null = null;

/**
 * Lazily constructs, registers the message handler on, and initializes the Teams App exactly
 * once. Both the webhook route (for app.server.handleRequest) and notifyUser (for app.send)
 * go through this accessor so the message handler is guaranteed registered before any
 * request is processed.
 */
export function getTeamsApp(): Promise<App> {
  if (!appPromise) {
    appPromise = (async () => {
      const app = createTeamsApp();
      app.on('message', async (ctx) => {
        const aadObjectId = ctx.activity.from.aadObjectId;
        if (!aadObjectId) return;
        await handleMessage(aadObjectId, ctx.activity.text ?? '', { name: ctx.activity.from.name }, ctx);
      });
      await app.initialize();
      return app;
    })();
  }
  return appPromise;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function notifyUser(userId: string, message: string): Promise<boolean> {
  const [record] = await db
    .select({ conversationReference: teamsUsers.conversationReference })
    .from(teamsUsers)
    .where(and(eq(teamsUsers.crmUserId, userId), eq(teamsUsers.isActive, true)))
    .limit(1);

  if (!record?.conversationReference) return false;

  const app = await getTeamsApp();
  await app.send(record.conversationReference.conversation.id, { type: 'message', text: message });
  return true;
}

export interface BulkLinkResult {
  linked: Array<{ email: string; name: string }>;
  notFound: string[];
  skippedAlreadyLinked: number;
}

/**
 * Resolves every active CRM user's email against Entra ID via Microsoft Graph and links
 * anyone found — no need for each person to message the bot first. Users already linked
 * are left untouched (not re-synced); users with no matching Entra ID account (e.g. a
 * personal email on file) are reported back rather than silently skipped.
 */
export async function bulkLinkUsersByEmail(): Promise<BulkLinkResult> {
  const alreadyLinkedUserIds = db
    .select({ crmUserId: teamsUsers.crmUserId })
    .from(teamsUsers);

  const [alreadyLinkedCount] = await db
    .select({ count: count() })
    .from(users)
    .where(and(eq(users.status, 'active'), inArray(users.id, alreadyLinkedUserIds)));

  const candidates = await db
    .select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(and(eq(users.status, 'active'), notInArray(users.id, alreadyLinkedUserIds), isNotNull(users.email)));

  const result: BulkLinkResult = { linked: [], notFound: [], skippedAlreadyLinked: alreadyLinkedCount?.count ?? 0 };

  for (const candidate of candidates) {
    const graphUser = await getUserByEmail(candidate.email);
    // GraphAuthError isn't caught here — a permission/auth failure should abort the whole
    // batch loudly rather than silently mislabel every remaining user as "not found".

    if (!graphUser) {
      result.notFound.push(candidate.email);
      continue;
    }

    await db.insert(teamsUsers).values({
      aadObjectId: graphUser.id,
      teamsName: graphUser.displayName ?? `${candidate.firstName} ${candidate.lastName}`,
      crmUserId: candidate.id,
      isActive: true,
    }).onConflictDoNothing({ target: teamsUsers.aadObjectId });

    result.linked.push({ email: candidate.email, name: `${candidate.firstName} ${candidate.lastName}` });
  }

  return result;
}

async function getAuthorizedUser(aadObjectId: string): Promise<{
  sessionUser: SessionUser;
  teamsRecord: typeof teamsUsers.$inferSelect;
} | null> {
  const [record] = await db
    .select({
      tm: teamsUsers,
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
    .from(teamsUsers)
    .innerJoin(users, eq(teamsUsers.crmUserId, users.id))
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(and(eq(teamsUsers.aadObjectId, aadObjectId), eq(teamsUsers.isActive, true)))
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

  return { sessionUser, teamsRecord: record.tm };
}

// ── Logging ───────────────────────────────────────────────────────────────────

async function logMessage(params: {
  aadObjectId: string;
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
    await db.insert(teamsMessageLog).values({
      aadObjectId: params.aadObjectId,
      direction: params.direction,
      command: params.command,
      rawMessage: params.rawMessage,
      parsedData: (params.parsedData as Record<string, unknown>) ?? null,
      resultStatus: params.resultStatus,
      resultMessage: params.resultMessage,
      entityType: params.entityType,
      entityId: params.entityId,
    });
  } catch (err) {
    console.error('[TeamsLog] Failed to log message:', err);
  }
}

// ── Main Entry Point ──────────────────────────────────────────────────────────

async function handleMessage(
  aadObjectId: string,
  messageText: string,
  senderInfo: { name?: string },
  ctx: MessageContext
): Promise<void> {
  // Update last active timestamp + conversation reference in background (don't await).
  // The conversation reference is what lets notifyUser resume this conversation later
  // without the user having messaged first — Bot Framework has no static "send by ID" API.
  db.update(teamsUsers)
    .set({ lastActiveAt: new Date(), teamsName: senderInfo.name, conversationReference: ctx.ref })
    .where(eq(teamsUsers.aadObjectId, aadObjectId))
    .catch(() => {});

  const auth = await getAuthorizedUser(aadObjectId);

  if (!auth) {
    await ctx.reply('Your Microsoft Teams account is not linked to a CRM user. Contact your admin to set up access.');
    await logMessage({
      aadObjectId,
      direction: 'inbound',
      rawMessage: messageText,
      resultStatus: 'unauthorized',
      resultMessage: 'No matching teams_users record',
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
        const result = await handleAdd(parsed.fields, sessionUser, SOURCE);
        responseText = result.text;
        entityType = result.entityType;
        entityId = result.entityId;
        if (result.text.startsWith('❌')) status = 'error';
        break;
      }
      case '/addcompany': {
        const result = await handleAddCompany(parsed.fields, sessionUser, SOURCE);
        responseText = result.text;
        entityType = result.entityType;
        entityId = result.entityId;
        if (result.text.startsWith('❌')) status = 'error';
        break;
      }
      case '/note': {
        const result = await handleNote(parsed.fields, sessionUser, SOURCE);
        responseText = result.text;
        entityType = result.entityType;
        entityId = result.entityId;
        if (result.text.startsWith('❌')) status = 'error';
        break;
      }
      case '/log': {
        const result = await handleNote({ ...parsed.fields, type: 'call' }, sessionUser, SOURCE, 'call');
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
    console.error(`[TeamsBot] Error handling command ${parsed.command}:`, err);
    responseText = `❌ An error occurred: ${err instanceof Error ? err.message : 'Unknown error'}`;
    status = 'error';
  }

  // Same 4096-char cap used by the other two transports, for consistent truncation behavior.
  if (responseText.length > 4096) {
    responseText = responseText.slice(0, 4050) + '\n\n_(message truncated)_';
  }

  await ctx.reply(responseText);

  await logMessage({
    aadObjectId,
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
