import { BookmarksService } from './bookmarks.service';
/** §G01-9 — the Overview's Bookmarks card. */
export declare class BookmarksController {
    private readonly bookmarks;
    constructor(bookmarks: BookmarksService);
    list(workspaceId: string, user: {
        id: string;
    }): Promise<{
        id: string;
        workspaceId: string;
        userId: string;
        title: string;
        url: string;
        position: number;
        createdAt: Date;
    }[]>;
    create(workspaceId: string, user: {
        id: string;
    }, body: {
        title?: string;
        url?: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        workspaceId: string;
        userId: string;
        position: number;
        title: string;
        url: string;
    }>;
    remove(workspaceId: string, bookmarkId: string, user: {
        id: string;
    }): Promise<{
        ok: boolean;
    }>;
}
