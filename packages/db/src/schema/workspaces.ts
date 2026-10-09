import { pgTable, text, timestamp, boolean, uuid, unique, uniqueIndex, index, integer, jsonb, date, check } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
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
  /**
   * §7 — what the creation flow asked, and what it was told.
   *
   * "Main 'New Workspace' par click karoongi … same layout jo aap ne abhi kiya
   * tha [signup ke waqt]" [08:43], and "Skip ya step, aur yahan se different
   * tool search kar sakti hoon" [08:54].
   *
   * Kept rather than discarded. The frame pass noted the equivalent answers
   * being collected and thrown away, which is worse than not asking: it costs
   * someone two steps and buys them nothing. `purpose` shapes what the new
   * workspace starts with; `comingFrom` is what they were using before, and is
   * null when they skip — a skip is an answer too, and not the same as never
   * having been asked.
   */
  purpose:        text('purpose'),
  comingFrom:     text('coming_from'),
  // Secondary brand accent (Plan §13.5). Applied app-wide alongside
  // primaryColor; drives the design system's --accent CSS variable.
  accentColor:    text('accent_color'),
  customDomain:   text('custom_domain'),
  // Custom-domain verification (Plan §13): a TXT token the owner adds to DNS.
  customDomainToken:    text('custom_domain_token'),
  customDomainVerified: boolean('custom_domain_verified').notNull().default(false),
  isArchived:     boolean('is_archived').notNull().default(false),
  // Commercial plan tier (Plan §14.1). Defaults to 'enterprise' so the internal
  // tool keeps every feature + unlimited limits — gating is opt-in SaaS
  // scaffolding that never restricts an enterprise workspace. Tier definitions
  // live in apps/api/src/modules/plans/plans.constants.ts.
  plan:           text('plan').notNull().default('enterprise'),
  // Optional per-workspace override of the tier's numeric limits / feature flags
  // (e.g. a negotiated deal). NULL = use the code-defined tier defaults.
  planLimits:     jsonb('plan_limits').$type<{
    maxMembers?: number | null
    maxProjects?: number | null
    features?: Record<string, boolean>
  }>(),
  // §A4.2 sharing policy. `defaultSpacePrivate` makes a newly created space
  // members-only unless the creator opts out; `blockPublicSharing` withdraws the
  // right to mint anonymous public links at all. Both default to the permissive
  // behaviour every existing workspace already has.
  defaultSpacePrivate: boolean('default_space_private').notNull().default(false),
  blockPublicSharing:  boolean('block_public_sharing').notNull().default(false),
  // ISO weekday numbers that count as working days: 1 = Monday … 7 = Sunday.
  // Capacity was already per member; this is what told Workload which days that
  // capacity is spread across, so a Sat/Sun team is no longer counted as idle.
  workDays:       integer('work_days').array().notNull().default([1, 2, 3, 4, 5]),
  /**
   * §V2-11 — the benchmark the AI value panel reasons from.
   *
   * Frames `19:00`/`19:05` show Time Saved and Human Cost Savings at an
   * editable $/hour, with "Edit benchmark". Time saved cannot be measured, only
   * estimated, so the estimate's inputs belong to the workspace rather than to
   * a constant in our code — one team's guess must not be shown to another team
   * as a fact.
   *
   * The unit is an AI RUN (one `ai_usage` row, one model call), not an
   * "action": a single user action can be several runs, and counting runs as
   * actions would overstate the saving invisibly.
   */
  aiMinutesSavedPerRun: integer('ai_minutes_saved_per_run').notNull().default(6),
  /** In cents, so a rate never rounds through a float on its way to a total. */
  aiHourlyRateCents:    integer('ai_hourly_rate_cents').notNull().default(5000),
  /**
   * WHO MAY OPEN THE TEAMS HUB'S ANALYTICS — ClickUp's two choices: everyone
   * but guests (`members`), or the workspace's owners and admins (`admins`),
   * set on the Analytics page by those who turn the ClickApp on
   * (`ledger-rows/section3-team-analytics`). Guests never.
   */
  analyticsAudience: text('analytics_audience').notNull().default('members'),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Made by 0140. Declared here as well: a database built by
  // `drizzle-kit push` (the lanes, CI, a fresh deploy) reads only this file.
  check('workspaces_ai_minutes_saved_sane', sql`${t.aiMinutesSavedPerRun} >= 0 AND ${t.aiMinutesSavedPerRun} <= 480`),
  check('workspaces_ai_hourly_rate_sane', sql`${t.aiHourlyRateCents} >= 0 AND ${t.aiHourlyRateCents} <= 10000000`),
  // Made by 0177.
  check('workspaces_analytics_audience_known', sql`${t.analyticsAudience} in ('members', 'admins')`),
])

/** Company-wide days off. Excluded from working days everywhere workDays is. */
export const workspaceHolidays = pgTable(
  'workspace_holidays',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    day:         date('day').notNull(),
    name:        text('name').notNull(),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('uq_workspace_holidays_day').on(t.workspaceId, t.day)],
)

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    id:                   uuid('id').primaryKey().defaultRandom(),
    workspaceId:          uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId:               uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role:                 userRoleEnum('role').notNull().default('member'),
    // Weekly capacity in hours, used by Workload report.
    weeklyCapacityHours:  integer('weekly_capacity_hours').notNull().default(40),
    // Who this person reports to, per workspace — the same person can report to
    // different people in different workspaces. SET NULL on the manager leaving,
    // which surfaces them as unassigned in the tree rather than dropping them.
    managerId:            uuid('manager_id').references(() => users.id, { onDelete: 'set null' }),
    joinedAt:             timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    /*
     * WHAT THIS PERSON MAY DO WHERE THEY ONLY VIEW — ClickUp's four individual
     * permissions for view-only members and guests, set per person by an owner
     * or admin: time estimates and time tracking on, adding or removing tags and
     * creating views off (help centre, "Manage individual permissions for view
     * only users"; `found-25-sep/view-only-individual-permissions`). Asked only
     * where the person's level on the location is View (`viewOnlyMay`).
     */
    viewOnlyTimeEstimates: boolean('view_only_time_estimates').notNull().default(true),
    viewOnlyTimeTracking:  boolean('view_only_time_tracking').notNull().default(true),
    viewOnlyTags:          boolean('view_only_tags').notNull().default(false),
    viewOnlyCreateViews:   boolean('view_only_create_views').notNull().default(false),
  },
  (t) => ({
    uniqueWorkspaceUser: unique('uq_workspace_members_workspace_user').on(t.workspaceId, t.userId),
    byManager:           index('workspace_members_manager_idx').on(t.managerId),
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
