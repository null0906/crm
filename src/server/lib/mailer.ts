import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

type SendEmailOptions = {
  cc?: string | string[];
  retries?: number;
};

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS ?? process.env.SMTP_PASSWORD,
    },
  });

  return transporter;
}

async function sendViaResend(
  to: string | string[],
  subject: string,
  html: string,
  options: SendEmailOptions = {}
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  const from = process.env.RESEND_FROM ?? process.env.SMTP_FROM ?? 'SecComply <noreply@seccomply.net>';
  const recipients = Array.isArray(to) ? to : [to];
  const cc = options.cc ? (Array.isArray(options.cc) ? options.cc : [options.cc]) : undefined;
  const replyTo = process.env.RESEND_REPLY_TO;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: recipients,
      ...(cc?.length ? { cc } : {}),
      subject,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend send failed (${response.status}): ${body}`);
  }
}

async function sendViaSmtp(
  to: string | string[],
  subject: string,
  html: string,
  options: SendEmailOptions = {}
): Promise<void> {
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? 'noreply@seccomply.net';
  const recipients = Array.isArray(to) ? to.join(', ') : to;
  const cc = options.cc ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc) : undefined;
  await getTransporter().sendMail({ from, to: recipients, ...(cc ? { cc } : {}), subject, html });
}

export async function sendEmail(
  to: string | string[],
  subject: string,
  html: string,
  optionsOrRetries: SendEmailOptions | number = 1
): Promise<void> {
  const options = typeof optionsOrRetries === 'number'
    ? { retries: optionsOrRetries }
    : optionsOrRetries;
  const retries = options.retries ?? 1;

  try {
    if (process.env.RESEND_API_KEY) {
      await sendViaResend(to, subject, html, options);
      return;
    }

    await sendViaSmtp(to, subject, html, options);
  } catch (err) {
    if (retries > 0) {
      console.warn('[Mailer] Send failed, retrying once…', err);
      await new Promise((r) => setTimeout(r, 2000));
      await sendEmail(to, subject, html, { ...options, retries: retries - 1 });
    } else {
      throw err;
    }
  }
}
