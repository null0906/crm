import { pgTable, bigserial, uuid, varchar, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

export const teamsMessageLog = pgTable(
  'teams_message_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    aadObjectId: varchar('aad_object_id', { length: 36 }),
    // 'inbound' | 'outbound'
    direction: varchar('direction', { length: 10 }).notNull(),
    command: varchar('command', { length: 50 }),
    rawMessage: text('raw_message'),
    parsedData: jsonb('parsed_data'),
    // 'success' | 'error' | 'unauthorized' | 'ignored'
    resultStatus: varchar('result_status', { length: 20 }),
    resultMessage: text('result_message'),
    entityType: varchar('entity_type', { length: 30 }),
    entityId: uuid('entity_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_teams_log_user').on(t.aadObjectId),
    index('idx_teams_log_created').on(t.createdAt),
    index('idx_teams_log_command').on(t.command),
    index('idx_teams_log_status').on(t.resultStatus),
  ]
);

export type TeamsMessageLog = typeof teamsMessageLog.$inferSelect;
export type NewTeamsMessageLog = typeof teamsMessageLog.$inferInsert;
