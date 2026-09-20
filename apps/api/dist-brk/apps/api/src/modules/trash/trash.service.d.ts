import type { Db } from '@rundesk/db';
import { SecurityService } from '../security/security.service';
import { SearchService } from '../search/search.service';
/** Item kinds the workspace Trash can hold. */
export declare const TRASH_TYPES: readonly ["space", "folder", "project", "list", "task", "doc"];
export type TrashType = (typeof TRASH_TYPES)[number];
/** Deleted items are kept this long before the nightly purge removes them. */
export declare const TRASH_RETENTION_DAYS = 30;
export interface TrashItem {
    id: string;
    type: TrashType;
    name: string;
    /** Human breadcrumb of where the item used to live, e.g. "Product › Website Redesign". */
    location: string;
    deletedAt: string | null;
    deletedBy: {
        id: string;
        name: string;
        avatarUrl: string | null;
    } | null;
}
export interface TrashQuery {
    types?: TrashType[];
    /** Restrict to items deleted by these users (the "Deleted by" filter). */
    deletedByIds?: string[];
    search?: string;
}
export declare class TrashService {
    private db;
    private security;
    private search;
    private readonly logger;
    constructor(db: Db, security: SecurityService, search: SearchService);
    /**
     * Workspace admins/managers (and super admins) administer the whole Trash.
     * A regular member still gets a Trash, but only of the items they deleted
     * themselves — so one member can undo their own mistake without being handed
     * everyone else's deleted work.
     */
    private resolveScope;
    private assertAdmin;
    list(workspaceId: string, actor: {
        id: string;
        role?: string;
    }, query?: TrashQuery): Promise<TrashItem[]>;
    /** Distinct users who have deleted something here — powers the "Deleted by" filter. */
    deleters(workspaceId: string, actor: {
        id: string;
        role?: string;
    }): Promise<{
        id: string;
        name: string;
        avatarUrl: string | null;
    }[]>;
    /**
     * Resolve the item's workspace, who deleted it, and WHETHER IT IS ACTUALLY IN
     * THE TRASH, or throw.
     *
     * That last part was missing. `locate` looked the row up by id alone, so
     * `DELETE /workspaces/:id/trash/task/:taskId` would hard-delete a task that
     * had never been deleted — an admin, or the person who happened to have
     * archived it, could destroy a live task through an endpoint whose whole
     * contract is "this thing is already in the bin". Both callers
     * (`restore`, `deleteForever`) go through here, and restore on a live item
     * was silently a no-op reported as success.
     */
    private locate;
    /** Admins act on anything; a member may only act on what they deleted. */
    private assertMayAct;
    private assertType;
    /**
     * Un-archive the item **and its ancestors** — restoring a task whose list was
     * also deleted must actually make the task reachable again, otherwise the
     * restore silently appears to do nothing.
     */
    restore(workspaceId: string, rawType: string, id: string, actor: {
        id: string;
        role?: string;
    }, ip?: string): Promise<{
        ok: boolean;
    }>;
    /** Re-index one restored task — the ids the index needs are a join away. */
    private reindexTask;
    /** Hard-delete a single trashed item. Children cascade via FKs. */
    deleteForever(workspaceId: string, rawType: string, id: string, actor: {
        id: string;
        role?: string;
    }, ip?: string): Promise<{
        ok: boolean;
    }>;
    /** Empty the whole workspace trash — admin only. */
    clearAll(workspaceId: string, actor: {
        id: string;
        role?: string;
    }, ip?: string): Promise<{
        ok: boolean;
        removed: number;
    }>;
    /**
     * Items sit in the Trash for TRASH_RETENTION_DAYS and are then removed for
     * good, matching the "deleted forever after 30 days" promise in the UI.
     */
    purgeExpired(): Promise<{
        removed: number;
    }>;
}
