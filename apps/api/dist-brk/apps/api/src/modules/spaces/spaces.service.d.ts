import type { Db, SpaceDefaultPermission } from '@rundesk/db';
import { SecurityService } from '../security/security.service';
import { ListsService } from '../lists/lists.service';
import { PlansService } from '../plans/plans.service';
import { SPACE_VIEW_KEYS } from './space-presets';
export { SPACE_VIEW_KEYS };
export declare class SpacesService {
    private db;
    private security;
    private lists;
    private plans;
    private readonly logger;
    constructor(db: Db, security: SecurityService, lists: ListsService, plans: PlansService);
    /**
     * §V2-06 `[07:20]` — the ClickApps gate, server side.
     *
     * A client-only gate is not a gate: the wizard can draw a padlock on Custom
     * Fields and a `curl` can still post `features: ['customFields']`. This is
     * the line that decides.
     *
     * TWO ANSWERS, ON PURPOSE.
     *
     *   · An EXPLICIT `features` array naming a ClickApp the plan does not reach
     *     is REFUSED (403). Somebody asked for something they do not have, and
     *     silently dropping it is the mirror defect — the request succeeds, the
     *     toast is green, and the switch they set is off when they come back.
     *
     *   · A PRESET's features are FILTERED. The preset is a suggestion Rundesk
     *     made, not a request the person typed; "Marketing Teams" must remain
     *     choosable on a free plan, just with fewer switches on. Refusing here
     *     would make three of the four cards un-clickable on free and blame the
     *     person for picking one.
     */
    private assertClickAppsAllowed;
    /**
     * Rows out of the `spaces` table with their ClickApps narrowed to the plan.
     *
     * A NO-OP on the tiers that withhold nothing (business, enterprise — and
     * enterprise is every existing workspace), so the rows a workspace that is
     * not being gated receives are byte-for-byte what they were. That matters:
     * `features: null` means "predates the column, everything on", and
     * materialising it into a map on a plan that changes nothing would rewrite
     * the meaning of every existing space for no reason.
     */
    private narrowToPlan;
    /**
     * §V2-06 — "Create a Space", frames `06:52` and `07:06`.
     *
     * Everything past `name` was already accepted here and never sent: both web
     * call sites POSTed `{ workspaceId, name }` and nothing else, so description,
     * colour and icon were live parameters no UI could reach. The wizard now
     * fills them, and brings four more the frames ask for — default permission,
     * the workflow preset, its views and its ClickApps.
     *
     * The preset is applied here rather than in the controller because
     * `[07:46]` makes it more than a stored label: "yeh LIST automatically
     * generate kar deta hai ClickUp … us base pe jo aap ne ooper di ho". A space
     * created from a preset comes with its statuses and its first lists, or the
     * question the wizard asked was for nothing.
     */
    createSpace(workspaceId: string, data: {
        name: string;
        description?: string;
        color?: string;
        icon?: string;
        visibility?: 'public' | 'private';
        defaultPermission?: SpaceDefaultPermission;
        presetKey?: string;
        /** Overrides the preset's own, so "customize to your liking" is real. */
        viewConfig?: {
            defaultView?: string;
            enabledViews?: string[];
        };
        features?: string[];
    }, actorId?: string): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        isArchived: boolean;
        workspaceId: string;
        description: string | null;
        color: string | null;
        icon: string | null;
        createdById: string | null;
        archivedAt: Date | null;
        archivedById: string | null;
        visibility: "public" | "private";
        viewConfig: {
            defaultView?: string;
            enabledViews?: string[];
        } | null;
        defaultPermission: SpaceDefaultPermission;
        features: Record<string, boolean> | null;
        presetKey: string | null;
    }>;
    /**
     * `[07:46]` — the preset's statuses and its first lists.
     *
     * Failures here are logged and swallowed rather than rolled back: the space
     * EXISTS by this point, and a person who watched it appear in the sidebar and
     * then got an error would have no way to tell whether it is there. A space
     * with no seeded list is recoverable in one click; a space that half-exists
     * is not.
     */
    private applyPreset;
    /**
     * The destination tree for the Move picker: every space the actor can see,
     * with its folders and projects. Reuses getSpacesByWorkspace so a private
     * space the actor isn't in never appears as a move target.
     */
    moveTargets(workspaceId: string, actorId?: string): Promise<{
        id: string;
        name: string;
        icon: string | null;
        color: string | null;
        folders: {
            id: string;
            name: string;
        }[];
        projects: {
            id: string;
            name: string;
            folderId: string | null;
        }[];
        lists: {
            id: string;
            name: string;
            projectId: string;
        }[];
    }[]>;
    getSpacesByWorkspace(workspaceId: string, actorId?: string): Promise<{
        id: string;
        workspaceId: string;
        name: string;
        description: string | null;
        color: string | null;
        icon: string | null;
        createdById: string | null;
        isArchived: boolean;
        archivedAt: Date | null;
        archivedById: string | null;
        visibility: "public" | "private";
        viewConfig: {
            defaultView?: string;
            enabledViews?: string[];
        } | null;
        defaultPermission: SpaceDefaultPermission;
        features: Record<string, boolean> | null;
        presetKey: string | null;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    getSpace(spaceId: string): Promise<{
        id: string;
        workspaceId: string;
        name: string;
        description: string | null;
        color: string | null;
        icon: string | null;
        createdById: string | null;
        isArchived: boolean;
        archivedAt: Date | null;
        archivedById: string | null;
        visibility: "public" | "private";
        viewConfig: {
            defaultView?: string;
            enabledViews?: string[];
        } | null;
        defaultPermission: SpaceDefaultPermission;
        features: Record<string, boolean> | null;
        presetKey: string | null;
        createdAt: Date;
        updatedAt: Date;
    } | null>;
    /**
     * DEFECT FIXED HERE. `SpacesController.updateSpace` declares
     * `defaultPermission` and `features` in its body type, with a comment saying
     * they are "editable after creation too … a switch you can only ever set once
     * is a decision the person is stuck with" — and neither ever reached the
     * table, because this signature did not accept them and the whitelist below
     * did not copy them. `PUT /spaces/:id {features}` returned 200 and changed
     * nothing: a stored value no writer honours, which is the mirror of the
     * mirror. Both are honoured now, and `features` goes through the same plan
     * gate creation does — a gate that only fires on create is bypassed by
     * creating on one plan and editing on another.
     */
    updateSpace(spaceId: string, data: Partial<{
        name: string;
        description: string;
        color: string;
        icon: string;
        viewConfig: {
            defaultView?: string;
            enabledViews?: string[];
        } | null;
        defaultPermission: SpaceDefaultPermission;
        features: Record<string, boolean> | null;
    }>, actorId?: string): Promise<{
        id: string;
        workspaceId: string;
        name: string;
        description: string | null;
        color: string | null;
        icon: string | null;
        createdById: string | null;
        isArchived: boolean;
        archivedAt: Date | null;
        archivedById: string | null;
        visibility: "public" | "private";
        viewConfig: {
            defaultView?: string;
            enabledViews?: string[];
        } | null;
        defaultPermission: SpaceDefaultPermission;
        features: Record<string, boolean> | null;
        presetKey: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /** The raw row, un-narrowed — for the internal callers that need `workspaceId`. */
    private getSpaceRow;
    deleteSpace(spaceId: string, actorId?: string, ipAddress?: string): Promise<void>;
    private assertManageable;
}
