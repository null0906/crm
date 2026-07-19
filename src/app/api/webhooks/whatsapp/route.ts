import { NextRequest, NextResponse } from 'next/server';
import { handleMessage } from '@/server/services/whatsapp.service';
import { verifySignature } from '@/server/lib/whatsapp-bot';
import type { WhatsAppWebhookPayload } from '@/server/lib/whatsapp-bot';

function noStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  return response;
}

/** Meta's one-time webhook verification handshake when configuring the callback URL. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === 'subscribe' && expectedToken && token === expectedToken && challenge) {
    return noStore(new NextResponse(challenge, { status: 200 }));
  }

  return noStore(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();

  const signature = req.headers.get('x-hub-signature-256');
  if (!verifySignature(rawBody, signature)) {
    return noStore(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
  }

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WhatsAppWebhookPayload;
  } catch {
    // Always return 200 to Meta to prevent retries on malformed JSON
    return noStore(NextResponse.json({ ok: true }));
  }

  const value = payload.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];

  // Ignore status callbacks (delivered/read receipts) and non-text messages (images, stickers, etc.)
  if (!message?.text?.body || !message.from) {
    return noStore(NextResponse.json({ ok: true }));
  }

  const senderName = value?.contacts?.find((c) => c.wa_id === message.from)?.profile?.name;

  // Fire and forget — always respond 200 to Meta immediately
  handleMessage(message.from, message.text.body, { name: senderName }).catch((err) => {
    console.error('[WhatsAppWebhook] Unhandled error in handleMessage:', err);
  });

  return noStore(NextResponse.json({ ok: true }));
}
