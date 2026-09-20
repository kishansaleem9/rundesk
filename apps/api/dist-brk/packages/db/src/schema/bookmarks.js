"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workspaceBookmarks = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
const workspaces_1 = require("./workspaces");
/**
 * §G01-9 [00:35] — the Overview's "Bookmarks" card.
 *
 * > "Bookmarks make it easy to save ClickUp items or any URL from around the
 * >  web." + "Add Bookmark"
 *
 * Deliberately NOT folded into the existing favourites, which is the obvious
 * shortcut and the wrong one. `user_dock_configs.navFavorites` holds
 * `{ label, path }` — internal nav paths, resolved by the router. The whole
 * point of a bookmark is "**or any URL from around the web**": a favourite that
 * pointed at `https://…` would be handed to `navigate()` and go nowhere, which
 * is the shape this audit has already found twice.
 *
 * Per person, per workspace. A bookmark is somebody's own shortlist — the
 * spec's card sits in their Overview — and a shared one would need permissions,
 * ownership and a story for what happens when the person leaves.
 */
exports.workspaceBookmarks = (0, pg_core_1.pgTable)('workspace_bookmarks', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    /** What to call it. Falls back to the URL when somebody saves without one. */
    title: (0, pg_core_1.text)('title').notNull(),
    /**
     * Where it goes. Either an in-app path ("/app/…") or an absolute http(s)
     * URL — the second is the reason this table exists. Validated on the way in
     * rather than trusted: a `javascript:` bookmark is a script on this origin.
     */
    url: (0, pg_core_1.text)('url').notNull(),
    position: (0, pg_core_1.integer)('position').notNull().default(0),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [(0, pg_core_1.index)('idx_workspace_bookmarks_owner').on(t.workspaceId, t.userId, t.position)]);
//# sourceMappingURL=bookmarks.js.map