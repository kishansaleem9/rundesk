import { ListStatusesService, type StatusCategory } from './list-statuses.service';
export declare class ListStatusesController {
    private statuses;
    constructor(statuses: ListStatusesService);
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
    create(listId: string, body: {
        name: string;
        color?: string;
        category?: StatusCategory;
    }): Promise<{
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
    update(listId: string, statusId: string, body: {
        name?: string;
        color?: string;
        category?: StatusCategory;
    }): Promise<{
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
    remove(listId: string, statusId: string, reassignToStatusId?: string): Promise<{
        ok: boolean;
        reassignedCount: number;
    }>;
    reorder(listId: string, body: {
        orderedIds: string[];
    }): Promise<{
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
}
