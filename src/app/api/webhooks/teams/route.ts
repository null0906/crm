import { NextRequest, NextResponse } from 'next/server';
import { getTeamsApp } from '@/server/services/teams.service';

/**
 * Unlike the Telegram/WhatsApp webhooks (always ack 200 immediately, handle the message
 * fire-and-forget), this route awaits the full request handling before responding. Bot
 * Framework's Connector expects a synchronous, accurate status back (e.g. 401 on failed JWT
 * validation) — app.server.handleRequest() does that validation and activity dispatch itself,
 * so we return exactly what it returns rather than acking blind. This is intentional, not an
 * inconsistency with the other two transports.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const app = await getTeamsApp();

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: true });
  }

  const headers = Object.fromEntries(req.headers.entries());
  const result = await app.server.handleRequest({ body, headers });

  return NextResponse.json(result.body ?? {}, { status: result.status });
}
