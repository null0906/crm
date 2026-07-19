/**
 * WhatsApp bot command handler.
 * Mirrors telegram.service.ts: authenticates callers, routes commands via the
 * shared bot-commands.service handlers, formats responses, and logs interactions.
 */

import { db } from '@/server/db';
import { whatsappUsers, whatsappMessageLog, users, roles } from '@/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { sendMessage } from '@/server/lib/whatsapp-bot';
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

const SOURCE = 'whatsapp';

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function notifyUser(userId: string, message: string): Promise<boolean> {
  const [record] = await db
    .select({ waId: whatsappUsers.waId })
    .from(whatsappUsers)
    .where(and(eq(whatsappUsers.crmUserId, userId), eq(whatsappUsers.isActive, true)))
    .limit(1);

  if (!record) return false;

  await sendMessage(record.waId, message);
  return true;
}

async function getAuthorizedUser(waId: string): Promise<{
  sessionUser: SessionUser;
  whatsappRecord: typeof whatsappUsers.$inferSelect;
} | null> {
  const [record] = await db
    .select({
      wa: whatsappUsers,
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
    .from(whatsappUsers)
    .innerJoin(users, eq(whatsappUsers.crmUserId, users.id))
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(and(eq(whatsappUsers.waId, waId), eq(whatsappUsers.isActive, true)))
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

  return { sessionUser, whatsappRecord: record.wa };
}

// ── Logging ───────────────────────────────────────────────────────────────────

async function logMessage(params: {
  waId: string;
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
    await db.insert(whatsappMessageLog).values({
      waId: params.waId,
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
    console.error('[WhatsAppLog] Failed to log message:', err);
  }
}

// ── Main Entry Point ──────────────────────────────────────────────────────────

export async function handleMessage(
  waId: string,
  messageText: string,
  senderInfo?: { name?: string }
): Promise<void> {
  // Update last active timestamp in background (don't await)
  db.update(whatsappUsers)
    .set({ lastActiveAt: new Date(), waName: senderInfo?.name })
    .where(eq(whatsappUsers.waId, waId))
    .catch(() => {});

  const auth = await getAuthorizedUser(waId);

  if (!auth) {
    await sendMessage(
      waId,
      'Your WhatsApp number is not linked to a CRM user. Contact your admin to set up access.'
    );
    await logMessage({
      waId,
      direction: 'inbound',
      rawMessage: messageText,
      resultStatus: 'unauthorized',
      resultMessage: 'No matching whatsapp_users record',
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
    console.error(`[WhatsAppBot] Error handling command ${parsed.command}:`, err);
    responseText = `❌ An error occurred: ${err instanceof Error ? err.message : 'Unknown error'}`;
    status = 'error';
  }

  // WhatsApp text messages cap at 4096 chars, same as Telegram
  if (responseText.length > 4096) {
    responseText = responseText.slice(0, 4050) + '\n\n_(message truncated)_';
  }

  await sendMessage(waId, responseText);

  await logMessage({
    waId,
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
