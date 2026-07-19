/**
 * Lightweight Microsoft Graph API wrapper using native fetch — app-only (client credentials)
 * access, same convention as telegram-bot.ts/whatsapp-bot.ts. Used to resolve CRM users'
 * emails to their Entra ID Object ID for bulk Teams linking, instead of requiring each person
 * to message the bot first. Reuses the same Azure AD app registration/secret already
 * configured for the Teams bot (TEAMS_BOT_APP_ID/PASSWORD/TENANT_ID) — this just requires the
 * app registration to additionally have the User.Read.All application permission granted.
 */

const TENANT_ID = process.env.TEAMS_BOT_TENANT_ID ?? '';
const CLIENT_ID = process.env.TEAMS_BOT_APP_ID ?? '';
const CLIENT_SECRET = process.env.TEAMS_BOT_APP_PASSWORD ?? '';

let cachedToken: { value: string; expiresAt: number } | null = null;

export class GraphAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphAuthError';
  }
}

async function getAppOnlyToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    throw new GraphAuthError('TEAMS_BOT_APP_ID, TEAMS_BOT_APP_PASSWORD, and TEAMS_BOT_TENANT_ID must all be set.');
  }

  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
    }),
  });

  const data = (await res.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };

  if (!res.ok || !data.access_token) {
    throw new GraphAuthError(data.error_description ?? data.error ?? `Token request failed (${res.status})`);
  }

  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cachedToken.value;
}

export interface GraphUser {
  id: string;
  displayName: string | null;
}

/**
 * Looks up a user by email/UPN. Returns null if no matching user exists in the tenant
 * (a normal, expected outcome for e.g. a personal email on file) — throws only for actual
 * auth/permission failures, which the caller should treat as fatal for the whole batch.
 */
export async function getUserByEmail(email: string): Promise<GraphUser | null> {
  const token = await getAppOnlyToken();

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}?$select=id,displayName`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (res.status === 404) return null;

  if (!res.ok) {
    const data = await res.json().catch(() => null) as { error?: { message?: string; code?: string } } | null;
    if (res.status === 401 || res.status === 403) {
      throw new GraphAuthError(
        data?.error?.message ?? 'Not authorized to read users. Confirm User.Read.All application permission has admin consent granted.'
      );
    }
    throw new Error(data?.error?.message ?? `Graph lookup failed for ${email} (${res.status})`);
  }

  const user = (await res.json()) as { id: string; displayName: string | null };
  return { id: user.id, displayName: user.displayName };
}
