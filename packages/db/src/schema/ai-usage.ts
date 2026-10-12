import { pgTable, text, timestamp, uuid, integer, index, uniqueIndex, check } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'

/**
 * One row per Claude API call (Plan §7.15). Token counts drive per-user and
 * per-workspace usage + estimated-cost reporting. workspace_id/user_id are
 * nullable (SET NULL on delete) so historical usage survives member removal.
 *
 * §V2-11, frame `19:05` — THE TABLE NOW RECORDS FAILURES TOO, and that is the
 * whole reason a Status filter can exist. Until migration 0150 `recordUsage`
 * fired only on the success path, so every row in here was a success and a
 * "Status" control would have been a dropdown with one reachable value — the
 * facade this audit exists to catch. `status` has no default of convenience:
 * every writer states which one it is.
 */
export const aiUsage = pgTable(
  'ai_usage',
  {
    id:           uuid('id').primaryKey().defaultRandom(),
    workspaceId:  uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
    userId:       uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    feature:      text('feature').notNull(),
    model:        text('model').notNull(),
    inputTokens:  integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    /**
     * `succeeded` | `failed`. Defaulted to `succeeded` ONLY so the rows that
     * existed before 0150 keep their meaning — every one of them was a success,
     * because nothing else was ever written.
     */
    status:       text('status').notNull().default('succeeded'),
    /**
     * Why it failed, as a short machine token — `not_configured`,
     * `rate_limited`, `provider_error`. Read by the rate limiter, which must
     * NOT count a run it refused itself: charging someone for a call that never
     * reached the provider would lock them out for an hour over nothing.
     */
    errorCode:    text('error_code'),
    /** The sentence a person is shown. Truncated by the writer, not by the column. */
    errorMessage: text('error_message'),
    /**
     * WHAT THE CALL COST IN AI CREDITS (migration 0185; `commit-log/log-3943965-1`):
     * its estimated cost at ClickUp's price of a credit, a tenth of a cent, and
     * never nothing for a call that answered (`creditsFor`). Nothing for a
     * failure: a call that never reached the model used no credits.
     */
    credits:      integer('credits').notNull().default(0),
    createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_ai_usage_workspace_created').on(t.workspaceId, t.createdAt),
    index('idx_ai_usage_user').on(t.userId),
    // The activity log's default read is "this workspace, newest first, of this
    // status"; without the status leg it is a filter applied after the scan.
    index('idx_ai_usage_workspace_status').on(t.workspaceId, t.status, t.createdAt),
    // Made by 0150. Declared here as well: a database built by
    // `drizzle-kit push` (the lanes, CI, a fresh deploy) reads only this file.
    check('ai_usage_status_check', sql`${t.status} IN ('succeeded', 'failed')`),
  ],
)

export const aiUsageRelations = relations(aiUsage, ({ one }) => ({
  workspace: one(workspaces, { fields: [aiUsage.workspaceId], references: [workspaces.id] }),
  user:      one(users, { fields: [aiUsage.userId], references: [users.id] }),
}))

/**
 * §V2-S18 `[17:28]`–`[17:32]` — "apna [preferred] AI bhi set down karna hai."
 *
 * WHY THIS TABLE EXISTS AT ALL. The composer's model picker has had a
 * preference since §15, and it lived in `localStorage` under `rundesk.aiTier`.
 * That is not a preference, it is a per-browser habit: sign in from a second
 * machine, or from a private window, and the choice you "set" is gone. The
 * frame calls it *setting your preferred AI*, and a preferred anything has to
 * follow the person.
 *
 * PER WORKSPACE, NOT PER ACCOUNT. Somebody can reasonably want the cheap fast
 * tier in a busy shared workspace and the deep one where they do the thinking,
 * and a single account-wide value cannot express that. `(user_id, workspace_id)`
 * is unique, so the write is an idempotent upsert rather than a read-then-write.
 *
 * DELIBERATELY CO-LOCATED with `ai_usage` rather than given its own file: the
 * schema barrel re-exports this module already, and this audit runs several
 * agents over one tree, so a new file would mean editing a shared index for one
 * line. The table is AI-domain state either way.
 */
export const aiModelPreferences = pgTable(
  'ai_model_preferences',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    /**
     * A `ModelTier['id']` — `fast` or `deep`. Stored as the TIER and not as a
     * model name on purpose: the model behind a tier is ours to change, and a
     * preference pinned to `claude-sonnet-4-6` would quietly stop resolving the
     * day that name moves. `modelForTier` already falls back rather than throws,
     * so an unknown value here costs nobody their answer.
     */
    preferredTier: text('preferred_tier').notNull(),
    updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ai_model_preferences_user_workspace').on(t.userId, t.workspaceId),
  ],
)

export const aiModelPreferencesRelations = relations(aiModelPreferences, ({ one }) => ({
  user:      one(users, { fields: [aiModelPreferences.userId], references: [users.id] }),
  workspace: one(workspaces, { fields: [aiModelPreferences.workspaceId], references: [workspaces.id] }),
}))
