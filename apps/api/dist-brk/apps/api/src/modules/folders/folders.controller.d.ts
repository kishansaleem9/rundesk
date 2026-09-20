import { FoldersService } from './folders.service';
export declare class FoldersController {
    private folders;
    constructor(folders: FoldersService);
    list(spaceId: string, user: any): Promise<{
        id: string;
        spaceId: string;
        name: string;
        color: string | null;
        position: number;
        createdById: string | null;
        isArchived: boolean;
        archivedAt: Date | null;
        archivedById: string | null;
        visibility: "public" | "private";
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    create(spaceId: string, user: any, body: {
        name: string;
        color?: string;
    }): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        isArchived: boolean;
        color: string | null;
        createdById: string | null;
        archivedAt: Date | null;
        archivedById: string | null;
        visibility: "public" | "private";
        spaceId: string;
        position: number;
    }>;
    update(spaceId: string, folderId: string, body: {
        name?: string;
        color?: string;
        position?: number;
        visibility?: 'public' | 'private';
    }): Promise<{
        id: string;
        spaceId: string;
        name: string;
        color: string | null;
        position: number;
        createdById: string | null;
        isArchived: boolean;
        archivedAt: Date | null;
        archivedById: string | null;
        visibility: "public" | "private";
        createdAt: Date;
        updatedAt: Date;
    }>;
    /** Move the folder (and the projects it groups) into another space. */
    move(spaceId: string, folderId: string, body: {
        targetSpaceId: string;
    }, user: any, ip: string): Promise<{
        ok: boolean;
        movedProjects: number;
    }>;
    remove(spaceId: string, folderId: string, user: any, ip: string): Promise<{
        ok: boolean;
    }>;
}
