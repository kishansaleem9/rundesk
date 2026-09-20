import type { Db } from '@rundesk/db';
export type StatusCategory = 'open' | 'in_progress' | 'closed';
export type ListStatusCreateInput = {
    name: string;
    color?: string;
    category?: StatusCategory;
};
export type ListStatusUpdateInput = {
    name?: string;
    color?: string;
    category?: StatusCategory;
};
export declare class ListStatusesService {
    private db;
    constructor(db: Db);
    list(listId: string): Promise<{
        listId: string;
        scope: "project";
        id: string;
        projectId: string;
        key: string;
        name: string;
        color: string;
        category: import("@rundesk/db").StatusCategory;
        position: number;
        createdAt: Date;
        updatedAt: Date;
    }[] | {
        listId: string;
        scope: "space";
        id: string;
        spaceId: string;
        key: string;
        name: string;
        color: string;
        category: import("@rundesk/db").StatusCategory;
        position: number;
        createdAt: Date;
        updatedAt: Date;
    }[] | {
        scope: "list";
        id: string;
        listId: string;
        key: string;
        name: string;
        color: string;
        category: import("@rundesk/db").StatusCategory;
        position: number;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    /**
     * List-level status mutations are only valid when the list owns its own
     * pipeline. If it inherits a project/space template, the caller must edit
     * that template instead (409, so the UI can redirect).
     */
    private assertOwnScope;
    /**
     * Return the canonical id, name, color, and category for a status `key`
     * on a list. Used by tasks.service to validate status changes and derive
     * the status_category bucket atomically.
     */
    getByKey(listId: string, key: string): Promise<{
        id: string;
        listId: string;
        key: string;
        name: string;
        color: string;
        category: import("@rundesk/db").StatusCategory;
        position: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    create(listId: string, input: ListStatusCreateInput): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        color: string;
        position: number;
        listId: string;
        category: import("@rundesk/db").StatusCategory;
        key: string;
    }>;
    update(listId: string, statusId: string, patch: ListStatusUpdateInput): Promise<{
        id: string;
        listId: string;
        key: string;
        name: string;
        color: string;
        category: import("@rundesk/db").StatusCategory;
        position: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /**
     * Delete a status. If any tasks still reference it the caller must pass
     * `reassignToStatusId` so we can rebind them atomically; we never delete
     * a status that would orphan tasks.
     */
    remove(listId: string, statusId: string, reassignToStatusId?: string | null): Promise<{
        ok: boolean;
        reassignedCount: number;
    }>;
    /**
     * Bulk reorder. Caller passes the full id array in the desired order;
     * we rewrite `position` to match the array index so subsequent reads
     * stay deterministic.
     */
    reorder(listId: string, orderedIds: string[]): Promise<{
        listId: string;
        scope: "project";
        id: string;
        projectId: string;
        key: string;
        name: string;
        color: string;
        category: import("@rundesk/db").StatusCategory;
        position: number;
        createdAt: Date;
        updatedAt: Date;
    }[] | {
        listId: string;
        scope: "space";
        id: string;
        spaceId: string;
        key: string;
        name: string;
        color: string;
        category: import("@rundesk/db").StatusCategory;
        position: number;
        createdAt: Date;
        updatedAt: Date;
    }[] | {
        scope: "list";
        id: string;
        listId: string;
        key: string;
        name: string;
        color: string;
        category: import("@rundesk/db").StatusCategory;
        position: number;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    private requireById;
    private nextPosition;
    private assertListExists;
}
