import { pgTable, uuid, varchar, text, timestamp, integer, boolean, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const aiChatSessions = pgTable(
  'ai_chat_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_chat_sessions_user').on(t.userId),
  ]
);

export const aiChatMessages = pgTable(
  'ai_chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id').notNull().references(() => aiChatSessions.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 10 }).$type<'user' | 'assistant'>().notNull(),
    content: text('content').notNull(),
    sqlQuery: text('sql_query'),
    queryResultCount: integer('query_result_count'),
    wasClarification: boolean('was_clarification').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_chat_messages_session').on(t.sessionId),
  ]
);

export type AiChatSession = typeof aiChatSessions.$inferSelect;
export type NewAiChatSession = typeof aiChatSessions.$inferInsert;
export type AiChatMessage = typeof aiChatMessages.$inferSelect;
export type NewAiChatMessage = typeof aiChatMessages.$inferInsert;
