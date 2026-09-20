import { FavoritesService } from './favorites.service';
import type { CurrentUserPayload } from '../tasks/types';
export declare class FavoritesController {
    private favorites;
    constructor(favorites: FavoritesService);
    list(workspaceId: string, user: CurrentUserPayload): Promise<{
        id: string;
        entityType: import("./favorites.service").FavoriteEntityType;
        entityId: string;
        label: string;
        url: string;
        createdAt: Date;
    }[]>;
    toggle(workspaceId: string, user: CurrentUserPayload, body: {
        entityType: string;
        entityId: string;
    }): Promise<{
        favorited: boolean;
        entityType: import("./favorites.service").FavoriteEntityType;
        entityId: string;
    }>;
    remove(workspaceId: string, user: CurrentUserPayload, entityType: string, entityId: string): Promise<{
        favorited: boolean;
        entityType: import("./favorites.service").FavoriteEntityType;
        entityId: string;
    }>;
}
