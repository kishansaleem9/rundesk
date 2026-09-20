import type { Db } from '@rundesk/db';
import { type StatusScope } from '../../common/statuses/status-resolution';
export type StatusCategory = 'open' | 'in_progress' | 'closed';
export type TemplateScope = 'space' | 'project';
type StatusInput = {
    name: string;
    color?: string;
    category?: StatusCategory;
};
type StatusPatch = {
    name?: string;
    color?: string;
    category?: StatusCategory;
};
/**
 * CRUD for Space- and Project-scoped status templates (see 0036). Mirrors
 * ListStatusesService, but a template is shared by every list that adopts the
 * scope, so category changes and deletes fan out to tasks across ALL of those
 * lists — never orphaning a task's status.
 */
export declare class ScopedStatusesService {
    private db;
    constructor(db: Db);
    private table;
    private ownerCol;
    list(scope: TemplateScope, containerId: string): Promise<({
        id: string;
        spaceId: string;
        key: string;
        name: string;
        color: string;
        category: import("@rundesk/db").StatusCategory;
        position: number;
        createdAt: Date;
        updatedAt: Date;
    } | {
        id: string;
        projectId: string;
        key: string;
        name: string;
        color: string;
        category: import("@rundesk/db").StatusCategory;
        position: number;
        createdAt: Date;
        updatedAt: Date;
    })[]>;
    private getByKey;
    private requireById;
    private nextPosition;
    private assertContainerExists;
    /** Ids of every list that currently draws its statuses from this template. */
    private affectedListIds;
    create(scope: TemplateScope, containerId: string, input: StatusInput): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        color: string;
        spaceId: string;
        position: number;
        category: import("@rundesk/db").StatusCategory;
        key: string;
    } | {
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        color: string;
        position: number;
        projectId: string;
        category: import("@rundesk/db").StatusCategory;
        key: string;
    }>;
    update(scope: TemplateScope, containerId: string, statusId: string, patch: StatusPatch): Promise<{
        id: string;
        spaceId: string;
        key: string;
        name: string;
        color: string;
        category: import("@rundesk/db").StatusCategory;
        position: number;
        createdAt: Date;
        updatedAt: Date;
    } | {
        id: string;
        projectId: string;
        key: string;
        name: string;
        color: string;
        category: import("@rundesk/db").StatusCategory;
        position: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    remove(scope: TemplateScope, containerId: string, statusId: string, reassignToStatusId?: string | null): Promise<{
        ok: boolean;
        reassignedCount: number;
    }>;
    /**
     * Switch which scope a list draws its statuses from. Refuses the switch if
     * the target status set is empty, or if any status key currently used by a
     * task on the list is absent from the target set (which would orphan it).
     */
    setListScope(listId: string, target: StatusScope): Promise<{
        listId: string;
        scope: StatusScope;
        changed: boolean;
    }>;
    reorder(scope: TemplateScope, containerId: string, orderedIds: string[]): Promise<({
        id: string;
        spaceId: string;
        key: string;
        name: string;
        color: string;
        category: import("@rundesk/db").StatusCategory;
        position: number;
        createdAt: Date;
        updatedAt: Date;
    } | {
        id: string;
        projectId: string;
        key: string;
        name: string;
        color: string;
        category: import("@rundesk/db").StatusCategory;
        position: number;
        createdAt: Date;
        updatedAt: Date;
    })[]>;
}
export {};
