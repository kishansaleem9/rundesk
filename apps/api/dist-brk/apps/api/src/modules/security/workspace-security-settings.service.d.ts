import type { Db } from '@rundesk/db';
import { SecurityService } from './security.service';
export type SecuritySettings = {
    workspaceId: string | null;
    ipAllowlistEnabled: boolean;
    ipAllowlist: string[];
    ipAllowlistIncludeAdmins: boolean;
    sessionTimeoutMinutes: number;
    maxConcurrentSessions: number;
    lockoutEnabled: boolean;
    lockoutThreshold: number;
    lockoutDurationMinutes: number;
    requireStrongPasswords: boolean;
    blockBreachedPasswords: boolean;
};
export declare const SECURITY_DEFAULTS: Omit<SecuritySettings, 'workspaceId'>;
type UpdatablePatch = Partial<Omit<SecuritySettings, 'workspaceId' | 'ipAllowlist'>> & {
    ipAllowlist?: unknown;
};
export declare class WorkspaceSecuritySettingsService {
    private db;
    private security;
    constructor(db: Db, security: SecurityService);
    /** Settings for a workspace, falling back to defaults when no row exists. */
    get(workspaceId: string | null | undefined): Promise<SecuritySettings>;
    /**
     * Upsert the workspace policy. Sanitises every field and — critically —
     * guarantees the admin saving the change cannot lock themselves out: when
     * the allowlist is enabled with a non-empty list, the requester's own IP is
     * auto-added if it isn't already covered.
     */
    update(workspaceId: string, patch: UpdatablePatch, actorId: string, requesterIp?: string): Promise<SecuritySettings>;
    /**
     * Resolve the effective policy for a user at login time: their primary
     * (earliest-joined) workspace, plus whether they are an admin there (used by
     * the IP-allowlist admin exemption).
     */
    getEffectiveForUser(userId: string): Promise<{
        settings: SecuritySettings;
        isWorkspaceAdmin: boolean;
    }>;
    /** Throws BadRequest-style errors via the caller; returns a reason or null. */
    passwordStrengthProblem(password: string): string | null;
    /**
     * Check a password against HaveIBeenPwned's k-anonymity range API. Fails
     * OPEN: any network/parse error returns false so the breach check can never
     * block a legitimate sign-up when the API is unreachable (or blocked by the
     * environment's egress policy).
     */
    isPasswordBreached(password: string): Promise<boolean>;
}
export {};
