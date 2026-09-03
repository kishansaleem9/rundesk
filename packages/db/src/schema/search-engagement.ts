import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './users'
import { workspaces } from './workspaces'

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
export const searchEngagement = pgTable(
  'search_engagement',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** The search hit's own composite id — "task-<uuid>", "doc-<uuid>", … */
    entityType:  text('entity_type').notNull(),
    entityId:    text('entity_id').notNull(),
    openedAt:    timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Both questions the two sort modes ask: "what is the workspace opening"
    // and "what am I opening", each within a time window.
    index('idx_search_engagement_workspace').on(t.workspaceId, t.openedAt),
    index('idx_search_engagement_user').on(t.workspaceId, t.userId, t.openedAt),
  ],
)
