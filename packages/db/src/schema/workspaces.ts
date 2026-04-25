import { pgTable, text, timestamp, boolean, uuid } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { userRoleEnum } from './enums'
import { users } from './users'
import { featureFlags } from './feature-flags'

export const organizations = pgTable('organizations', {
  id:        uuid('id').primaryKey().defaultRandom(),
  name:      text('name').notNull(),
  slug:      text('slug').notNull().unique(),
  logoUrl:   text('logo_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const workspaces = pgTable('workspaces', {
  id:             uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name:           text('name').notNull(),
  slug:           text('slug').notNull(),
  logoUrl:        text('logo_url'),
  primaryColor:   text('primary_color'),
  customDomain:   text('custom_domain'),
  isArchived:     boolean('is_archived').notNull().default(false),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const workspaceMembers = pgTable('workspace_members', {
  id:          uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role:        userRoleEnum('role').notNull().default('member'),
  joinedAt:    timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
})

export const organizationsRelations = relations(organizations, ({ many }) => ({
  workspaces: many(workspaces),
}))

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  organization:     one(organizations, { fields: [workspaces.organizationId], references: [organizations.id] }),
  members:          many(workspaceMembers),
  featureFlags:     many(featureFlags),
}))

export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, { fields: [workspaceMembers.workspaceId], references: [workspaces.id] }),
  user:      one(users, { fields: [workspaceMembers.userId], references: [users.id] }),
}))
