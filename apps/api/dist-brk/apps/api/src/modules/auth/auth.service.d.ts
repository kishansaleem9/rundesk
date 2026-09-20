import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { users } from '@rundesk/db';
import type { Db } from '@rundesk/db';
import { UsersService } from '../users/users.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { EmailService } from '../email/email.service';
import { SecurityService } from '../security/security.service';
import { WorkspaceSecuritySettingsService } from '../security/workspace-security-settings.service';
import type { RegisterDto } from './dto/register.dto';
import type { SignupDto } from './dto/signup.dto';
type SessionMeta = {
    userAgent?: string;
    ip?: string;
};
/**
 * One-way hash of a refresh token for storage/lookup.
 *
 * Only this SHA-256 digest is ever persisted in `sessions.refreshToken` — never
 * the raw signed JWT — so read access to the DB no longer yields directly-usable
 * refresh tokens. The raw JWT is still handed back to the client (response body
 * + httpOnly cookie); only the stored copy is hashed. Lookups hash the incoming
 * token the same way and match on the digest. The column stays `text` (a hex
 * digest fits), so this needs no schema migration.
 */
export declare function hashRefreshToken(token: string): string;
export declare class AuthService {
    private db;
    private usersService;
    private workspacesService;
    private jwtService;
    private config;
    private featureFlagsService;
    private emailService;
    private security;
    private securitySettings;
    private readonly logger;
    constructor(db: Db, usersService: UsersService, workspacesService: WorkspacesService, jwtService: JwtService, config: ConfigService, featureFlagsService: FeatureFlagsService, emailService: EmailService, security: SecurityService, securitySettings: WorkspaceSecuritySettingsService);
    validateUser(email: string, password: string): Promise<{
        id: string;
        email: string;
        displayName: string;
        avatarUrl: string | null;
        bio: string | null;
        timezone: string;
        timezoneChangeNotice: boolean;
        role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
        passwordHash: string | null;
        emailVerified: boolean;
        isActive: boolean;
        failedLoginAttempts: number;
        lockedUntil: Date | null;
        notificationPreferences: unknown;
        lastSeenAt: Date | null;
        presenceStatus: "online" | "away" | "busy" | "offline" | null;
        statusEmoji: string | null;
        statusText: string | null;
        statusExpiresAt: Date | null;
        dndUntil: Date | null;
        highContrast: boolean | null;
        accentColor: string | null;
        locale: string;
        theme: string;
        dateFormat: string;
        timeFormat: string;
        weekStart: string;
        topbarHidden: string[];
        topbarPinned: string[] | null;
        sidebarCollapsed: boolean | null;
        panelsCollapsed: Record<string, boolean> | null;
        plannerSettings: import("@rundesk/db").PlannerSettings | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /**
     * Second factor enforcement, run AFTER the password has been validated and
     * BEFORE any session token is issued.
     *
     * - If the account has no VERIFIED TOTP secret, this is a no-op (returns) so
     *   password-only accounts — including the entire existing test suite — behave
     *   exactly as before.
     * - If TOTP is enabled but no `totpCode` was supplied, throws HTTP 401 with a
     *   machine-readable `{ error: 'totp_required' }` body so the frontend can
     *   prompt for the code. No tokens are issued.
     * - If a code is supplied it is verified via the security module's
     *   {@link SecurityService.validateTotp}, which also accepts a one-time backup
     *   code. An invalid code throws 401.
     */
    assertTotpSatisfied(userId: string, totpCode?: string): Promise<void>;
    login(user: typeof users.$inferSelect, meta?: SessionMeta): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
            id: string;
            createdAt: Date;
            updatedAt: Date;
            accentColor: string | null;
            email: string;
            displayName: string;
            avatarUrl: string | null;
            bio: string | null;
            timezone: string;
            timezoneChangeNotice: boolean;
            emailVerified: boolean;
            isActive: boolean;
            failedLoginAttempts: number;
            lockedUntil: Date | null;
            notificationPreferences: unknown;
            lastSeenAt: Date | null;
            presenceStatus: "online" | "away" | "busy" | "offline" | null;
            statusEmoji: string | null;
            statusText: string | null;
            statusExpiresAt: Date | null;
            dndUntil: Date | null;
            highContrast: boolean | null;
            locale: string;
            theme: string;
            dateFormat: string;
            timeFormat: string;
            weekStart: string;
            topbarHidden: string[];
            topbarPinned: string[] | null;
            sidebarCollapsed: boolean | null;
            panelsCollapsed: Record<string, boolean> | null;
            plannerSettings: import("@rundesk/db").PlannerSettings | null;
        };
        workspaces: {
            role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
            id: string;
            organizationId: string;
            name: string;
            slug: string;
            logoUrl: string | null;
            primaryColor: string | null;
            purpose: string | null;
            comingFrom: string | null;
            accentColor: string | null;
            customDomain: string | null;
            customDomainToken: string | null;
            customDomainVerified: boolean;
            isArchived: boolean;
            plan: string;
            planLimits: {
                maxMembers?: number | null;
                maxProjects?: number | null;
                features?: Record<string, boolean>;
            } | null;
            defaultSpacePrivate: boolean;
            blockPublicSharing: boolean;
            workDays: number[];
            aiMinutesSavedPerRun: number;
            aiHourlyRateCents: number;
            createdAt: Date;
            updatedAt: Date;
        }[];
        organizations: {
            role: "member" | "owner" | "admin" | "billing";
            id: string;
            name: string;
            slug: string;
            logoUrl: string | null;
            createdAt: Date;
            updatedAt: Date;
        }[];
    }>;
    issueSessionForUserId(userId: string, meta?: SessionMeta): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
            id: string;
            createdAt: Date;
            updatedAt: Date;
            accentColor: string | null;
            email: string;
            displayName: string;
            avatarUrl: string | null;
            bio: string | null;
            timezone: string;
            timezoneChangeNotice: boolean;
            emailVerified: boolean;
            isActive: boolean;
            failedLoginAttempts: number;
            lockedUntil: Date | null;
            notificationPreferences: unknown;
            lastSeenAt: Date | null;
            presenceStatus: "online" | "away" | "busy" | "offline" | null;
            statusEmoji: string | null;
            statusText: string | null;
            statusExpiresAt: Date | null;
            dndUntil: Date | null;
            highContrast: boolean | null;
            locale: string;
            theme: string;
            dateFormat: string;
            timeFormat: string;
            weekStart: string;
            topbarHidden: string[];
            topbarPinned: string[] | null;
            sidebarCollapsed: boolean | null;
            panelsCollapsed: Record<string, boolean> | null;
            plannerSettings: import("@rundesk/db").PlannerSettings | null;
        };
        workspaces: {
            role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
            id: string;
            organizationId: string;
            name: string;
            slug: string;
            logoUrl: string | null;
            primaryColor: string | null;
            purpose: string | null;
            comingFrom: string | null;
            accentColor: string | null;
            customDomain: string | null;
            customDomainToken: string | null;
            customDomainVerified: boolean;
            isArchived: boolean;
            plan: string;
            planLimits: {
                maxMembers?: number | null;
                maxProjects?: number | null;
                features?: Record<string, boolean>;
            } | null;
            defaultSpacePrivate: boolean;
            blockPublicSharing: boolean;
            workDays: number[];
            aiMinutesSavedPerRun: number;
            aiHourlyRateCents: number;
            createdAt: Date;
            updatedAt: Date;
        }[];
        organizations: {
            role: "member" | "owner" | "admin" | "billing";
            id: string;
            name: string;
            slug: string;
            logoUrl: string | null;
            createdAt: Date;
            updatedAt: Date;
        }[];
    }>;
    /** Revoke the oldest active sessions beyond `max` (newest are kept). */
    private enforceSessionCap;
    /** Apply the password policy (strength + breach check) to a new password. */
    private enforcePasswordPolicy;
    /**
     * POST /auth/signup — Atomic org + workspace creation.
     * All rows (user, org, org_member, workspace, workspace_member, invitations)
     * are inserted in a single DB transaction; any failure rolls back everything.
     */
    signUp(dto: SignupDto, meta?: SessionMeta): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
            id: string;
            createdAt: Date;
            updatedAt: Date;
            accentColor: string | null;
            email: string;
            displayName: string;
            avatarUrl: string | null;
            bio: string | null;
            timezone: string;
            timezoneChangeNotice: boolean;
            emailVerified: boolean;
            isActive: boolean;
            failedLoginAttempts: number;
            lockedUntil: Date | null;
            notificationPreferences: unknown;
            lastSeenAt: Date | null;
            presenceStatus: "online" | "away" | "busy" | "offline" | null;
            statusEmoji: string | null;
            statusText: string | null;
            statusExpiresAt: Date | null;
            dndUntil: Date | null;
            highContrast: boolean | null;
            locale: string;
            theme: string;
            dateFormat: string;
            timeFormat: string;
            weekStart: string;
            topbarHidden: string[];
            topbarPinned: string[] | null;
            sidebarCollapsed: boolean | null;
            panelsCollapsed: Record<string, boolean> | null;
            plannerSettings: import("@rundesk/db").PlannerSettings | null;
        };
        workspaces: {
            role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
            id: string;
            organizationId: string;
            name: string;
            slug: string;
            logoUrl: string | null;
            primaryColor: string | null;
            purpose: string | null;
            comingFrom: string | null;
            accentColor: string | null;
            customDomain: string | null;
            customDomainToken: string | null;
            customDomainVerified: boolean;
            isArchived: boolean;
            plan: string;
            planLimits: {
                maxMembers?: number | null;
                maxProjects?: number | null;
                features?: Record<string, boolean>;
            } | null;
            defaultSpacePrivate: boolean;
            blockPublicSharing: boolean;
            workDays: number[];
            aiMinutesSavedPerRun: number;
            aiHourlyRateCents: number;
            createdAt: Date;
            updatedAt: Date;
        }[];
        organizations: {
            role: "member" | "owner" | "admin" | "billing";
            id: string;
            name: string;
            slug: string;
            logoUrl: string | null;
            createdAt: Date;
            updatedAt: Date;
        }[];
    }>;
    /** Create a verification token and email the confirmation link. */
    private issueEmailVerification;
    /** Confirm an email with a token, flipping users.emailVerified to true. */
    verifyEmail(token: string): Promise<{
        ok: boolean;
    }>;
    /** Re-send a verification link. Silent about whether the account exists. */
    resendVerification(email: string): Promise<{
        ok: boolean;
    }>;
    /** @deprecated Use signUp for new accounts */
    register(dto: RegisterDto, meta?: SessionMeta): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
            id: string;
            createdAt: Date;
            updatedAt: Date;
            accentColor: string | null;
            email: string;
            displayName: string;
            avatarUrl: string | null;
            bio: string | null;
            timezone: string;
            timezoneChangeNotice: boolean;
            emailVerified: boolean;
            isActive: boolean;
            failedLoginAttempts: number;
            lockedUntil: Date | null;
            notificationPreferences: unknown;
            lastSeenAt: Date | null;
            presenceStatus: "online" | "away" | "busy" | "offline" | null;
            statusEmoji: string | null;
            statusText: string | null;
            statusExpiresAt: Date | null;
            dndUntil: Date | null;
            highContrast: boolean | null;
            locale: string;
            theme: string;
            dateFormat: string;
            timeFormat: string;
            weekStart: string;
            topbarHidden: string[];
            topbarPinned: string[] | null;
            sidebarCollapsed: boolean | null;
            panelsCollapsed: Record<string, boolean> | null;
            plannerSettings: import("@rundesk/db").PlannerSettings | null;
        };
        workspaces: {
            role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
            id: string;
            organizationId: string;
            name: string;
            slug: string;
            logoUrl: string | null;
            primaryColor: string | null;
            purpose: string | null;
            comingFrom: string | null;
            accentColor: string | null;
            customDomain: string | null;
            customDomainToken: string | null;
            customDomainVerified: boolean;
            isArchived: boolean;
            plan: string;
            planLimits: {
                maxMembers?: number | null;
                maxProjects?: number | null;
                features?: Record<string, boolean>;
            } | null;
            defaultSpacePrivate: boolean;
            blockPublicSharing: boolean;
            workDays: number[];
            aiMinutesSavedPerRun: number;
            aiHourlyRateCents: number;
            createdAt: Date;
            updatedAt: Date;
        }[];
        organizations: {
            role: "member" | "owner" | "admin" | "billing";
            id: string;
            name: string;
            slug: string;
            logoUrl: string | null;
            createdAt: Date;
            updatedAt: Date;
        }[];
    }>;
    /**
     * Locate the session row for a presented refresh token.
     *
     * Primary path: match on the token's SHA-256 hash — how all new/rotated
     * sessions are stored (see hashRefreshToken).
     *
     * Migration-in-place fallback: if the hash misses, retry with the raw token to
     * catch sessions written before hashing-at-rest was introduced. On a legacy
     * hit we transparently re-store that row's `refreshToken` as the hash, so it is
     * upgraded on first use. This is what avoids force-logging-out every existing
     * session on deploy. The legacy branch can be deleted once all sessions have
     * rotated past the old plaintext storage.
     */
    private findSessionByRefreshToken;
    refresh(token: string, meta?: SessionMeta): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
            id: string;
            createdAt: Date;
            updatedAt: Date;
            accentColor: string | null;
            email: string;
            displayName: string;
            avatarUrl: string | null;
            bio: string | null;
            timezone: string;
            timezoneChangeNotice: boolean;
            emailVerified: boolean;
            isActive: boolean;
            failedLoginAttempts: number;
            lockedUntil: Date | null;
            notificationPreferences: unknown;
            lastSeenAt: Date | null;
            presenceStatus: "online" | "away" | "busy" | "offline" | null;
            statusEmoji: string | null;
            statusText: string | null;
            statusExpiresAt: Date | null;
            dndUntil: Date | null;
            highContrast: boolean | null;
            locale: string;
            theme: string;
            dateFormat: string;
            timeFormat: string;
            weekStart: string;
            topbarHidden: string[];
            topbarPinned: string[] | null;
            sidebarCollapsed: boolean | null;
            panelsCollapsed: Record<string, boolean> | null;
            plannerSettings: import("@rundesk/db").PlannerSettings | null;
        };
        workspaces: {
            role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
            id: string;
            organizationId: string;
            name: string;
            slug: string;
            logoUrl: string | null;
            primaryColor: string | null;
            purpose: string | null;
            comingFrom: string | null;
            accentColor: string | null;
            customDomain: string | null;
            customDomainToken: string | null;
            customDomainVerified: boolean;
            isArchived: boolean;
            plan: string;
            planLimits: {
                maxMembers?: number | null;
                maxProjects?: number | null;
                features?: Record<string, boolean>;
            } | null;
            defaultSpacePrivate: boolean;
            blockPublicSharing: boolean;
            workDays: number[];
            aiMinutesSavedPerRun: number;
            aiHourlyRateCents: number;
            createdAt: Date;
            updatedAt: Date;
        }[];
        organizations: {
            role: "member" | "owner" | "admin" | "billing";
            id: string;
            name: string;
            slug: string;
            logoUrl: string | null;
            createdAt: Date;
            updatedAt: Date;
        }[];
    }>;
    logout(refreshToken: string): Promise<void>;
    listSessions(userId: string, currentRefreshToken?: string | null): Promise<{
        id: string;
        userAgent: string | null;
        ipAddress: string | null;
        isRevoked: boolean;
        expiresAt: Date;
        createdAt: Date;
        isCurrent: boolean;
    }[]>;
    revokeSession(userId: string, sessionId: string): Promise<{
        revoked: boolean;
    }>;
    revokeOtherSessions(userId: string, currentRefreshToken?: string | null): Promise<{
        revoked: number;
    }>;
    requestPasswordReset(email: string): Promise<{
        ok: boolean;
    }>;
    resetPassword(token: string, newPassword: string): Promise<{
        ok: boolean;
    }>;
}
export {};
