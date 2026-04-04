import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

export async function sendEmail(
  to: string | string[],
  subject: string,
  html: string,
  retries = 1
): Promise<void> {
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? 'noreply@seccomply.net';
  const recipients = Array.isArray(to) ? to.join(', ') : to;

  try {
    await getTransporter().sendMail({ from, to: recipients, subject, html });
  } catch (err) {
    if (retries > 0) {
      console.warn('[Mailer] Send failed, retrying once…', err);
      await new Promise((r) => setTimeout(r, 2000));
      await sendEmail(to, subject, html, retries - 1);
    } else {
      throw err;
    }
  }
}
