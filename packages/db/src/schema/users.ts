import { pgTable, text, timestamp, boolean, uuid } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { userRoleEnum, oauthProviderEnum } from './enums'
import { workspaceMembers } from './workspaces'
import { sessions } from './auth'

export const users = pgTable('users', {
  id:            uuid('id').primaryKey().defaultRandom(),
  email:         text('email').notNull().unique(),
  displayName:   text('display_name').notNull(),
  avatarUrl:     text('avatar_url'),
  bio:           text('bio'),
  timezone:      text('timezone').notNull().default('UTC'),
  role:          userRoleEnum('role').notNull().default('member'),
  passwordHash:  text('password_hash'),
  emailVerified: boolean('email_verified').notNull().default(false),
  isActive:      boolean('is_active').notNull().default(true),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const oauthAccounts = pgTable('oauth_accounts', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider:     oauthProviderEnum('provider').notNull(),
  providerId:   text('provider_id').notNull(),
  accessToken:  text('access_token'),
  refreshToken: text('refresh_token'),
  expiresAt:    timestamp('expires_at', { withTimezone: true }),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const usersRelations = relations(users, ({ many }) => ({
  sessions:         many(sessions),
  workspaceMembers: many(workspaceMembers),
  oauthAccounts:    many(oauthAccounts),
}))

export const oauthAccountsRelations = relations(oauthAccounts, ({ one }) => ({
  user: one(users, { fields: [oauthAccounts.userId], references: [users.id] }),
}))
