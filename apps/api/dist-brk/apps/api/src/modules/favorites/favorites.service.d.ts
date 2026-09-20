import type { Db } from '@rundesk/db';
export type FavoriteEntityType = 'space' | 'list' | 'task' | 'doc' | 'channel';
export declare class FavoritesService {
    private db;
    constructor(db: Db);
    private assertType;
    /**
     * Resolve display metadata for a batch of entity ids of one type, scoped to
     * the workspace. Ids that don't exist (or moved out of the workspace) are
     * simply absent from the returned map, which drives dangling-row pruning.
     */
    private resolveBatch;
    /** List a user's favorites in a workspace, hydrated + pruned of dangling rows. */
    list(workspaceId: string, userId: string, actorRole?: string): Promise<{
        id: string;
        entityType: FavoriteEntityType;
        entityId: string;
        label: string;
        url: string;
        createdAt: Date;
    }[]>;
    /** Add or remove a favorite; returns the new favorited state. */
    toggle(workspaceId: string, userId: string, entityType: string, entityId: string, actorRole?: string): Promise<{
        favorited: boolean;
        entityType: FavoriteEntityType;
        entityId: string;
    }>;
    /** Remove a favorite (idempotent). */
    remove(workspaceId: string, userId: string, entityType: string, entityId: string): Promise<{
        favorited: boolean;
        entityType: FavoriteEntityType;
        entityId: string;
    }>;
}
