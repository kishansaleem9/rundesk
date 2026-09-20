import { TrashService } from './trash.service';
/**
 * §13.4 Workspace Trash — one place to see everything that was deleted
 * (spaces, folders, projects, lists, tasks, docs) and either restore it or
 * remove it for good. Membership is enforced by the guard; the service further
 * narrows a non-admin to the items they deleted themselves.
 */
export declare class TrashController {
    private readonly trash;
    constructor(trash: TrashService);
    /** Comma-separated query lists ("task,folder") → validated array. */
    private parseTypes;
    list(workspaceId: string, user: any, types?: string, deletedBy?: string, search?: string): Promise<{
        items: import("./trash.service").TrashItem[];
        retentionDays: number;
        types: readonly ["space", "folder", "project", "list", "task", "doc"];
    }>;
    deleters(workspaceId: string, user: any): Promise<{
        id: string;
        name: string;
        avatarUrl: string | null;
    }[]>;
    restore(workspaceId: string, type: string, id: string, user: any, ip: string): Promise<{
        ok: boolean;
    }>;
    deleteForever(workspaceId: string, type: string, id: string, user: any, ip: string): Promise<{
        ok: boolean;
    }>;
    clearAll(workspaceId: string, user: any, ip: string): Promise<{
        ok: boolean;
        removed: number;
    }>;
}
