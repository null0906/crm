import { db } from '@/server/db';
import { auditLog } from '@/server/db/schema';
import type { AuditAction } from '@/lib/types';

interface AuditParams {
  userId?: string;
  userEmail?: string;
  ipAddress?: string;
  userAgent?: string;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  entityName?: string;
  changes?: Record<string, { old?: unknown; new?: unknown }>;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(params: AuditParams): Promise<void> {
  try {
    await db.insert(auditLog).values({
      userId: params.userId,
      userEmail: params.userEmail,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      entityName: params.entityName,
      changes: params.changes ?? null,
      metadata: params.metadata ?? {},
    });
  } catch (err) {
    // Audit failures should not break business logic
    console.error('[AuditLog] Failed to write audit log:', err);
  }
}

export function buildChangeDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Record<string, { old: unknown; new: unknown }> {
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    if (key === 'updatedAt' || key === 'passwordHash') continue;
    if (before[key] !== after[key]) {
      changes[key] = { old: before[key], new: after[key] };
    }
  }

  return changes;
}
