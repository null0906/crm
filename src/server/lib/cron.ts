import cron from 'node-cron';
import { checkAndRunSchedules } from '@/server/services/digest.service';
import { sendDealInactivityReminders } from '@/server/services/deal-inactivity.service';
import { sendTaskDueReminders } from '@/server/services/task-reminder.service';
import { startTelegramPolling } from '@/server/lib/telegram-polling';

let initialized = false;

export function initializeCron(): void {
  if (initialized) return;
  initialized = true;

  // Run digest scheduler every minute
  cron.schedule('* * * * *', () => {
    checkAndRunSchedules().catch((err) => {
      console.error('[Cron] checkAndRunSchedules error:', err);
    });

    sendDealInactivityReminders().catch((err) => {
      console.error('[Cron] sendDealInactivityReminders error:', err);
    });

    sendTaskDueReminders().catch((err) => {
      console.error('[Cron] sendTaskDueReminders error:', err);
    });
  });

  console.log('[Cron] Digest scheduler started (every minute)');

  // Start Telegram polling if in polling mode
  startTelegramPolling();
}
