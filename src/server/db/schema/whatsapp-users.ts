import { pgTable, uuid, varchar, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const whatsappUsers = pgTable(
  'whatsapp_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // WhatsApp wa_id — the sender's phone number in international format, no "+" (e.g. "919999999999")
    waId: varchar('wa_id', { length: 20 }).unique().notNull(),
    waName: varchar('wa_name', { length: 100 }),
    crmUserId: uuid('crm_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    isActive: boolean('is_active').notNull().default(true),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_whatsapp_users_crm_user').on(t.crmUserId),
    index('idx_whatsapp_users_active').on(t.isActive),
  ]
);

export type WhatsappUser = typeof whatsappUsers.$inferSelect;
export type NewWhatsappUser = typeof whatsappUsers.$inferInsert;
