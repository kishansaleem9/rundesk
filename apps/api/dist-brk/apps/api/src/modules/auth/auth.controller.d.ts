import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
type RequestWithCookies = FastifyRequest & {
    cookies?: Record<string, string | undefined>;
};
export declare class AuthController {
    private readonly authService;
    private readonly config;
    constructor(authService: AuthService, config: ConfigService);
    private get cookiesSecure();
    /** Attach the httpOnly access/refresh + readable CSRF cookies to a response. */
    private issueCookies;
    signup(dto: SignupDto, req: FastifyRequest, res: FastifyReply): Promise<{
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
    register(dto: RegisterDto, req: FastifyRequest, res: FastifyReply): Promise<{
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
    login(user: any, dto: LoginDto, req: FastifyRequest, res: FastifyReply): Promise<{
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
    refresh(body: {
        refreshToken?: string;
    }, req: RequestWithCookies, res: FastifyReply): Promise<{
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
    forgotPassword(body: {
        email: string;
    }): Promise<{
        ok: boolean;
    }>;
    resetPassword(body: {
        token: string;
        password: string;
    }): Promise<{
        ok: boolean;
    }>;
    verifyEmail(body: {
        token: string;
    }): Promise<{
        ok: boolean;
    }>;
    resendVerification(body: {
        email: string;
    }): Promise<{
        ok: boolean;
    }>;
    logout(body: {
        refreshToken?: string;
    }, req: RequestWithCookies, res: FastifyReply): Promise<void>;
    me(user: any): Promise<any>;
    sessions(user: any, currentRefreshToken?: string): Promise<{
        id: string;
        userAgent: string | null;
        ipAddress: string | null;
        isRevoked: boolean;
        expiresAt: Date;
        createdAt: Date;
        isCurrent: boolean;
    }[]>;
    revokeOthers(user: any, body: {
        currentRefreshToken?: string;
    }): Promise<{
        revoked: number;
    }>;
    revokeSession(user: any, sessionId: string): Promise<{
        revoked: boolean;
    }>;
}
export {};
