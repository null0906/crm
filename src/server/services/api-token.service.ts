import { db } from '@/server/db';
import { apiTokens } from '@/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { generateToken, hashToken } from '@/server/lib/api-token';
import { writeAuditLog } from './audit.service';
import type { SessionUser } from '@/lib/types';

export const apiTokenService = {
  /** Creates a token and returns the plaintext exactly once — it is never stored or retrievable again. */
  async createToken(label: string, user: SessionUser) {
    const { token, prefix, hash } = generateToken();

    const [created] = await db
      .insert(apiTokens)
      .values({
        label,
        tokenPrefix: prefix,
        tokenHash: hash,
        createdBy: user.id,
        isActive: true,
      })
      .returning({
        id: apiTokens.id,
        label: apiTokens.label,
        tokenPrefix: apiTokens.tokenPrefix,
        scope: apiTokens.scope,
        isActive: apiTokens.isActive,
        createdAt: apiTokens.createdAt,
      });

    await writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: 'create',
      entityType: 'api_token',
      entityId: created!.id,
      entityName: label,
      metadata: { tokenPrefix: prefix },
    });

    return { ...created!, token };
  },

  async listTokens() {
    return db
      .select({
        id: apiTokens.id,
        label: apiTokens.label,
        tokenPrefix: apiTokens.tokenPrefix,
        scope: apiTokens.scope,
        isActive: apiTokens.isActive,
        lastUsedAt: apiTokens.lastUsedAt,
        createdAt: apiTokens.createdAt,
        revokedAt: apiTokens.revokedAt,
      })
      .from(apiTokens)
      .orderBy(desc(apiTokens.createdAt));
  },

  async revokeToken(id: string, user: SessionUser) {
    const [updated] = await db
      .update(apiTokens)
      .set({ isActive: false, revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(apiTokens.id, id))
      .returning({ id: apiTokens.id, label: apiTokens.label });

    if (!updated) throw new Error('Token not found.');

    await writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: 'delete',
      entityType: 'api_token',
      entityId: updated.id,
      entityName: updated.label,
    });

    return updated;
  },

  /**
   * Verifies a bearer token against active, non-revoked tokens and returns its scope, or
   * null if invalid. Updates lastUsedAt in the background (never blocks/fails the caller).
   */
  async verifyToken(rawToken: string): Promise<{ id: string; scope: string } | null> {
    const hash = hashToken(rawToken);
    const [record] = await db
      .select({ id: apiTokens.id, scope: apiTokens.scope })
      .from(apiTokens)
      .where(and(eq(apiTokens.tokenHash, hash), eq(apiTokens.isActive, true)))
      .limit(1);

    if (!record) return null;

    db.update(apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiTokens.id, record.id))
      .catch(() => {});

    return record;
  },
};
