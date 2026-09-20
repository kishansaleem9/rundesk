import type { Db } from '@rundesk/db';
import { CreateDashboardPresetDto, UpdateDashboardPresetDto } from './dto/dashboard-preset.dto';
/** The acting user as attached to the request by JwtAuthGuard. */
export type DashboardActor = {
    id: string;
    role?: string | null;
};
export declare class DashboardsService {
    private db;
    constructor(db: Db);
    /**
     * A member sees their own presets plus the admin-set workspace-default preset
     * (which another user may own), so the UI can show and manage it. §5.7
     *
     * A5.11 — plus anything shared with them via `object_shares`, and every row
     * carries the owner and its share count so the hub can render an index with
     * Owner / Sharing columns instead of a bare name dropdown.
     */
    listPresets(userId: string, workspaceId: string): Promise<{
        isOwner: boolean;
        isSharedWithMe: boolean;
        id: string;
        userId: string;
        workspaceId: string;
        name: string;
        layout: unknown;
        isDefault: boolean;
        isWorkspaceDefault: boolean;
        createdAt: Date;
        updatedAt: Date;
        ownerName: string | null;
        ownerEmail: string | null;
        shareCount: number;
    }[]>;
    /** Preset ids in this workspace explicitly granted to `userId` (A5.11). */
    private presetIdsSharedWith;
    /**
     * Resolve the dashboard preset a user should land on. Their own default wins;
     * otherwise fall back to the admin-set workspace-default preset (§5.7).
     * Returns null when neither exists.
     */
    getDefaultPreset(userId: string, workspaceId: string): Promise<{
        id: string;
        userId: string;
        workspaceId: string;
        name: string;
        layout: unknown;
        isDefault: boolean;
        isWorkspaceDefault: boolean;
        createdAt: Date;
        updatedAt: Date;
    }>;
    createPreset(userId: string, dto: CreateDashboardPresetDto): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        workspaceId: string;
        userId: string;
        isDefault: boolean;
        layout: unknown;
        isWorkspaceDefault: boolean;
    }>;
    updatePreset(userId: string, id: string, dto: UpdateDashboardPresetDto): Promise<{
        id: string;
        userId: string;
        workspaceId: string;
        name: string;
        layout: unknown;
        isDefault: boolean;
        isWorkspaceDefault: boolean;
        createdAt: Date;
        updatedAt: Date;
    }>;
    deletePreset(userId: string, id: string): Promise<{
        ok: boolean;
    }>;
    private clearDefaultPreset;
    /**
     * Mark `presetId` as the workspace-wide default and clear the flag on every
     * other preset, keeping at most one workspace-default per workspace. Only a
     * workspace_admin (or super_admin) may do this.
     */
    setWorkspaceDefault(workspaceId: string, presetId: string, actor: DashboardActor): Promise<{
        id: string;
        userId: string;
        workspaceId: string;
        name: string;
        layout: unknown;
        isDefault: boolean;
        isWorkspaceDefault: boolean;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /** Remove the workspace-default flag from every preset in the workspace. §5.7 */
    clearWorkspaceDefault(workspaceId: string): Promise<{
        ok: boolean;
    }>;
    /**
     * Authorize a workspace-default mutation. A global super_admin bypasses the
     * per-workspace lookup (matching the guards); otherwise the actor must be a
     * workspace_admin (or workspace-level super_admin) member. §5.7
     */
    private assertWorkspaceAdmin;
    getDockConfig(userId: string, workspaceId: string): Promise<{
        id: string;
        userId: string;
        workspaceId: string;
        pinnedLinks: unknown;
        navFavorites: {
            label: string;
            path: string;
        }[] | null;
        navRecents: {
            label: string;
            path: string;
            kind?: string;
        }[] | null;
        appearance: unknown;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /**
     * G04-7 / G07-6 — the nav lists are capped here, not only in the client.
     *
     * They arrive as jsonb straight from a browser, so a caller could otherwise
     * store an unbounded array and make every later read of this row expensive
     * for everybody who shares the workspace.
     */
    private static readonly NAV_LIMIT;
    private static navList;
    updateDockConfig(userId: string, workspaceId: string, patch: {
        pinnedLinks?: any[];
        appearance?: any;
        navFavorites?: unknown;
        navRecents?: unknown;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        workspaceId: string;
        userId: string;
        pinnedLinks: unknown;
        navFavorites: {
            label: string;
            path: string;
        }[] | null;
        navRecents: {
            label: string;
            path: string;
            kind?: string;
        }[] | null;
        appearance: unknown;
    }>;
}
