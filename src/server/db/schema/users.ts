import { pgTable, uuid, varchar, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { roles } from './roles';
import type { UserStatus } from '@/lib/types';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).unique().notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    avatarUrl: text('avatar_url'),
    phone: varchar('phone', { length: 20 }),
    roleId: uuid('role_id').notNull().references(() => roles.id),
    status: varchar('status', { length: 20 }).$type<UserStatus>().notNull().default('active'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    preferences: jsonb('preferences').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_users_email').on(t.email),
    index('idx_users_role').on(t.roleId),
    index('idx_users_status').on(t.status),
  ]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
