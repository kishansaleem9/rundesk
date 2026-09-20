"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiModelPreferencesRelations = exports.aiModelPreferences = exports.aiUsageRelations = exports.aiUsage = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
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
exports.aiUsage = (0, pg_core_1.pgTable)('ai_usage', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').references(() => workspaces_1.workspaces.id, { onDelete: 'set null' }),
    userId: (0, pg_core_1.uuid)('user_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    feature: (0, pg_core_1.text)('feature').notNull(),
    model: (0, pg_core_1.text)('model').notNull(),
    inputTokens: (0, pg_core_1.integer)('input_tokens').notNull().default(0),
    outputTokens: (0, pg_core_1.integer)('output_tokens').notNull().default(0),
    /**
     * `succeeded` | `failed`. Defaulted to `succeeded` ONLY so the rows that
     * existed before 0150 keep their meaning — every one of them was a success,
     * because nothing else was ever written.
     */
    status: (0, pg_core_1.text)('status').notNull().default('succeeded'),
    /**
     * Why it failed, as a short machine token — `not_configured`,
     * `rate_limited`, `provider_error`. Read by the rate limiter, which must
     * NOT count a run it refused itself: charging someone for a call that never
     * reached the provider would lock them out for an hour over nothing.
     */
    errorCode: (0, pg_core_1.text)('error_code'),
    /** The sentence a person is shown. Truncated by the writer, not by the column. */
    errorMessage: (0, pg_core_1.text)('error_message'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.index)('idx_ai_usage_workspace_created').on(t.workspaceId, t.createdAt),
    (0, pg_core_1.index)('idx_ai_usage_user').on(t.userId),
    // The activity log's default read is "this workspace, newest first, of this
    // status"; without the status leg it is a filter applied after the scan.
    (0, pg_core_1.index)('idx_ai_usage_workspace_status').on(t.workspaceId, t.status, t.createdAt),
]);
exports.aiUsageRelations = (0, drizzle_orm_1.relations)(exports.aiUsage, ({ one }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.aiUsage.workspaceId], references: [workspaces_1.workspaces.id] }),
    user: one(users_1.users, { fields: [exports.aiUsage.userId], references: [users_1.users.id] }),
}));
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
exports.aiModelPreferences = (0, pg_core_1.pgTable)('ai_model_preferences', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    /**
     * A `ModelTier['id']` — `fast` or `deep`. Stored as the TIER and not as a
     * model name on purpose: the model behind a tier is ours to change, and a
     * preference pinned to `claude-sonnet-4-6` would quietly stop resolving the
     * day that name moves. `modelForTier` already falls back rather than throws,
     * so an unknown value here costs nobody their answer.
     */
    preferredTier: (0, pg_core_1.text)('preferred_tier').notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.uniqueIndex)('ai_model_preferences_user_workspace').on(t.userId, t.workspaceId),
]);
exports.aiModelPreferencesRelations = (0, drizzle_orm_1.relations)(exports.aiModelPreferences, ({ one }) => ({
    user: one(users_1.users, { fields: [exports.aiModelPreferences.userId], references: [users_1.users.id] }),
    workspace: one(workspaces_1.workspaces, { fields: [exports.aiModelPreferences.workspaceId], references: [workspaces_1.workspaces.id] }),
}));
//# sourceMappingURL=ai-usage.js.map