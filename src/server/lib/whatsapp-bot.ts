/**
 * Lightweight WhatsApp Cloud API wrapper using native fetch.
 * No external SDK — just REST calls against the Meta Graph API.
 */

import { createHmac, timingSafeEqual } from 'crypto';

const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN ?? '';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';
const APP_SECRET = process.env.WHATSAPP_APP_SECRET ?? '';
const API_VERSION = process.env.WHATSAPP_API_VERSION ?? 'v21.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

export interface WhatsAppTextMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
}

export interface WhatsAppContact {
  wa_id: string;
  profile?: { name?: string };
}

export interface WhatsAppWebhookPayload {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: WhatsAppTextMessage[];
        contacts?: WhatsAppContact[];
      };
    }>;
  }>;
}

interface GraphErrorResponse {
  error?: { message?: string; type?: string; code?: number };
}

async function callGraphApi<T>(path: string, method: 'GET' | 'POST', body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE_URL}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = (await res.json()) as T & GraphErrorResponse;

  if (!res.ok || data.error) {
    throw new Error(`WhatsApp API error: ${data.error?.message ?? res.statusText}`);
  }

  return data;
}

/**
 * Send a free-form text message. Only valid within the 24h customer-service
 * window (i.e. in reply to an inbound message) or via approved templates otherwise.
 */
export async function sendMessage(to: string, text: string): Promise<{ messages: Array<{ id: string }> }> {
  return callGraphApi(`${PHONE_NUMBER_ID}/messages`, 'POST', {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text, preview_url: false },
  });
}

export async function getPhoneNumberInfo(): Promise<{ id: string; display_phone_number: string; verified_name: string }> {
  return callGraphApi(`${PHONE_NUMBER_ID}?fields=verified_name,display_phone_number`, 'GET');
}

/**
 * Verify the X-Hub-Signature-256 header Meta sends on every webhook POST.
 * Skips verification (returns true) if WHATSAPP_APP_SECRET isn't configured,
 * matching the local-dev ergonomics of the Telegram integration's secret-token check.
 */
export function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!APP_SECRET) return true;
  if (!signatureHeader) return false;

  const expected = createHmac('sha256', APP_SECRET).update(rawBody, 'utf8').digest('hex');
  const provided = signatureHeader.replace(/^sha256=/, '');

  const expectedBuf = Buffer.from(expected, 'hex');
  const providedBuf = Buffer.from(provided, 'hex');
  if (expectedBuf.length !== providedBuf.length) return false;

  return timingSafeEqual(expectedBuf, providedBuf);
}
