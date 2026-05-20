import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

function getArgValue(name: string): string | undefined {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);

  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];

  return undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function hasUsableMailConfig() {
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  const hasSmtp = Boolean(
    process.env.SMTP_HOST
      && process.env.SMTP_USER
      && (process.env.SMTP_PASS || process.env.SMTP_PASSWORD)
  );

  return { hasResend, hasSmtp, usable: hasResend || hasSmtp };
}

function configureMailProviderOverride() {
  const provider = getArgValue('--provider') ?? process.env.REMINDER_TEST_EMAIL_PROVIDER;
  if (!provider) return;

  if (!['auto', 'resend', 'smtp'].includes(provider)) {
    throw new Error('Invalid --provider. Use one of: auto, resend, smtp');
  }

  process.env.EMAIL_PROVIDER = provider;
  console.log(`[ReminderTest] Email provider override: ${provider}`);
}

function configureDatabaseUrlOverride() {
  const overrideUrl = getArgValue('--database-url')
    ?? process.env.REMINDER_TEST_DATABASE_URL
    ?? process.env.DATABASE_PUBLIC_URL
    ?? process.env.PG_PUBLIC_URL;

  if (overrideUrl) {
    process.env.DATABASE_URL = overrideUrl;
    console.log('[ReminderTest] Using public/override database URL for local test.');
  }

  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (databaseUrl.includes('railway.internal')) {
    throw new Error([
      'The current DATABASE_URL uses Railway private networking:',
      '  postgres.railway.internal',
      '',
      'That hostname only works from inside Railway containers. `railway run` injects Railway env vars, but this command still runs on your Mac.',
      '',
      'Use one of these safe options:',
      '1. Add Railway Postgres public TCP URL temporarily and run:',
      '   REMINDER_TEST_DATABASE_URL="postgresql://..." npm run test:reminder-email -- --to atharva@seccomply.net',
      '',
      '2. Or pass it directly:',
      '   npm run test:reminder-email -- --to atharva@seccomply.net --database-url "postgresql://..."',
      '',
      '3. Or deploy this code and run the test command inside the deployed Railway container/job, where railway.internal resolves.',
      '',
      'No email was sent.',
    ].join('\n'));
  }
}

async function writePreviewHtml(html: string) {
  const outDir = path.join(process.cwd(), 'tmp');
  const outPath = path.join(outDir, 'reminder-digest-preview.html');
  await mkdir(outDir, { recursive: true });
  await writeFile(outPath, html, 'utf8');
  return outPath;
}

async function main() {
  const to = getArgValue('--to') ?? process.env.REMINDER_TEST_TO;
  const dryRun = hasFlag('--dry-run');

  configureDatabaseUrlOverride();
  configureMailProviderOverride();

  const {
    buildReminderDigestTestPreview,
    sendReminderDigestTestEmail,
  } = await import('@/server/services/reminder-digest.service');

  const preview = await buildReminderDigestTestPreview();
  const outPath = await writePreviewHtml(preview.html);

  console.log('[ReminderTest] Built safe reminder digest preview.');
  console.log(`[ReminderTest] Preview HTML: ${outPath}`);
  console.log(JSON.stringify({
    checked: preview.checked,
    checkedTasks: preview.checkedTasks,
    checkedInactiveProspects: preview.checkedInactiveProspects,
    previewedUsers: preview.previewedUsers,
    subject: preview.subject,
  }, null, 2));

  if (dryRun) {
    console.log('[ReminderTest] Dry run only. No email was sent.');
    return;
  }

  if (!to) {
    throw new Error('Missing test recipient. Use: npm run test:reminder-email -- --to you@seccomply.net');
  }

  const mailConfig = hasUsableMailConfig();
  if (!mailConfig.usable) {
    throw new Error([
      'No usable mail provider credentials found locally.',
      'Set RESEND_API_KEY, or set SMTP_HOST + SMTP_USER + SMTP_PASS.',
      'If Resend quota is exhausted, add SMTP_USER + SMTP_PASS and run with --provider smtp.',
      'You can still inspect the generated HTML file above, or run this command with Railway env:',
      `railway run npm run test:reminder-email -- --to ${to}`,
    ].join('\n'));
  }

  console.log(`[ReminderTest] Sending safe preview to ${to}`);
  console.log('[ReminderTest] No production recipients, no CC, and no notification records will be created.');

  const result = await sendReminderDigestTestEmail(to);

  console.log('[ReminderTest] Sent preview email.');
  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[ReminderTest] Failed:', error);
    process.exit(1);
  });
