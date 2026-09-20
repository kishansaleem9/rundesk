import { ScopedStatusesService, type StatusCategory } from './scoped-statuses.service';
type Body_ = {
    name: string;
    color?: string;
    category?: StatusCategory;
};
type Patch_ = {
    name?: string;
    color?: string;
    category?: StatusCategory;
};
export declare class SpaceStatusesController {
    private statuses;
    constructor(statuses: ScopedStatusesService);
    list(spaceId: string): Promise<({
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
    create(spaceId: string, body: Body_): Promise<{
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
    update(spaceId: string, statusId: string, body: Patch_): Promise<{
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
    remove(spaceId: string, statusId: string, reassignToStatusId?: string): Promise<{
        ok: boolean;
        reassignedCount: number;
    }>;
    reorder(spaceId: string, body: {
        orderedIds: string[];
    }): Promise<({
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
export declare class ProjectStatusesController {
    private statuses;
    constructor(statuses: ScopedStatusesService);
    list(projectId: string): Promise<({
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
    create(projectId: string, body: Body_): Promise<{
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
    update(projectId: string, statusId: string, body: Patch_): Promise<{
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
    remove(projectId: string, statusId: string, reassignToStatusId?: string): Promise<{
        ok: boolean;
        reassignedCount: number;
    }>;
    reorder(projectId: string, body: {
        orderedIds: string[];
    }): Promise<({
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
