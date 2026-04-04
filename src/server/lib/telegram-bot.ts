/**
 * Lightweight Telegram Bot API wrapper using native fetch.
 * No external Telegram bot libraries — just REST calls.
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

export type ParseMode = 'HTML' | 'Markdown' | 'MarkdownV2';

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number; type: string };
  date: number;
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface BotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
  can_join_groups: boolean;
  can_read_all_group_messages: boolean;
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

async function callApi<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE_URL}/${method}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = (await res.json()) as TelegramApiResponse<T>;

  if (!data.ok) {
    throw new Error(`Telegram API error ${data.error_code}: ${data.description}`);
  }

  return data.result as T;
}

export async function sendMessage(
  chatId: number | string,
  text: string,
  parseMode?: ParseMode
): Promise<TelegramMessage> {
  return callApi<TelegramMessage>('sendMessage', {
    chat_id: chatId,
    text,
    ...(parseMode && { parse_mode: parseMode }),
  });
}

export async function getUpdates(offset?: number): Promise<TelegramUpdate[]> {
  return callApi<TelegramUpdate[]>('getUpdates', {
    timeout: 30,
    allowed_updates: ['message'],
    ...(offset !== undefined && { offset }),
  });
}

export async function setWebhook(url: string, secretToken: string): Promise<boolean> {
  return callApi<boolean>('setWebhook', {
    url,
    secret_token: secretToken,
    allowed_updates: ['message'],
  });
}

export async function getBotInfo(): Promise<BotInfo> {
  return callApi<BotInfo>('getMe');
}
