import type { Db } from '@rundesk/db';
/**
 * Task Types — what a row *is*, not what state it is in. "Task", "Campaign",
 * "Invoice", "Bug". ClickUp puts these beside the title; a team's vocabulary
 * for its own work matters more than the settings furniture around it.
 *
 * Workspace-scoped, and every route re-checks membership: the types hang off a
 * workspace, but they are applied from a task, so there is no single resource a
 * guard could key on across both.
 */
export declare class TaskTypesService {
    private db;
    constructor(db: Db);
    private assertMember;
    private assertAdmin;
    /** The workspace a task belongs to, walking list → project → space. */
    private workspaceOfTask;
    private clean;
    list(workspaceId: string, userId: string): Promise<{
        id: string;
        workspaceId: string;
        name: string;
        icon: string | null;
        color: string | null;
        isDefault: boolean;
        isMilestone: boolean;
        origin: string | null;
        position: number;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    create(workspaceId: string, userId: string, body: {
        name: string;
        icon?: string | null;
        color?: string | null;
        isDefault?: boolean;
    }): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        workspaceId: string;
        color: string | null;
        icon: string | null;
        position: number;
        isMilestone: boolean;
        isDefault: boolean;
        origin: string | null;
    }>;
    /**
     * The partial unique index allows exactly one default per workspace, so a new
     * default has to unset the old one first or the insert/update is rejected by
     * the database. That rejection is the point — the constraint is real, and this
     * is the one place allowed to satisfy it.
     */
    private clearDefault;
    update(workspaceId: string, typeId: string, userId: string, body: {
        name?: string;
        icon?: string | null;
        color?: string | null;
        isDefault?: boolean;
        position?: number;
    }): Promise<{
        id: string;
        workspaceId: string;
        name: string;
        icon: string | null;
        color: string | null;
        isDefault: boolean;
        isMilestone: boolean;
        origin: string | null;
        position: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /**
     * Deleting a type does not delete the work filed under it — the column is
     * `ON DELETE SET NULL`, so those tasks come back untyped. The count is
     * returned so the UI can say how many were affected rather than doing it
     * silently.
     */
    remove(workspaceId: string, typeId: string, userId: string): Promise<{
        ok: boolean;
        untypedTasks: number;
    }>;
    /**
     * Make sure the workspace still has exactly one default, promoting the first
     * remaining type if it has none. A workspace with types but no default is a
     * silently broken state: tasks come out untyped and nothing says why.
     */
    private ensureDefault;
    /** Scoped by workspace, so a valid id from another tenant reads as missing. */
    private byId;
    /** Apply a type to a task, or clear it with `null`. */
    setForTask(taskId: string, typeId: string | null, userId: string): Promise<{
        id: string;
        taskTypeId: string | null;
        isMilestone: boolean;
    }>;
}
