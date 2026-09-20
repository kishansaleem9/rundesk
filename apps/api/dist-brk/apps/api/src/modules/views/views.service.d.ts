import type { Db, ViewVisibility } from '@rundesk/db';
type ViewType = 'list' | 'board' | 'calendar' | 'gantt' | 'table';
export type ViewActor = {
    id: string;
    role?: string;
};
export declare class ViewsService {
    private db;
    constructor(db: Db);
    /**
     * Is this actor a manager of the workspace the view's list belongs to?
     *
     * Resolved from the view rather than passed in, because the caller that
     * matters (`PATCH /views/:viewId`) knows a view id and nothing else — a
     * workspace id it took from the request body would be the caller's claim
     * about which workspace to check, which is not a check.
     */
    private isManagerOfViewsWorkspace;
    /**
     * The views on a list that this actor may see, pinned ones first.
     *
     * A private view belonging to somebody else is not in the result. Not
     * greyed out, not listed as "private" — absent, because the NAME of a
     * private view is part of what makes it private.
     *
     * `autosave` rides along per row: it is this actor's own flag, so the tab
     * strip can render the switch without a second round trip per view.
     */
    listByList(listId: string, actor: ViewActor): Promise<{
        id: string;
        listId: string;
        createdById: string | null;
        name: string;
        type: "list" | "board" | "calendar" | "gantt" | "table" | "team";
        isDefault: boolean;
        isPinned: boolean;
        visibility: ViewVisibility;
        position: number;
        config: Record<string, unknown>;
        createdAt: Date;
        updatedAt: Date;
        autosave: boolean;
    }[]>;
    create(data: {
        listId: string;
        name: string;
        type: ViewType;
        config?: Record<string, unknown>;
        visibility?: ViewVisibility;
        createdById: string;
    }): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        createdById: string | null;
        visibility: ViewVisibility;
        position: number;
        listId: string;
        isDefault: boolean;
        type: "list" | "board" | "calendar" | "gantt" | "table" | "team";
        isPinned: boolean;
        config: Record<string, unknown>;
    }>;
    /**
     * Read one view, or 404 — the single place that decides whether this actor
     * is allowed to know a view exists.
     */
    private loadVisible;
    getOne(viewId: string, actor: ViewActor): Promise<{
        id: string;
        listId: string;
        createdById: string | null;
        name: string;
        type: "list" | "board" | "calendar" | "gantt" | "table" | "team";
        isDefault: boolean;
        isPinned: boolean;
        visibility: ViewVisibility;
        position: number;
        config: Record<string, unknown>;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /**
     * Who may change a view.
     *
     *   private    its creator, and nobody else — they are the only one who can
     *              see it, so there is nobody else to ask.
     *   protected  its creator and the workspace's managers. This is the switch's
     *              entire purpose.
     *   everyone   anyone who can open the list, which is what every view was
     *              before this existed, and what ClickUp does with an unprotected
     *              view. Protect view is how you opt out of it.
     */
    private assertMayWrite;
    update(viewId: string, patch: {
        name?: string;
        config?: Record<string, unknown>;
        position?: number;
        isDefault?: boolean;
        isPinned?: boolean;
        visibility?: ViewVisibility;
    }, actor: ViewActor): Promise<{
        id: string;
        listId: string;
        createdById: string | null;
        name: string;
        type: "list" | "board" | "calendar" | "gantt" | "table" | "team";
        isDefault: boolean;
        isPinned: boolean;
        visibility: ViewVisibility;
        position: number;
        config: Record<string, unknown>;
        createdAt: Date;
        updatedAt: Date;
    }>;
    delete(viewId: string, actor: ViewActor): Promise<{
        ok: boolean;
    }>;
    /**
     * "Autosave for me" — per user, by the tooltip in frame `10:36`. Reading a
     * view you may see is enough to set your own flag on it; you are not
     * changing the view.
     */
    setAutosave(viewId: string, actor: ViewActor, autosave: boolean): Promise<{
        viewId: string;
        autosave: boolean;
    }>;
}
export {};
