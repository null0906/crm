import { db } from '@/server/db';
import { digestSchedules } from '@/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { sendEmail } from '@/server/lib/mailer';
import { sendMessage } from '@/server/lib/telegram-bot';
import { renderDigestEmail, renderDigestTelegram } from './digest-renderer';

/**
 * Send a digest for a specific schedule ID.
 */
export async function sendDigest(scheduleId: string): Promise<{ success: boolean; error?: string }> {
  const [schedule] = await db
    .select()
    .from(digestSchedules)
    .where(eq(digestSchedules.id, scheduleId))
    .limit(1);

  if (!schedule) {
    return { success: false, error: 'Schedule not found' };
  }

  try {
    const emailRecipients = (schedule.emailRecipients as string[]) ?? [];
    const telegramRecipients = (schedule.telegramRecipients as number[]) ?? [];

    const dashboardId = schedule.dashboardId;

    // Send emails
    if (emailRecipients.length && dashboardId) {
      try {
        const { subject, html } = await renderDigestEmail(dashboardId);
        await sendEmail(emailRecipients, subject, html);
      } catch (err) {
        console.error(`[Digest] Email send failed for schedule ${scheduleId}:`, err);
      }
    }

    // Send Telegram messages
    if (telegramRecipients.length && dashboardId) {
      let tgText: string;
      try {
        tgText = await renderDigestTelegram(dashboardId);
      } catch (err) {
        tgText = `❌ Failed to render digest: ${err instanceof Error ? err.message : 'Unknown error'}`;
      }

      for (const chatId of telegramRecipients) {
        try {
          await sendMessage(chatId, tgText, 'Markdown');
        } catch (err) {
          console.error(`[Digest] Telegram send failed for chatId ${chatId}:`, err);
        }
      }
    }

    // Update last_sent_at
    await db
      .update(digestSchedules)
      .set({ lastSentAt: new Date(), updatedAt: new Date() })
      .where(eq(digestSchedules.id, scheduleId));

    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[Digest] sendDigest failed for ${scheduleId}:`, err);
    return { success: false, error: errorMsg };
  }
}

/**
 * Check all active schedules and fire any that match the current IST time.
 * Called every minute by the cron job.
 */
export async function checkAndRunSchedules(): Promise<void> {
  const schedules = await db
    .select()
    .from(digestSchedules)
    .where(eq(digestSchedules.isActive, true));

  if (!schedules.length) return;

  // Current time in IST (UTC+5:30)
  const nowUTC = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(nowUTC.getTime() + istOffsetMs);

  const currentHH = nowIST.getUTCHours().toString().padStart(2, '0');
  const currentMM = nowIST.getUTCMinutes().toString().padStart(2, '0');
  const currentTime = `${currentHH}:${currentMM}`;
  const currentDayOfWeek = nowIST.getUTCDay(); // 0=Sun … 6=Sat
  const currentDayOfMonth = nowIST.getUTCDate();

  for (const schedule of schedules) {
    if (schedule.scheduleTime !== currentTime) continue;

    const type = schedule.scheduleType;

    if (type === 'daily') {
      void sendDigest(schedule.id).catch((err) =>
        console.error(`[Digest] Failed to send schedule ${schedule.id}:`, err)
      );
    } else if (type === 'weekly') {
      if (schedule.scheduleDayOfWeek === currentDayOfWeek) {
        void sendDigest(schedule.id).catch((err) =>
          console.error(`[Digest] Failed to send schedule ${schedule.id}:`, err)
        );
      }
    } else if (type === 'monthly') {
      if (schedule.scheduleDayOfMonth === currentDayOfMonth) {
        void sendDigest(schedule.id).catch((err) =>
          console.error(`[Digest] Failed to send schedule ${schedule.id}:`, err)
        );
      }
    }
  }
}
