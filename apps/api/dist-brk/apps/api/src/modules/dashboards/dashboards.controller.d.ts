import { DashboardsService } from './dashboards.service';
import { CreateDashboardPresetDto, UpdateDashboardPresetDto } from './dto/dashboard-preset.dto';
export declare class DashboardsController {
    private readonly dashboardsService;
    constructor(dashboardsService: DashboardsService);
    listPresets(req: {
        user: {
            id: string;
        };
    }, workspaceId: string): Promise<{
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
    getDefaultPreset(req: {
        user: {
            id: string;
        };
    }, workspaceId: string): Promise<{
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
    setWorkspaceDefault(req: {
        user: {
            id: string;
            role?: string;
        };
    }, workspaceId: string, presetId: string): Promise<{
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
    clearWorkspaceDefault(workspaceId: string): Promise<{
        ok: boolean;
    }>;
    createPreset(req: {
        user: {
            id: string;
        };
    }, dto: CreateDashboardPresetDto): Promise<{
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
    updatePreset(req: {
        user: {
            id: string;
        };
    }, id: string, dto: UpdateDashboardPresetDto): Promise<{
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
    deletePreset(req: {
        user: {
            id: string;
        };
    }, id: string): Promise<{
        ok: boolean;
    }>;
    getDockConfig(req: {
        user: {
            id: string;
        };
    }, workspaceId: string): Promise<{
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
    updateDockConfig(req: {
        user: {
            id: string;
        };
    }, workspaceId: string, patch: {
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
