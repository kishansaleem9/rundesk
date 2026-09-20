import { InvitationsService } from './invitations.service';
import { AuthService } from '../auth/auth.service';
import { JwtService } from '@nestjs/jwt';
export declare class InvitationsController {
    private readonly invitationsService;
    private readonly authService;
    private readonly jwtService;
    private readonly db;
    constructor(invitationsService: InvitationsService, authService: AuthService, jwtService: JwtService, db: any);
    private assertInviteWorkspaceAdminOrManager;
    createSingular(user: any, body: {
        email: string;
        workspaceId: string;
        role: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        organizationId: string;
        email: string;
        status: "pending" | "accepted" | "revoked" | "expired" | "declined";
        expiresAt: Date;
        token: string;
        orgRole: "member" | "owner" | "admin" | "billing";
        workspaceMemberships: {
            workspaceId: string;
            role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
        }[];
        invitedByUserId: string;
        acceptedAt: Date | null;
        acceptedByUserId: string | null;
    }>;
    claim(dto: {
        token: string;
        password?: string;
        fullName?: string;
    }, req: any): Promise<{
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
    listWorkspacePending(workspaceId: string, req: any): Promise<{
        id: string;
        email: string;
        role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
        status: "pending" | "accepted" | "revoked" | "expired" | "declined";
        expiresAt: Date;
    }[]>;
    decline(dto: {
        token: string;
    }): Promise<{
        ok: boolean;
        status: "declined";
    }>;
    preview(token: string): Promise<{
        orgName: string;
        inviterName: string;
        email: string;
        expiresAt: Date;
        requiresAccountCreation: boolean;
    }>;
    bulkInvite(orgId: string, user: any, body: {
        invites: Array<{
            email: string;
            orgRole?: string;
            workspaceMemberships?: any[];
        }>;
    }): Promise<{
        id: string;
        createdAt: Date;
        organizationId: string;
        email: string;
        status: "pending" | "accepted" | "revoked" | "expired" | "declined";
        expiresAt: Date;
        token: string;
        orgRole: "member" | "owner" | "admin" | "billing";
        workspaceMemberships: {
            workspaceId: string;
            role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
        }[];
        invitedByUserId: string;
        acceptedAt: Date | null;
        acceptedByUserId: string | null;
    }[]>;
    listPending(orgId: string): Promise<{
        id: string;
        organizationId: string;
        email: string;
        orgRole: "member" | "owner" | "admin" | "billing";
        workspaceMemberships: {
            workspaceId: string;
            role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
        }[];
        invitedByUserId: string;
        token: string;
        status: "pending" | "accepted" | "revoked" | "expired" | "declined";
        expiresAt: Date;
        acceptedAt: Date | null;
        acceptedByUserId: string | null;
        createdAt: Date;
    }[]>;
    revoke(id: string, req: any): Promise<{
        ok: boolean;
    }>;
    getLink(id: string, req: any): Promise<{
        claimUrl: string;
    }>;
    resend(id: string, req: any): Promise<{
        ok: boolean;
    }>;
}
