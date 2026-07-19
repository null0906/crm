import { pgTable, uuid, varchar, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const apiTokens = pgTable(
  'api_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    label: varchar('label', { length: 100 }).notNull(),
    // First few chars of the plaintext token, kept for UI identification only
    // (e.g. "scmp_a1b2c3") — never enough to reconstruct or brute-force the token.
    tokenPrefix: varchar('token_prefix', { length: 16 }).notNull(),
    // SHA-256 hex digest of the full token. The plaintext is shown to the admin exactly
    // once at creation time and is never stored or retrievable again.
    tokenHash: varchar('token_hash', { length: 64 }).unique().notNull(),
    scope: varchar('scope', { length: 30 }).notNull().default('metrics:read'),
    isActive: boolean('is_active').notNull().default(true),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_api_tokens_hash').on(t.tokenHash),
    index('idx_api_tokens_active').on(t.isActive),
    index('idx_api_tokens_created_by').on(t.createdBy),
  ]
);

export type ApiToken = typeof apiTokens.$inferSelect;
export type NewApiToken = typeof apiTokens.$inferInsert;
