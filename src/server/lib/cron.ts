import cron from 'node-cron';
import { checkAndRunSchedules } from '@/server/services/digest.service';
import { sendConsolidatedReminderDigest } from '@/server/services/reminder-digest.service';
import {
  calculatePipelineBenchmarks,
  createStaleAlerts,
  detectDelayedDeals,
  detectDelayedProjects,
  recalculateLeadScores,
  registerAutomationEventListeners,
  sendMorningBriefings,
  sendWeeklySummary,
} from '@/server/services/automation.service';
import { startTelegramPolling } from '@/server/lib/telegram-polling';

let initialized = false;

export function initializeCron(): void {
  if (initialized) return;
  initialized = true;
  registerAutomationEventListeners();

  // Run digest scheduler every minute
  cron.schedule('* * * * *', () => {
    checkAndRunSchedules().catch((err) => {
      console.error('[Cron] checkAndRunSchedules error:', err);
    });
  });

  console.log('[Cron] Digest scheduler started (every minute)');

  // Send consolidated reminder digest once daily at 4:00 AM UTC (9:30 AM IST)
  cron.schedule('0 4 * * *', () => {
    sendConsolidatedReminderDigest().catch((err) => {
      console.error('[Cron] sendConsolidatedReminderDigest error:', err);
    });
  });

  cron.schedule('30 0 * * *', () => {
    recalculateLeadScores().catch((err) => {
      console.error('[Cron] recalculateLeadScores error:', err);
    });
  });

  cron.schedule('0 3 * * *', () => {
    createStaleAlerts().catch((err) => {
      console.error('[Cron] createStaleAlerts error:', err);
    });
  });

  cron.schedule('30 2 * * *', () => {
    detectDelayedDeals().catch((err) => {
      console.error('[Cron] detectDelayedDeals error:', err);
    });
    detectDelayedProjects().catch((err) => {
      console.error('[Cron] detectDelayedProjects error:', err);
    });
  });

  cron.schedule('30 3 * * *', () => {
    sendMorningBriefings().catch((err) => {
      console.error('[Cron] sendMorningBriefings error:', err);
    });
  });

  cron.schedule('30 20 * * *', () => {
    calculatePipelineBenchmarks().catch((err) => {
      console.error('[Cron] calculatePipelineBenchmarks error:', err);
    });
  });

  cron.schedule('30 2 * * 1', () => {
    sendWeeklySummary().catch((err) => {
      console.error('[Cron] sendWeeklySummary error:', err);
    });
  });

  console.log('[Cron] Smart automation schedules registered');

  // Start Telegram polling if in polling mode
  startTelegramPolling();
}
