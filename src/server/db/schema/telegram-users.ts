import { pgTable, uuid, varchar, bigint, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const telegramUsers = pgTable(
  'telegram_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    telegramUserId: bigint('telegram_user_id', { mode: 'number' }).unique().notNull(),
    telegramUsername: varchar('telegram_username', { length: 100 }),
    crmUserId: uuid('crm_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    isActive: boolean('is_active').notNull().default(true),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_telegram_users_crm_user').on(t.crmUserId),
    index('idx_telegram_users_active').on(t.isActive),
  ]
);

export type TelegramUser = typeof telegramUsers.$inferSelect;
export type NewTelegramUser = typeof telegramUsers.$inferInsert;
