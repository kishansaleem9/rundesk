import { SpacesService } from './spaces.service';
import { PlansService } from '../plans/plans.service';
import type { SpaceDefaultPermission } from '@rundesk/db';
export declare class SpacesController {
    private spacesService;
    constructor(spacesService: SpacesService);
    getSpacesByWorkspace(workspaceId: string, user: any): Promise<{
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
    /** Destination tree for the Move picker: spaces → folders → projects. */
    moveTargets(workspaceId: string, user: any): Promise<{
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
    createSpace(user: any, body: {
        workspaceId: string;
        name: string;
        description?: string;
        color?: string;
        icon?: string;
        visibility?: 'public' | 'private';
        defaultPermission?: SpaceDefaultPermission;
        presetKey?: string;
        viewConfig?: {
            defaultView?: string;
            enabledViews?: string[];
        };
        features?: string[];
    }): Promise<{
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
    updateSpace(spaceId: string, user: any, body: Partial<{
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
    }>): Promise<{
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
    deleteSpace(spaceId: string, user: any, ip: string): Promise<{
        message: string;
    }>;
}
/**
 * §V2-06 — the workflow presets of frame `07:06`, served rather than
 * duplicated in the web bundle.
 *
 * The wizard previews what each card will do — its views, its statuses, its
 * ClickApps and the lists it seeds — and that preview has to be the same object
 * the server applies. A second copy in the front end is a second definition of
 * what "Marketing Teams" means, and the two would disagree the first time
 * either one changed.
 *
 * ITS OWN CONTROLLER, at its own path, for two reasons that are not style.
 * `SpacesController` declares `@Get(':spaceId')`, so `/spaces/presets` would
 * match that first and arrive as a space id; and its class-level
 * `ResourceMemberGuard` resolves a workspace from that id, so the request
 * would be refused as a malformed UUID before reaching any handler. A constant
 * needs neither.
 */
export declare class SpacePresetsController {
    private plans;
    constructor(plans: PlansService);
    listPresets(): {
        presets: import("./space-presets").SpacePreset[];
        features: readonly ["priority", "tags", "customFields", "milestones", "wipLimits", "listEmail"];
        views: readonly ["list", "board", "table", "calendar", "gantt", "team"];
    };
    /**
     * §V2-06 `[07:20]` — the same constant, plus what THIS workspace's plan
     * reaches.
     *
     * > "ClickUp Apps is also dependent on that — ke aap ke paas PACKAGE PLAN
     * > kaun sa hai."
     *
     * A separate, workspace-scoped route rather than a `?workspaceId=` on the one
     * above, for a reason that is not style: `ResourceMemberGuard` resolves the
     * workspace from route params and body and NOT from the query string, so a
     * query parameter would be an ungated read of another workspace's commercial
     * tier. As a path param the existing guard does the work.
     *
     * `features` stays the full set and `lockedFeatures` says which of them this
     * plan cannot have, rather than the server quietly sending a shorter list.
     * A ClickApp that simply vanishes is indistinguishable from one that was
     * never built — and "upgrade to get this" is the thing the transcript is
     * actually describing.
     */
    listPresetsForWorkspace(workspaceId: string): Promise<{
        presets: import("./space-presets").SpacePreset[];
        features: readonly ["priority", "tags", "customFields", "milestones", "wipLimits", "listEmail"];
        views: readonly ["list", "board", "table", "calendar", "gantt", "team"];
        plan: {
            id: "enterprise" | "free" | "pro" | "business";
            label: string;
            recognized: boolean;
        };
        allowedFeatures: ("priority" | "tags" | "customFields" | "milestones" | "wipLimits" | "listEmail")[];
        lockedFeatures: {
            key: import("./space-presets").SpaceFeatureKey;
            requiresPlan: import("../plans/plans.constants").PlanId;
            requiresLabel: string;
        }[];
    }>;
}
