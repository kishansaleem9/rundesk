import { SearchService } from './search.service';
export declare class SearchController {
    private search;
    constructor(search: SearchService);
    /**
     * §G03-6 — somebody opened a search result.
     *
     * Its own endpoint rather than a side effect of the search call: what makes
     * a thing trending is being OPENED, not being returned. Counting appearances
     * would rank whatever the index happens to match most often, which is a
     * measure of the query and not of anybody's interest.
     */
    recordOpen(workspaceId: string, user: {
        id: string;
    }, body: {
        entityType?: string;
        entityId?: string;
    }): Promise<{
        ok: true;
    }>;
    /**
     * §G02-9 — the sources this workspace can search, and which are connected.
     *
     * Declared BEFORE `:workspaceId`, or Nest reads "sources" as a workspace id
     * and answers 404 for a route that exists.
     */
    sources(workspaceId: string): Promise<{
        id: import("./sources").SearchSource;
        connected: boolean;
        provider: string | null;
    }[]>;
    query(workspaceId: string, user: {
        id: string;
    }, q: string, limit?: string, types?: string, statusCategory?: string, priority?: string, assigneeId?: string, creatorId?: string, includeArchived?: string, labelId?: string, taskTypeId?: string, dueAfter?: string, dueBefore?: string, createdAfter?: string, createdBefore?: string, spaceId?: string, folderId?: string, listId?: string, customFieldId?: string, customFieldValue?: string, sort?: string): Promise<{
        id: string;
        entityType: string;
        title: string;
        content: string;
        url: string;
    }[]>;
    customFields(workspaceId: string): Promise<{
        id: string;
        name: string;
        type: "number" | "date" | "email" | "labels" | "text" | "url" | "dropdown" | "checkbox" | "phone" | "money" | "rating" | "progress_auto" | "long_text" | "people" | "location" | "tshirt_size" | "progress_manual" | "files" | "voting";
        options: {
            label: string;
            value: string;
            color?: string;
        }[] | null;
        projectId: string;
        projectName: string;
    }[]>;
    reindex(workspaceId: string): Promise<{
        indexed: number;
    } | undefined>;
    listSaved(workspaceId: string, user: any): Promise<{
        id: string;
        workspaceId: string;
        userId: string;
        name: string;
        query: string | null;
        filters: Record<string, unknown>;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    createSaved(workspaceId: string, user: any, body: {
        name: string;
        query?: string | null;
        filters?: Record<string, unknown>;
    }): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        workspaceId: string;
        query: string | null;
        userId: string;
        filters: Record<string, unknown>;
    }>;
    deleteSaved(id: string, user: any): Promise<{
        ok: boolean;
    }>;
}
