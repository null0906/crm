import { NextRequest, NextResponse } from 'next/server';
import { apiTokenService } from '@/server/services/api-token.service';
import { getDailyMetrics } from '@/server/services/metrics.service';

function noStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  response.headers.set('Pragma', 'no-cache');
  return response;
}

/**
 * Read-only, token-authenticated daily company metrics for external automations.
 * Tokens are created/revoked by super admins under Settings → API Access — there is no
 * NextAuth session involved here at all, this route does its own bearer-token check,
 * mirroring the pattern already used by the Telegram/WhatsApp webhook routes.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization') ?? '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return noStore(NextResponse.json({ error: 'Missing or malformed Authorization header. Expected: Bearer <token>' }, { status: 401 }));
  }

  const verified = await apiTokenService.verifyToken(token);
  if (!verified) {
    return noStore(NextResponse.json({ error: 'Invalid or revoked token.' }, { status: 401 }));
  }

  const metrics = await getDailyMetrics();
  return noStore(NextResponse.json(metrics, { status: 200 }));
}
