import { pgTable, uuid, varchar, jsonb, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import type { ConversationReference } from '@microsoft/teams.api';

export const teamsUsers = pgTable(
  'teams_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Microsoft Entra ID (Azure AD) Object ID — a stable GUID, the Teams equivalent of
    // Telegram's telegram_user_id / WhatsApp's wa_id.
    aadObjectId: varchar('aad_object_id', { length: 36 }).unique().notNull(),
    teamsName: varchar('teams_name', { length: 100 }),
    // Bot Framework has no static "send by ID" API — proactive sends (notifyUser) need a
    // conversation reference captured from this user's most recent inbound activity to
    // resume a 1:1 conversation without them having messaged first.
    conversationReference: jsonb('conversation_reference').$type<ConversationReference>(),
    crmUserId: uuid('crm_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    isActive: boolean('is_active').notNull().default(true),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_teams_users_crm_user').on(t.crmUserId),
    index('idx_teams_users_active').on(t.isActive),
  ]
);

export type TeamsUser = typeof teamsUsers.$inferSelect;
export type NewTeamsUser = typeof teamsUsers.$inferInsert;
