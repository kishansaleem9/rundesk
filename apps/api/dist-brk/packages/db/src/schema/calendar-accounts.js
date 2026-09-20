"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PUBLIC_CALENDAR_ACCOUNT_COLUMNS = exports.userCalendarAccountsRelations = exports.userCalendarAccounts = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const users_1 = require("./users");
const workspaces_1 = require("./workspaces");
/**
 * §V2-14 — a person's connected calendars. More than one, and theirs.
 *
 * `[13:32]`–`[13:38]` "'Manage Account' pe click karoongi … 'Add Account' … aur
 * jitna chahoon main add kar sakti hoon." Frame `13:50` is the list, with a
 * Default calendar and a set of Busy calendars beneath it.
 *
 * WHY A NEW TABLE RATHER THAN A RELAXED CONSTRAINT.
 * `workspace_integration_connections` is unique on (workspace_id, provider) and
 * the OAuth callback UPSERTS on that key — so connecting a second Google
 * account never failed, it silently replaced the first and orphaned every
 * `task_calendar_links` row pointing at it. It is also owned by the WORKSPACE
 * with a `connected_by_id`, so it was one calendar for everybody rather than
 * one each. The unit of ownership has to move to the person; multiple accounts
 * then follow from that rather than the other way round.
 *
 * THE TWO FLAGS ARE DIFFERENT IN KIND, not in rank — this is what the frame
 * means by a primary and a secondary calendar. `isDefault` is where new events
 * are WRITTEN; `countsAsBusy` is whether the calendar is READ when working out
 * when somebody is free. A person with a work account and a personal one wants
 * work as the default and BOTH counted as busy, which is why one is a single
 * choice enforced by a partial unique index and the other is a plain boolean.
 */
exports.userCalendarAccounts = (0, pg_core_1.pgTable)('user_calendar_accounts', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    provider: (0, pg_core_1.text)('provider').notNull(),
    /** The provider's own id. Re-connecting refreshes rather than duplicating. */
    externalAccountId: (0, pg_core_1.text)('external_account_id').notNull(),
    externalAccountEmail: (0, pg_core_1.text)('external_account_email'),
    /**
     * Which calendar inside the account. Google calls the one named after your
     * address `primary`, which is why the frame's Default picker shows an
     * email. Stored now so per-sub-calendar choice needs no migration later.
     */
    externalCalendarId: (0, pg_core_1.text)('external_calendar_id').notNull().default('primary'),
    /*
     * Tokens live here and must never leave the API. Every read path projects
     * an explicit column list for that reason — `select()` with no argument on
     * this table would put a refresh token in a JSON response.
     */
    accessToken: (0, pg_core_1.text)('access_token'),
    refreshToken: (0, pg_core_1.text)('refresh_token'),
    tokenExpiresAt: (0, pg_core_1.timestamp)('token_expires_at', { withTimezone: true }),
    scopes: (0, pg_core_1.text)('scopes').array().notNull().default([]),
    status: (0, pg_core_1.text)('status').notNull().default('connected'),
    /** Frame `13:50` — "Default calendar": where new events are written. */
    isDefault: (0, pg_core_1.boolean)('is_default').notNull().default(false),
    /** Frame `13:50` — "Busy calendars": read to decide when you are busy. */
    countsAsBusy: (0, pg_core_1.boolean)('counts_as_busy').notNull().default(true),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.uniqueIndex)('uq_user_calendar_accounts_account').on(t.userId, t.workspaceId, t.provider, t.externalAccountId),
    /*
     * At most one default, enforced by the DATABASE rather than by whoever
     * writes the next endpoint. "Where do new events go" has exactly one
     * answer, and two rows claiming it is not a state read paths should have
     * to resolve.
     */
    (0, pg_core_1.uniqueIndex)('uq_user_calendar_accounts_default')
        .on(t.userId, t.workspaceId)
        .where((0, drizzle_orm_1.sql) `is_default`),
    (0, pg_core_1.index)('idx_user_calendar_accounts_user').on(t.userId, t.workspaceId),
]);
exports.userCalendarAccountsRelations = (0, drizzle_orm_1.relations)(exports.userCalendarAccounts, ({ one }) => ({
    user: one(users_1.users, { fields: [exports.userCalendarAccounts.userId], references: [users_1.users.id] }),
    workspace: one(workspaces_1.workspaces, { fields: [exports.userCalendarAccounts.workspaceId], references: [workspaces_1.workspaces.id] }),
}));
/**
 * The shape a calendar account may be shown as.
 *
 * Named and exported so every read path spells the same safe columns, and so a
 * new endpoint cannot accidentally widen it: tokens are absent by construction
 * rather than by the author remembering.
 */
exports.PUBLIC_CALENDAR_ACCOUNT_COLUMNS = {
    id: exports.userCalendarAccounts.id,
    provider: exports.userCalendarAccounts.provider,
    externalAccountEmail: exports.userCalendarAccounts.externalAccountEmail,
    externalCalendarId: exports.userCalendarAccounts.externalCalendarId,
    status: exports.userCalendarAccounts.status,
    isDefault: exports.userCalendarAccounts.isDefault,
    countsAsBusy: exports.userCalendarAccounts.countsAsBusy,
    createdAt: exports.userCalendarAccounts.createdAt,
};
//# sourceMappingURL=calendar-accounts.js.map