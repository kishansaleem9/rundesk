import { pgTable, text, timestamp, uuid, boolean, index, uniqueIndex, check } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { users } from './users'
import { workspaces } from './workspaces'
import { sealedText } from './sealed-text'

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
export const userCalendarAccounts = pgTable(
  'user_calendar_accounts',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    provider:    text('provider').notNull(),
    /** The provider's own id. Re-connecting refreshes rather than duplicating. */
    externalAccountId:    text('external_account_id').notNull(),
    externalAccountEmail: text('external_account_email'),
    /**
     * Which calendar inside the account. Google calls the one named after your
     * address `primary`, which is why the frame's Default picker shows an
     * email. Stored now so per-sub-calendar choice needs no migration later.
     */
    externalCalendarId:   text('external_calendar_id').notNull().default('primary'),
    /*
     * Tokens live here and must never leave the API. Every read path projects
     * an explicit column list for that reason — `select()` with no argument on
     * this table would put a refresh token in a JSON response.
     */
    accessToken:     sealedText('access_token', 'user_calendar_accounts.access_token'),
    refreshToken:    sealedText('refresh_token', 'user_calendar_accounts.refresh_token'),
    tokenExpiresAt:  timestamp('token_expires_at', { withTimezone: true }),
    scopes:          text('scopes').array().notNull().default([]),
    status:          text('status').notNull().default('connected'),
    /** Frame `13:50` — "Default calendar": where new events are written. */
    isDefault:       boolean('is_default').notNull().default(false),
    /** Frame `13:50` — "Busy calendars": read to decide when you are busy. */
    countsAsBusy:    boolean('counts_as_busy').notNull().default(true),
    createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_user_calendar_accounts_account').on(
      t.userId, t.workspaceId, t.provider, t.externalAccountId,
    ),
    /*
     * At most one default, enforced by the DATABASE rather than by whoever
     * writes the next endpoint. "Where do new events go" has exactly one
     * answer, and two rows claiming it is not a state read paths should have
     * to resolve.
     */
    uniqueIndex('uq_user_calendar_accounts_default')
      .on(t.userId, t.workspaceId)
      .where(sql`is_default`),
    index('idx_user_calendar_accounts_user').on(t.userId, t.workspaceId),
    // Made by 0141. Declared here as well: a database built by
    // `drizzle-kit push` (the lanes, CI, a fresh deploy) reads only this file.
    check('user_calendar_accounts_provider', sql`${t.provider} IN ('gcal', 'outlook')`),
  ],
)

export const userCalendarAccountsRelations = relations(userCalendarAccounts, ({ one }) => ({
  user:      one(users,      { fields: [userCalendarAccounts.userId],      references: [users.id] }),
  workspace: one(workspaces, { fields: [userCalendarAccounts.workspaceId], references: [workspaces.id] }),
}))

/**
 * The shape a calendar account may be shown as.
 *
 * Named and exported so every read path spells the same safe columns, and so a
 * new endpoint cannot accidentally widen it: tokens are absent by construction
 * rather than by the author remembering.
 */
export const PUBLIC_CALENDAR_ACCOUNT_COLUMNS = {
  id: userCalendarAccounts.id,
  provider: userCalendarAccounts.provider,
  externalAccountEmail: userCalendarAccounts.externalAccountEmail,
  externalCalendarId: userCalendarAccounts.externalCalendarId,
  status: userCalendarAccounts.status,
  isDefault: userCalendarAccounts.isDefault,
  countsAsBusy: userCalendarAccounts.countsAsBusy,
  createdAt: userCalendarAccounts.createdAt,
} as const
