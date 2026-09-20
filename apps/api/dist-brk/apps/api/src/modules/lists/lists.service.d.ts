import type { Db } from '@rundesk/db';
import { SecurityService } from '../security/security.service';
export declare class ListsService {
    private db;
    private security;
    constructor(db: Db, security: SecurityService);
    /**
     * §G15 [22:07] — "yeh pooch raha ke PRIVATE karni hai ke nahi."
     *
     * Visibility is settable at creation, not only afterwards. The column and the
     * update path have always carried it; this endpoint dropped it on the floor,
     * so the only way to get a private list was to create a public one and then
     * change it — which is a window, however short, in which the wrong people
     * can see it. Omitted still means public, exactly as before.
     */
    /**
     * §G15-10 [21:49–21:54] — the container that makes "a List in a Space" work.
     *
     * Resolved, then created if absent. `project_id` on a list is NOT NULL and
     * stays that way: 114 inner joins across 34 files reach a list's workspace
     * through its project — the resource guard among them — so a list with no
     * project would 404 for everybody while quietly disappearing from search,
     * the knowledge index, notifications and reminders. The hierarchy the person
     * sees is Space → List; this is what carries it.
     *
     * The insert races safely. Two people creating a list in the same empty space
     * at once both find nothing and both insert; the partial unique index in
     * migration 0129 lets exactly one win, and the loser re-reads rather than
     * failing — which is why this is written as insert-then-reread and not as a
     * check-then-act.
     */
    defaultContainerForSpace(spaceId: string, actorId?: string): Promise<string>;
    /**
     * §G15-10 — the lists that live directly in a space.
     *
     * Everything in the space's hidden container, which is exactly the set that
     * was created by choosing a Space and nothing else.
     */
    getListsBySpace(spaceId: string, actor?: {
        id: string;
        role?: string;
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
    /**
     * §V2-S11 frame `08:50` — "List name taken".
     *
     * The constraint lives in the database (migration 0147, a partial
     * case-insensitive unique index) so two requests racing cannot both win. This
     * check exists so the ANSWER is a 409 with the frame's words rather than a
     * bare Postgres unique-violation surfacing as a 500 — the person typed a
     * name, and what they need back is that the name is taken.
     *
     * Archived lists are excluded, matching the index: a name in the bin does not
     * reserve itself forever.
     */
    private assertListNameFree;
    createList(projectId: string, data: {
        name: string;
        description?: string;
        visibility?: 'public' | 'private';
    }, actorId?: string): Promise<{
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
    getListsByProject(projectId: string, actor?: {
        id: string;
        role?: string;
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
    /**
     * §V2-02 — every list in a workspace the actor may see.
     *
     * Added for the Planner's "Default list for new tasks" picker (frame
     * `14:10`), which needs to offer the whole workspace. Lists were reachable
     * only per-project and per-space, so a workspace-wide picker would have had
     * to walk every space from the browser — one request per space, and a
     * different visibility answer than the server would give.
     *
     * The same `listVisibilityFilter` the per-project read uses, resolved once
     * for the workspace rather than once per project: a private list you cannot
     * open must not be offerable as the place your tasks land.
     */
    getListsByWorkspace(workspaceId: string, actor?: {
        id: string;
        role?: string;
    }): Promise<{
        id: string;
        name: string;
        projectId: string;
        spaceId: string;
    }[]>;
    /** Reorder lists within a project; writes each list's position to its index. */
    reorderLists(projectId: string, orderedIds: string[], actorId?: string): Promise<{
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
    updateList(listId: string, data: Partial<{
        name: string;
        description: string;
        visibility: 'public' | 'private';
    }>, actorId?: string): Promise<{
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
    deleteList(listId: string, actorId?: string, ipAddress?: string): Promise<void>;
    /**
     * Move a list into another project (its tasks follow). The destination must
     * be in the same workspace and not archived.
     */
    moveList(listId: string, targetProjectId: string, actorId?: string, ipAddress?: string): Promise<{
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
    private assertManageable;
}
