import { ListsService } from './lists.service';
import { ScopedStatusesService } from './scoped-statuses.service';
import type { StatusScope } from '../../common/statuses/status-resolution';
export declare class ListsController {
    private listsService;
    private scopedStatuses;
    constructor(listsService: ListsService, scopedStatuses: ScopedStatusesService);
    setStatusScope(listId: string, body: {
        scope: StatusScope;
    }): Promise<{
        listId: string;
        scope: StatusScope;
        changed: boolean;
    }>;
    getListsByProject(projectId: string, user: any): Promise<{
        id: string;
        projectId: string;
        spaceId: string | null;
        name: string;
        description: string | null;
        position: number;
        statusScope: "list" | "space" | "project";
        createdById: string | null;
        isArchived: boolean;
        archivedAt: Date | null;
        archivedById: string | null;
        visibility: "public" | "private";
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    /**
     * §G15-10 — the lists that live directly in a space.
     *
     * Declared BEFORE `:listId`, or Nest matches this path as a list whose id is
     * the word "space" and answers 404 for a route that exists.
     */
    /**
     * §V2-02 — the Planner's default-list picker needs the whole workspace.
     *
     * Declared BEFORE `@Get(':listId')`, or `/lists/workspace/<id>` arrives as a
     * list id and 404s — the same ordering trap `/spaces/presets` hit.
     */
    byWorkspace(workspaceId: string, user: any): Promise<{
        id: string;
        name: string;
        projectId: string;
        spaceId: string;
    }[]>;
    getListsBySpace(spaceId: string, user: any): Promise<{
        id: string;
        projectId: string;
        spaceId: string | null;
        name: string;
        description: string | null;
        position: number;
        statusScope: "list" | "space" | "project";
        createdById: string | null;
        isArchived: boolean;
        archivedAt: Date | null;
        archivedById: string | null;
        visibility: "public" | "private";
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    getList(listId: string): Promise<{
        id: string;
        projectId: string;
        spaceId: string | null;
        name: string;
        description: string | null;
        position: number;
        statusScope: "list" | "space" | "project";
        createdById: string | null;
        isArchived: boolean;
        archivedAt: Date | null;
        archivedById: string | null;
        visibility: "public" | "private";
        createdAt: Date;
        updatedAt: Date;
    }>;
    createList(user: any, body: {
        projectId?: string;
        /** §G15-10 — a List made by choosing a Space and nothing else. */
        spaceId?: string;
        name: string;
        description?: string;
        visibility?: 'public' | 'private';
    }): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        isArchived: boolean;
        description: string | null;
        createdById: string | null;
        archivedAt: Date | null;
        archivedById: string | null;
        visibility: "public" | "private";
        spaceId: string | null;
        position: number;
        projectId: string;
        statusScope: "list" | "space" | "project";
    }>;
    reorderLists(projectId: string, user: any, body: {
        orderedIds: string[];
    }): Promise<{
        id: string;
        projectId: string;
        spaceId: string | null;
        name: string;
        description: string | null;
        position: number;
        statusScope: "list" | "space" | "project";
        createdById: string | null;
        isArchived: boolean;
        archivedAt: Date | null;
        archivedById: string | null;
        visibility: "public" | "private";
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    updateList(listId: string, user: any, body: Partial<{
        name: string;
        description: string;
        visibility: 'public' | 'private';
    }>): Promise<{
        id: string;
        projectId: string;
        spaceId: string | null;
        name: string;
        description: string | null;
        position: number;
        statusScope: "list" | "space" | "project";
        createdById: string | null;
        isArchived: boolean;
        archivedAt: Date | null;
        archivedById: string | null;
        visibility: "public" | "private";
        createdAt: Date;
        updatedAt: Date;
    }>;
    /** Move a list into another project (its tasks follow). */
    moveList(listId: string, user: any, ip: string, body: {
        projectId: string;
    }): Promise<{
        id: string;
        projectId: string;
        spaceId: string | null;
        name: string;
        description: string | null;
        position: number;
        statusScope: "list" | "space" | "project";
        createdById: string | null;
        isArchived: boolean;
        archivedAt: Date | null;
        archivedById: string | null;
        visibility: "public" | "private";
        createdAt: Date;
        updatedAt: Date;
    }>;
    deleteList(listId: string, user: any, ip: string): Promise<{
        message: string;
    }>;
}
