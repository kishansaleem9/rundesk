import { FeatureFlagsService } from './feature-flags.service';
import type { FlagKey } from '@rundesk/feature-flags';
export declare class FeatureFlagsController {
    private readonly featureFlagsService;
    constructor(featureFlagsService: FeatureFlagsService);
    getResolved(user: any, workspaceId?: string): Promise<import("@rundesk/feature-flags").ResolvedFlags>;
    listWorkspaceOverrides(workspaceId: string): Promise<{
        id: string;
        flagKey: string;
        scope: "global" | "workspace" | "role" | "user";
        scopeId: string | null;
        workspaceId: string | null;
        enabled: boolean;
        updatedBy: string | null;
        updatedAt: Date;
        createdAt: Date;
    }[]>;
    /**
     * §2.8 gap 11 — ask the workspace admins to turn a feature on.
     *
     * Deliberately not under WorkspaceAdminGuard: the entire point is that the
     * caller is NOT an admin. The service checks membership and refuses to ask
     * for something already on.
     */
    requestFlag(flagKey: FlagKey, body: {
        workspaceId?: string;
    }, user: any): Promise<{
        status: "sent" | "already_enabled" | "already_asked" | "no_admins";
        notified: number;
    }>;
    setFlag(flagKey: FlagKey, body: {
        enabled: boolean;
        scope: 'global' | 'workspace' | 'role' | 'user';
        scopeId?: string;
        workspaceId?: string;
    }, user: any): Promise<{
        updated: boolean;
    }>;
}
