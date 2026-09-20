import { type SQL } from 'drizzle-orm';
import type { Db } from '@rundesk/db';
/**
 * Per-item privacy (§2) for tasks / lists / folders. A row whose `visibility`
 * is 'private' is only visible to:
 *   - workspace managers / admins / super_admins (they see everything), and
 *   - the row's creator (createdById), and
 *   - for TASKS additionally: any of its assignees.
 * Public rows (the default) are always visible.
 *
 * This lives on top of the space/project container privacy — a private
 * space/project already hides everything nested inside it; these filters add a
 * finer, per-item restriction WITHIN a container the caller can otherwise see.
 *
 * Every collection read that returns tasks/lists/folders to a user must AND the
 * relevant filter into its WHERE clause, or a private item leaks. Single-item
 * (by-id) reads are gated by ResourceMemberGuard, which enforces the same rule.
 */
export declare const WS_MANAGER_ROLES: string[];
export declare function isManagerRole(role: string | null | undefined): boolean;
/**
 * Resolve whether an actor sees everything in a workspace (super_admin, or a
 * workspace_admin/manager member). Self-contained so read paths compute it
 * themselves rather than trusting a caller to pass the right flag.
 */
export declare function resolveIsManager(db: Db, workspaceId: string, userId: string, globalRole?: string | null): Promise<boolean>;
/**
 * WHERE fragment keeping only tasks the actor may see. Returns `undefined` for
 * managers (no restriction) so callers can `and(...conds, taskVisibilityFilter())`
 * — drizzle's `and` ignores undefined. Uses a drizzle subquery (not raw SQL) so
 * `tasks.id` binds correctly in both the query builder and the relational query
 * API (which aliases the table).
 */
export declare function taskVisibilityFilter(db: Db, actorId: string, isManager: boolean): SQL | undefined;
/** WHERE fragment keeping only lists the actor may see (unaliased `lists`). */
export declare function listVisibilityFilter(actorId: string, isManager: boolean): SQL | undefined;
/** WHERE fragment keeping only folders the actor may see (unaliased `folders`). */
export declare function folderVisibilityFilter(actorId: string, isManager: boolean): SQL | undefined;
/**
 * In-memory equivalent of the filters above, for guards / single rows already
 * fetched. `isAssignee` only matters for tasks.
 */
export declare function canSeePrivateItem(item: {
    visibility?: string | null;
    createdById?: string | null;
}, actor: {
    userId: string;
    isManager: boolean;
    isAssignee?: boolean;
}): boolean;
