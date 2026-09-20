import type { FlagKey, FlagResolutionContext, ResolvedFlags } from '@rundesk/feature-flags';
import type { Db } from '@rundesk/db';
import { SecurityService } from '../security/security.service';
import { NotificationsService } from '../notifications/notifications.service';
export declare class FeatureFlagsService {
    private db;
    private readonly security;
    private readonly notifications;
    private cache;
    constructor(db: Db, security: SecurityService, notifications: NotificationsService);
    isEnabled(flagKey: FlagKey, ctx: Partial<FlagResolutionContext>): Promise<boolean>;
    resolveForContext(ctx: Partial<FlagResolutionContext>): Promise<Record<string, boolean>>;
    resolveForUser(ctx: FlagResolutionContext): Promise<ResolvedFlags>;
    /**
     * Resolve flags for the workspace the caller is actually looking at. The
     * frontend passes the route workspaceId so nav gating reflects the viewed
     * workspace rather than only the token's active one. An explicit workspaceId
     * is honoured only when the caller can see it (super_admin, or a member),
     * so feature config can't be probed for arbitrary workspaces; otherwise we
     * fall back to the token's active workspace.
     */
    resolveForUserRequest(user: {
        id: string;
        activeWorkspaceId?: string;
        role?: string;
    }, requestedWorkspaceId?: string): Promise<ResolvedFlags>;
    invalidateCache(userId?: string, workspaceId?: string): void;
    /**
     * Drop cache entries affected by a flag change. Cache keys are
     * `${userId}:${workspaceId}`, so a workspace-scoped change must clear every
     * user's entry for that workspace (not a single synthetic key) — otherwise a
     * toggle wouldn't take effect until the 5-minute TTL expired.
     */
    private invalidateForFlagChange;
    private resolveFromDb;
    setFlag(flagKey: FlagKey, enabled: boolean, scope: 'global' | 'workspace' | 'role' | 'user', scopeId: string | null, workspaceId: string | null, actor: {
        id: string;
        role?: string;
    }): Promise<void>;
    /**
     * §2.8 gap 11 — "Contact your admin", made into something that happens.
     *
     *   `[20:45]` recording "back end se on karna parta hai" — the capability is
     *   off until an admin turns it on, and the person who wants it is not that
     *   admin.
     *
     * The modal that explains this ends in a button. A button that opens a mail
     * client is a button that does nothing on a machine with no mail client set
     * up, so this asks the admins directly, in the app they are already in.
     *
     * Returns what actually happened rather than a bare 200: whether the flag was
     * already on (nothing to ask for), whether this person had already asked
     * today, and how many admins were told.
     */
    requestFlag(flagKey: FlagKey, workspaceId: string, requester: {
        id: string;
        name?: string | null;
        email?: string | null;
    }): Promise<{
        status: 'sent' | 'already_enabled' | 'already_asked' | 'no_admins';
        notified: number;
    }>;
    listOverrides(workspaceId?: string | null): Promise<{
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
}
