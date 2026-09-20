"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workspaceMembersRelations = exports.workspacesRelations = exports.organizationMembersRelations = exports.organizationsRelations = exports.workspaceMembers = exports.workspaceHolidays = exports.workspaces = exports.organizationMembers = exports.organizations = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const enums_1 = require("./enums");
const users_1 = require("./users");
const feature_flags_1 = require("./feature-flags");
exports.organizations = (0, pg_core_1.pgTable)('organizations', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    name: (0, pg_core_1.text)('name').notNull(),
    slug: (0, pg_core_1.text)('slug').notNull().unique(),
    logoUrl: (0, pg_core_1.text)('logo_url'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.organizationMembers = (0, pg_core_1.pgTable)('organization_members', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    organizationId: (0, pg_core_1.uuid)('organization_id')
        .notNull()
        .references(() => exports.organizations.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id')
        .notNull()
        .references(() => users_1.users.id, { onDelete: 'cascade' }),
    role: (0, enums_1.orgRoleEnum)('role').notNull().default('member'),
    joinedAt: (0, pg_core_1.timestamp)('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    uniqueOrgUser: (0, pg_core_1.unique)('uq_organization_members_org_user').on(t.organizationId, t.userId),
}));
exports.workspaces = (0, pg_core_1.pgTable)('workspaces', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    organizationId: (0, pg_core_1.uuid)('organization_id').notNull().references(() => exports.organizations.id, { onDelete: 'cascade' }),
    name: (0, pg_core_1.text)('name').notNull(),
    slug: (0, pg_core_1.text)('slug').notNull(),
    logoUrl: (0, pg_core_1.text)('logo_url'),
    primaryColor: (0, pg_core_1.text)('primary_color'),
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
    purpose: (0, pg_core_1.text)('purpose'),
    comingFrom: (0, pg_core_1.text)('coming_from'),
    // Secondary brand accent (Plan §13.5). Applied app-wide alongside
    // primaryColor; drives the design system's --accent CSS variable.
    accentColor: (0, pg_core_1.text)('accent_color'),
    customDomain: (0, pg_core_1.text)('custom_domain'),
    // Custom-domain verification (Plan §13): a TXT token the owner adds to DNS.
    customDomainToken: (0, pg_core_1.text)('custom_domain_token'),
    customDomainVerified: (0, pg_core_1.boolean)('custom_domain_verified').notNull().default(false),
    isArchived: (0, pg_core_1.boolean)('is_archived').notNull().default(false),
    // Commercial plan tier (Plan §14.1). Defaults to 'enterprise' so the internal
    // tool keeps every feature + unlimited limits — gating is opt-in SaaS
    // scaffolding that never restricts an enterprise workspace. Tier definitions
    // live in apps/api/src/modules/plans/plans.constants.ts.
    plan: (0, pg_core_1.text)('plan').notNull().default('enterprise'),
    // Optional per-workspace override of the tier's numeric limits / feature flags
    // (e.g. a negotiated deal). NULL = use the code-defined tier defaults.
    planLimits: (0, pg_core_1.jsonb)('plan_limits').$type(),
    // §A4.2 sharing policy. `defaultSpacePrivate` makes a newly created space
    // members-only unless the creator opts out; `blockPublicSharing` withdraws the
    // right to mint anonymous public links at all. Both default to the permissive
    // behaviour every existing workspace already has.
    defaultSpacePrivate: (0, pg_core_1.boolean)('default_space_private').notNull().default(false),
    blockPublicSharing: (0, pg_core_1.boolean)('block_public_sharing').notNull().default(false),
    // ISO weekday numbers that count as working days: 1 = Monday … 7 = Sunday.
    // Capacity was already per member; this is what told Workload which days that
    // capacity is spread across, so a Sat/Sun team is no longer counted as idle.
    workDays: (0, pg_core_1.integer)('work_days').array().notNull().default([1, 2, 3, 4, 5]),
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
    aiMinutesSavedPerRun: (0, pg_core_1.integer)('ai_minutes_saved_per_run').notNull().default(6),
    /** In cents, so a rate never rounds through a float on its way to a total. */
    aiHourlyRateCents: (0, pg_core_1.integer)('ai_hourly_rate_cents').notNull().default(5000),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
/** Company-wide days off. Excluded from working days everywhere workDays is. */
exports.workspaceHolidays = (0, pg_core_1.pgTable)('workspace_holidays', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => exports.workspaces.id, { onDelete: 'cascade' }),
    day: (0, pg_core_1.date)('day').notNull(),
    name: (0, pg_core_1.text)('name').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [(0, pg_core_1.uniqueIndex)('uq_workspace_holidays_day').on(t.workspaceId, t.day)]);
exports.workspaceMembers = (0, pg_core_1.pgTable)('workspace_members', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => exports.workspaces.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    role: (0, enums_1.userRoleEnum)('role').notNull().default('member'),
    // Weekly capacity in hours, used by Workload report.
    weeklyCapacityHours: (0, pg_core_1.integer)('weekly_capacity_hours').notNull().default(40),
    // Who this person reports to, per workspace — the same person can report to
    // different people in different workspaces. SET NULL on the manager leaving,
    // which surfaces them as unassigned in the tree rather than dropping them.
    managerId: (0, pg_core_1.uuid)('manager_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    joinedAt: (0, pg_core_1.timestamp)('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    uniqueWorkspaceUser: (0, pg_core_1.unique)('uq_workspace_members_workspace_user').on(t.workspaceId, t.userId),
    byManager: (0, pg_core_1.index)('workspace_members_manager_idx').on(t.managerId),
}));
exports.organizationsRelations = (0, drizzle_orm_1.relations)(exports.organizations, ({ many }) => ({
    workspaces: many(exports.workspaces),
    members: many(exports.organizationMembers),
}));
exports.organizationMembersRelations = (0, drizzle_orm_1.relations)(exports.organizationMembers, ({ one }) => ({
    organization: one(exports.organizations, {
        fields: [exports.organizationMembers.organizationId],
        references: [exports.organizations.id],
    }),
    user: one(users_1.users, {
        fields: [exports.organizationMembers.userId],
        references: [users_1.users.id],
    }),
}));
exports.workspacesRelations = (0, drizzle_orm_1.relations)(exports.workspaces, ({ one, many }) => ({
    organization: one(exports.organizations, { fields: [exports.workspaces.organizationId], references: [exports.organizations.id] }),
    members: many(exports.workspaceMembers),
    featureFlags: many(feature_flags_1.featureFlags),
}));
exports.workspaceMembersRelations = (0, drizzle_orm_1.relations)(exports.workspaceMembers, ({ one }) => ({
    workspace: one(exports.workspaces, { fields: [exports.workspaceMembers.workspaceId], references: [exports.workspaces.id] }),
    user: one(users_1.users, { fields: [exports.workspaceMembers.userId], references: [users_1.users.id] }),
}));
//# sourceMappingURL=workspaces.js.map