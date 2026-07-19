/**
 * Microsoft Teams bot transport wiring.
 *
 * Unlike the Telegram/WhatsApp transports (deliberately hand-rolled with native fetch, no
 * external bot libraries), Teams runs on Bot Framework: incoming requests carry bearer JWTs
 * that must be validated against Microsoft Entra ID's rotating signing keys. That's
 * security-sensitive crypto that shouldn't be hand-rolled, so this transport uses Microsoft's
 * maintained SDK (@microsoft/teams.apps) instead.
 *
 * This file has zero knowledge of CRM logic — it just constructs the SDK's App instance,
 * mirroring the "thin transport wrapper" role telegram-bot.ts/whatsapp-bot.ts play. Message
 * routing and the App singleton/registration live in teams.service.ts.
 */

import { App } from '@microsoft/teams.apps';
import type { IHttpServerAdapter, HttpMethod, HttpRouteHandler } from '@microsoft/teams.apps';

/**
 * The SDK defaults to spinning up its own Express server via ExpressAdapter when none is
 * supplied. We never call app.start(), so this adapter's registerRoute is a no-op — incoming
 * requests are instead bridged manually through app.server.handleRequest() from our own
 * Next.js route handler (src/app/api/webhooks/teams/route.ts).
 */
class NoopHttpServerAdapter implements IHttpServerAdapter {
  registerRoute(_method: HttpMethod, _path: string, _handler: HttpRouteHandler): void {
    // intentionally empty
  }
}

export function createTeamsApp(): App {
  return new App({
    clientId: process.env.TEAMS_BOT_APP_ID,
    clientSecret: process.env.TEAMS_BOT_APP_PASSWORD,
    tenantId: process.env.TEAMS_BOT_TENANT_ID,
    httpServerAdapter: new NoopHttpServerAdapter(),
  });
}
