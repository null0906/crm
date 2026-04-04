/**
 * Long-polling loop for Telegram bot in development mode.
 * Only active when TELEGRAM_MODE=polling.
 */

import { getUpdates } from './telegram-bot';
import { handleMessage } from '@/server/services/telegram.service';

let isPolling = false;

export function startTelegramPolling(): void {
  if (isPolling) return;
  if (process.env.TELEGRAM_MODE !== 'polling') return;
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.warn('[TelegramPolling] TELEGRAM_BOT_TOKEN not set — polling disabled');
    return;
  }

  isPolling = true;
  console.log('[TelegramPolling] Starting polling loop…');

  let offset: number | undefined;

  const poll = async (): Promise<void> => {
    if (!isPolling) return;

    try {
      const updates = await getUpdates(offset);

      for (const update of updates) {
        offset = update.update_id + 1;
        const msg = update.message;
        if (!msg?.text || !msg.from) continue;

        handleMessage(msg.from.id, msg.text, { username: msg.from.username }).catch((err) => {
          console.error('[TelegramPolling] Error processing update:', err);
        });
      }
    } catch (err) {
      console.error('[TelegramPolling] getUpdates error:', err);
      // Back off for 5s on error
      await new Promise((r) => setTimeout(r, 5000));
    }

    // Schedule next poll immediately (getUpdates already uses long-poll timeout)
    setImmediate(poll);
  };

  void poll();
}

export function stopTelegramPolling(): void {
  isPolling = false;
}
