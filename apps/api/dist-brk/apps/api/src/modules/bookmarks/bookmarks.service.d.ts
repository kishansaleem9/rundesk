import type { Db } from '@rundesk/db';
/**
 * §G01-9 [00:35] — "save ClickUp items or any URL from around the web".
 *
 * The "any URL" half is what makes this its own thing rather than another
 * favourite, and it is also the half that needs care: a stored link is handed
 * back to a browser, so what may be stored is decided here and not at the point
 * it is clicked.
 */
export declare class BookmarksService {
    private db;
    constructor(db: Db);
    private assertMember;
    /**
     * What may be saved.
     *
     * An in-app path, or an absolute http(s) URL. Everything else is refused —
     * `javascript:` most of all, because a bookmark is rendered as a link and
     * clicking one would run script on this origin. `data:` and `blob:` go the
     * same way for the same reason. Checked on the way IN so a row that exists is
     * a row that is safe to render, rather than leaving every future read path to
     * remember.
     */
    static normalizeUrl(raw: unknown): string;
    list(workspaceId: string, userId: string): Promise<{
        id: string;
        workspaceId: string;
        userId: string;
        title: string;
        url: string;
        position: number;
        createdAt: Date;
    }[]>;
    create(workspaceId: string, userId: string, body: {
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
    remove(workspaceId: string, userId: string, bookmarkId: string): Promise<{
        ok: boolean;
    }>;
}
