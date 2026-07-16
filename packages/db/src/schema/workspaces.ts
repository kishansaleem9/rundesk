import { pgTable, text, timestamp, boolean, uuid, unique, integer } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { userRoleEnum, orgRoleEnum } from './enums'
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

export const organizationMembers = pgTable(
  'organization_members',
  {
    id:             uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId:         uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role:           orgRoleEnum('role').notNull().default('member'),
    joinedAt:       timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueOrgUser: unique('uq_organization_members_org_user').on(t.organizationId, t.userId),
  }),
)

export const workspaces = pgTable('workspaces', {
  id:             uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name:           text('name').notNull(),
  slug:           text('slug').notNull(),
  logoUrl:        text('logo_url'),
  primaryColor:   text('primary_color'),
  // Secondary brand accent (Plan §13.5). Applied app-wide alongside
  // primaryColor; drives the design system's --accent CSS variable.
  accentColor:    text('accent_color'),
  customDomain:   text('custom_domain'),
  // Custom-domain verification (Plan §13): a TXT token the owner adds to DNS.
  customDomainToken:    text('custom_domain_token'),
  customDomainVerified: boolean('custom_domain_verified').notNull().default(false),
  isArchived:     boolean('is_archived').notNull().default(false),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    id:                   uuid('id').primaryKey().defaultRandom(),
    workspaceId:          uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId:               uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role:                 userRoleEnum('role').notNull().default('member'),
    // Weekly capacity in hours, used by Workload report.
    weeklyCapacityHours:  integer('weekly_capacity_hours').notNull().default(40),
    joinedAt:             timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueWorkspaceUser: unique('uq_workspace_members_workspace_user').on(t.workspaceId, t.userId),
  }),
)

export const organizationsRelations = relations(organizations, ({ many }) => ({
  workspaces: many(workspaces),
  members:    many(organizationMembers),
}))

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, {
    fields:     [organizationMembers.organizationId],
    references: [organizations.id],
  }),
  user:         one(users, {
    fields:     [organizationMembers.userId],
    references: [users.id],
  }),
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
