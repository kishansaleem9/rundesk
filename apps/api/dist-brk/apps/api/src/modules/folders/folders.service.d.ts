import type { Db } from '@rundesk/db';
import { SecurityService } from '../security/security.service';
export declare class FoldersService {
    private db;
    private security;
    constructor(db: Db, security: SecurityService);
    listBySpace(spaceId: string, actor?: {
        id: string;
        role?: string;
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
    }[]>;
    create(spaceId: string, data: {
        name: string;
        color?: string;
    }, actorId?: string): Promise<{
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
    update(spaceId: string, folderId: string, patch: {
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
    /**
     * Move a folder into a different space, taking its projects with it.
     *
     * `projects` carries BOTH `spaceId` and `folderId`, so moving only the folder
     * would leave its projects pointing at a space they no longer live in — they
     * would vanish from both spaces. The two are updated together.
     *
     * Cross-workspace moves are rejected: a folder must stay inside the tenant it
     * was created in.
     */
    move(spaceId: string, folderId: string, targetSpaceId: string, actorId?: string, ipAddress?: string): Promise<{
        ok: boolean;
        movedProjects: number;
    }>;
    /**
     * §13.4 — deleting a folder ARCHIVES it (soft delete) so it can be restored
     * from the workspace Trash. It used to be hard-deleted, which made a folder
     * the one container that could never be recovered.
     *
     * The folder's projects keep their `folderId`, so restoring the folder brings
     * its contents back grouped exactly as before; while the folder is archived
     * every read path treats those projects as sitting directly under the space.
     */
    remove(spaceId: string, folderId: string, actorId?: string, ipAddress?: string): Promise<{
        ok: boolean;
    }>;
}
