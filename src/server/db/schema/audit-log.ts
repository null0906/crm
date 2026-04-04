import { pgTable, bigserial, uuid, varchar, text, timestamp, jsonb, inet, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import type { AuditAction } from '@/lib/types';

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').references(() => users.id),
    userEmail: varchar('user_email', { length: 255 }),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    action: varchar('action', { length: 30 }).$type<AuditAction>().notNull(),
    entityType: varchar('entity_type', { length: 30 }).notNull(),
    entityId: uuid('entity_id'),
    entityName: varchar('entity_name', { length: 255 }),
    changes: jsonb('changes'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_audit_user').on(t.userId),
    index('idx_audit_action').on(t.action),
    index('idx_audit_entity').on(t.entityType, t.entityId),
    index('idx_audit_created').on(t.createdAt),
  ]
);

export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
