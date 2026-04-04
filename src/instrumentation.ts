/**
 * Next.js instrumentation hook — runs once when the server starts.
 * Used to initialize background services (cron jobs, polling).
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initializeCron } = await import('@/server/lib/cron');
    initializeCron();
  }
}
