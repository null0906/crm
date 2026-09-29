/**
 * Telegram bot command handler.
 * Authenticates callers, routes commands, calls existing CRM services,
 * formats responses, and logs all interactions.
 */

import { db } from '@/server/db';
import { telegramUsers, telegramMessageLog, users, roles } from '@/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { sendMessage } from '@/server/lib/telegram-bot';
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

const SOURCE = 'telegram';

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
        hasFinancialAccess: users.hasFinancialAccess,
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
    hasFinancialAccess: record.user.hasFinancialAccess,
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
