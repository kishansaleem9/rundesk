import type { Db } from '@rundesk/db';
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';
import { WorkspaceSecuritySettingsService } from '../security/workspace-security-settings.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { PlansService } from '../plans/plans.service';
export declare class InvitationsService {
    private db;
    private emailService;
    private config;
    private securitySettings;
    private webhooks;
    private plans;
    constructor(db: Db, emailService: EmailService, config: ConfigService, securitySettings: WorkspaceSecuritySettingsService, webhooks: WebhooksService, plans: PlansService);
    private claimUrlForToken;
    /**
     * Best-effort webhook fan-out (Plan §12.4). Mirrors the webhooks portion of
     * TasksService.fireTaskEvent — non-blocking, failures logged not thrown, so
     * a downed webhook can never break invite creation/acceptance.
     */
    private fireWebhook;
    /** Workspace ids an invite grants membership to (member.* events are workspace-keyed). */
    private inviteWorkspaces;
    listPending(organizationId: string): Promise<{
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
    create(organizationId: string, invitedById: string, dto: {
        email: string;
        orgRole?: string;
        workspaceMemberships?: any[];
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
    getClaimUrlById(invitationId: string): Promise<{
        claimUrl: string;
    }>;
    resend(invitationId: string): Promise<{
        ok: boolean;
    }>;
    listPendingForWorkspace(workspaceId: string): Promise<{
        id: string;
        email: string;
        role: "super_admin" | "workspace_admin" | "manager" | "member" | "guest";
        status: "pending" | "accepted" | "revoked" | "expired" | "declined";
        expiresAt: Date;
    }[]>;
    revoke(invitationId: string): Promise<{
        ok: boolean;
    }>;
    /**
     * The person invited says no — `[00:18]`.
     *
     * By token and unauthenticated on purpose: somebody declining an invitation
     * is precisely somebody who is not going to make an account first, and a
     * Decline that demanded a login would be a Decline nobody could press.
     *
     * Idempotent. A second press of a link somebody already declined is a person
     * making sure, not an error, and it must not read as one.
     */
    decline(token: string): Promise<{
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
    claim(dto: {
        token: string;
        password?: string;
        fullName?: string;
    }, currentUserId?: string): Promise<{
        userId: string;
    }>;
}
