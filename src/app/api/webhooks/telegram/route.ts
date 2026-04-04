import { NextRequest, NextResponse } from 'next/server';
import { handleMessage } from '@/server/services/telegram.service';
import type { TelegramUpdate } from '@/server/lib/telegram-bot';

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Validate webhook secret
  const secret = req.headers.get('x-telegram-bot-api-secret-token');
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    // Always return 200 to Telegram to prevent retries on malformed JSON
    return NextResponse.json({ ok: true });
  }

  const message = update.message;

  // Ignore non-text messages (stickers, photos, etc.)
  if (!message?.text || !message.from) {
    return NextResponse.json({ ok: true });
  }

  // Fire and forget — always respond 200 to Telegram immediately
  handleMessage(message.from.id, message.text, {
    username: message.from.username,
  }).catch((err) => {
    console.error('[TelegramWebhook] Unhandled error in handleMessage:', err);
  });

  return NextResponse.json({ ok: true });
}
