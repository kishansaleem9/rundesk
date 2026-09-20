"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchEngagement = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
const workspaces_1 = require("./workspaces");
/**
 * §G03-6 [04:00–04:04] — the two sort modes the Sort menu is missing:
 * "Trending In Workspace" and "Trending For You".
 *
 * Trending is a claim about what people are OPENING, and nothing recorded that.
 * The audit note put it plainly: "Real trending needs view/open telemetry per
 * object per user, which Rundesk does not currently record for search targets."
 * So this is that record, and it is the whole reason the feature could not be
 * faked from data already on hand — `updatedAt` tells you what was EDITED,
 * which is a different and much smaller group of people.
 *
 * An append-only event rather than a counter column, deliberately. Trending is
 * about a WINDOW ("what is hot this week"), and a lifetime counter cannot
 * answer that: the busiest task of last quarter would sit at the top forever.
 * Rows are cheap and a window is a WHERE clause.
 *
 * Not a general analytics table. It records one thing — somebody opened this
 * search result — because a table that records everything is one nobody can
 * reason about the size of.
 */
exports.searchEngagement = (0, pg_core_1.pgTable)('search_engagement', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    /** The search hit's own composite id — "task-<uuid>", "doc-<uuid>", … */
    entityType: (0, pg_core_1.text)('entity_type').notNull(),
    entityId: (0, pg_core_1.text)('entity_id').notNull(),
    openedAt: (0, pg_core_1.timestamp)('opened_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    // Both questions the two sort modes ask: "what is the workspace opening"
    // and "what am I opening", each within a time window.
    (0, pg_core_1.index)('idx_search_engagement_workspace').on(t.workspaceId, t.openedAt),
    (0, pg_core_1.index)('idx_search_engagement_user').on(t.workspaceId, t.userId, t.openedAt),
]);
//# sourceMappingURL=search-engagement.js.map