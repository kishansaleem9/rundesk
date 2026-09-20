"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvitationsService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const node_crypto_1 = require("node:crypto");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const email_service_1 = require("../email/email.service");
const config_1 = require("@nestjs/config");
const workspace_security_settings_service_1 = require("../security/workspace-security-settings.service");
const webhooks_service_1 = require("../webhooks/webhooks.service");
const plans_service_1 = require("../plans/plans.service");
let InvitationsService = class InvitationsService {
    constructor(db, emailService, config, securitySettings, webhooks, plans) {
        this.db = db;
        this.emailService = emailService;
        this.config = config;
        this.securitySettings = securitySettings;
        this.webhooks = webhooks;
        this.plans = plans;
    }
    claimUrlForToken(token) {
        const appUrl = this.config.get('APP_URL', 'http://localhost:5173');
        return `${appUrl}/accept-invite?token=${token}`;
    }
    /**
     * Best-effort webhook fan-out (Plan §12.4). Mirrors the webhooks portion of
     * TasksService.fireTaskEvent — non-blocking, failures logged not thrown, so
     * a downed webhook can never break invite creation/acceptance.
     */
    async fireWebhook(workspaceId, event, payload) {
        try {
            await this.webhooks.fire(workspaceId, event, payload);
        }
        catch (e) {
            // eslint-disable-next-line no-console
            console.error(`[webhooks.fire] ${event} failed:`, e);
        }
    }
    /** Workspace ids an invite grants membership to (member.* events are workspace-keyed). */
    inviteWorkspaces(memberships) {
        if (!Array.isArray(memberships))
            return [];
        return memberships
            .filter((ws) => Boolean(ws && typeof ws === 'object' && typeof ws.workspaceId === 'string'))
            .map((ws) => ({ workspaceId: ws.workspaceId, role: ws.role }));
    }
    async listPending(organizationId) {
        return this.db
            .select()
            .from(db_1.invitations)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.invitations.organizationId, organizationId), (0, drizzle_orm_1.eq)(db_1.invitations.status, 'pending')));
    }
    async create(organizationId, invitedById, dto) {
        const org = await this.db.select().from(db_1.organizations).where((0, drizzle_orm_1.eq)(db_1.organizations.id, organizationId)).limit(1);
        if (org.length === 0)
            throw new common_1.NotFoundException('Organization not found');
        // Plan §14.1: an invite that grants workspace membership counts against the
        // target workspace's plan member cap. Block before sending the invite when a
        // target is already at capacity. No-op for enterprise (unlimited) workspaces.
        for (const ws of this.inviteWorkspaces(dto.workspaceMemberships)) {
            await this.plans.assertCanAddMembers(ws.workspaceId);
        }
        const token = (0, node_crypto_1.randomBytes)(32).toString('base64url');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const [invite] = await this.db
            .insert(db_1.invitations)
            .values({
            organizationId,
            email: dto.email.toLowerCase(),
            orgRole: (dto.orgRole || 'member'),
            workspaceMemberships: dto.workspaceMemberships || [],
            invitedByUserId: invitedById,
            token,
            expiresAt,
        })
            .returning();
        const inviter = await this.db.select().from(db_1.users).where((0, drizzle_orm_1.eq)(db_1.users.id, invitedById)).limit(1);
        const claimUrl = this.claimUrlForToken(token);
        await this.emailService.sendInvitationEmail({
            to: dto.email,
            inviter: inviter[0]?.displayName || 'A teammate',
            orgName: org[0].name,
            claimUrl,
            expiresAt,
        });
        // Fire member.invited per target workspace (best effort, non-blocking).
        for (const ws of this.inviteWorkspaces(invite.workspaceMemberships)) {
            void this.fireWebhook(ws.workspaceId, 'member.invited', {
                workspaceId: ws.workspaceId,
                email: invite.email,
                role: ws.role ?? null,
                invitationId: invite.id,
                actorId: invitedById,
            });
        }
        return invite;
    }
    async getClaimUrlById(invitationId) {
        const [invite] = await this.db.select().from(db_1.invitations).where((0, drizzle_orm_1.eq)(db_1.invitations.id, invitationId)).limit(1);
        if (!invite)
            throw new common_1.NotFoundException('Invitation not found');
        return { claimUrl: this.claimUrlForToken(invite.token) };
    }
    async resend(invitationId) {
        const [row] = await this.db
            .select({
            invite: db_1.invitations,
            org: db_1.organizations,
            inviter: db_1.users,
        })
            .from(db_1.invitations)
            .innerJoin(db_1.organizations, (0, drizzle_orm_1.eq)(db_1.organizations.id, db_1.invitations.organizationId))
            .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.invitations.invitedByUserId))
            .where((0, drizzle_orm_1.eq)(db_1.invitations.id, invitationId))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException('Invitation not found');
        if (row.invite.status !== 'pending')
            throw new common_1.GoneException('Invitation is not pending');
        if (row.invite.expiresAt < new Date())
            throw new common_1.GoneException('Invitation expired');
        const claimUrl = this.claimUrlForToken(row.invite.token);
        await this.emailService.sendInvitationEmail({
            to: row.invite.email,
            inviter: row.inviter.displayName || 'A teammate',
            orgName: row.org.name,
            claimUrl,
            expiresAt: row.invite.expiresAt,
        });
        return { ok: true };
    }
    async listPendingForWorkspace(workspaceId) {
        const pending = await this.db
            .select()
            .from(db_1.invitations)
            .where((0, drizzle_orm_1.eq)(db_1.invitations.status, 'pending'));
        return pending
            .filter((invite) => Array.isArray(invite.workspaceMemberships) &&
            invite.workspaceMemberships.some((ws) => ws.workspaceId === workspaceId))
            .map((invite) => {
            const workspaceMembership = Array.isArray(invite.workspaceMemberships)
                ? invite.workspaceMemberships.find((ws) => ws.workspaceId === workspaceId)
                : undefined;
            return {
                id: invite.id,
                email: invite.email,
                role: workspaceMembership?.role ?? 'member',
                status: invite.status,
                expiresAt: invite.expiresAt,
            };
        });
    }
    async revoke(invitationId) {
        await this.db
            .update(db_1.invitations)
            .set({ status: 'revoked' })
            .where((0, drizzle_orm_1.eq)(db_1.invitations.id, invitationId));
        return { ok: true };
    }
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
    async decline(token) {
        const [invite] = await this.db
            .select()
            .from(db_1.invitations)
            .where((0, drizzle_orm_1.eq)(db_1.invitations.token, token))
            .limit(1);
        if (!invite)
            throw new common_1.NotFoundException('Invitation not found');
        if (invite.status === 'declined')
            return { ok: true, status: 'declined' };
        // Anything already resolved stays as it is: declining an invitation that
        // was accepted would silently undo a membership, and declining one the
        // sender revoked would overwrite their record of why it ended.
        if (invite.status !== 'pending') {
            throw new common_1.GoneException('This invitation has already been used or revoked');
        }
        await this.db
            .update(db_1.invitations)
            .set({ status: 'declined' })
            .where((0, drizzle_orm_1.eq)(db_1.invitations.id, invite.id));
        return { ok: true, status: 'declined' };
    }
    async preview(token) {
        const [invite] = await this.db
            .select({
            invite: db_1.invitations,
            org: db_1.organizations,
            inviter: db_1.users,
        })
            .from(db_1.invitations)
            .innerJoin(db_1.organizations, (0, drizzle_orm_1.eq)(db_1.organizations.id, db_1.invitations.organizationId))
            .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.invitations.invitedByUserId))
            .where((0, drizzle_orm_1.eq)(db_1.invitations.token, token))
            .limit(1);
        if (!invite)
            throw new common_1.NotFoundException('Invitation not found');
        if (invite.invite.status !== 'pending')
            throw new common_1.GoneException('This invitation has already been used or revoked');
        if (invite.invite.expiresAt < new Date())
            throw new common_1.GoneException('This invitation has expired');
        const [existingUser] = await this.db
            .select({ id: db_1.users.id })
            .from(db_1.users)
            .where((0, drizzle_orm_1.eq)(db_1.users.email, invite.invite.email))
            .limit(1);
        return {
            orgName: invite.org.name,
            inviterName: invite.inviter.displayName,
            email: invite.invite.email,
            expiresAt: invite.invite.expiresAt,
            requiresAccountCreation: !existingUser,
        };
    }
    async claim(dto, currentUserId) {
        const [invite] = await this.db
            .select()
            .from(db_1.invitations)
            .where((0, drizzle_orm_1.eq)(db_1.invitations.token, dto.token))
            .limit(1);
        if (!invite)
            throw new common_1.NotFoundException('Invitation not found');
        if (invite.status !== 'pending')
            throw new common_1.GoneException('Invitation already used');
        if (invite.expiresAt < new Date())
            throw new common_1.GoneException('Invitation expired');
        const result = await this.db.transaction(async (tx) => {
            let userId = currentUserId;
            if (!userId) {
                // Find or create user
                const [existing] = await tx.select().from(db_1.users).where((0, drizzle_orm_1.eq)(db_1.users.email, invite.email)).limit(1);
                if (existing) {
                    // If user exists but not logged in, we should have blocked in controller or we require login
                    // For now, let's assume if they provide password we might be creating.
                    // But usually, if they exist, we require login.
                    throw new common_1.ForbiddenException('Account already exists. Please log in first.');
                }
                if (!dto.password || !dto.fullName) {
                    throw new common_1.ConflictException('Password and full name required for new account');
                }
                // New accounts created via an invite must meet the same strong-password
                // baseline enforced at /auth/signup.
                const strengthProblem = this.securitySettings.passwordStrengthProblem(dto.password);
                if (strengthProblem)
                    throw new common_1.BadRequestException(strengthProblem);
                const { hashSync } = await Promise.resolve().then(() => __importStar(require('bcryptjs')));
                const [newUser] = await tx
                    .insert(db_1.users)
                    .values({
                    email: invite.email,
                    displayName: dto.fullName,
                    passwordHash: hashSync(dto.password, 12),
                    emailVerified: true,
                })
                    .returning();
                userId = newUser.id;
            }
            else {
                const [currentUser] = await tx.select().from(db_1.users).where((0, drizzle_orm_1.eq)(db_1.users.id, userId)).limit(1);
                if (!currentUser)
                    throw new common_1.ForbiddenException('Authenticated user not found');
                if (currentUser.email.toLowerCase() !== invite.email.toLowerCase()) {
                    throw new common_1.ForbiddenException('This invitation belongs to a different email address');
                }
            }
            // Create org membership
            await tx
                .insert(db_1.organizationMembers)
                .values({
                organizationId: invite.organizationId,
                userId: userId,
                role: invite.orgRole,
            })
                .onConflictDoNothing();
            // Create workspace memberships
            if (invite.workspaceMemberships && Array.isArray(invite.workspaceMemberships)) {
                for (const ws of invite.workspaceMemberships) {
                    await tx
                        .insert(db_1.workspaceMembers)
                        .values({
                        workspaceId: ws.workspaceId,
                        userId: userId,
                        role: ws.role,
                    })
                        .onConflictDoNothing();
                }
            }
            // Mark invite accepted
            await tx
                .update(db_1.invitations)
                .set({
                status: 'accepted',
                acceptedAt: new Date(),
                acceptedByUserId: userId,
            })
                .where((0, drizzle_orm_1.eq)(db_1.invitations.id, invite.id));
            return { userId };
        });
        // Fire member.joined per workspace the invite granted (best effort). The
        // joining user is the actor. Runs after the tx commits so the membership
        // is durable before we advertise it.
        for (const ws of this.inviteWorkspaces(invite.workspaceMemberships)) {
            void this.fireWebhook(ws.workspaceId, 'member.joined', {
                workspaceId: ws.workspaceId,
                userId: result.userId,
                email: invite.email,
                role: ws.role ?? null,
                invitationId: invite.id,
                actorId: result.userId,
            });
        }
        return result;
    }
};
exports.InvitationsService = InvitationsService;
exports.InvitationsService = InvitationsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, email_service_1.EmailService,
        config_1.ConfigService,
        workspace_security_settings_service_1.WorkspaceSecuritySettingsService,
        webhooks_service_1.WebhooksService,
        plans_service_1.PlansService])
], InvitationsService);
//# sourceMappingURL=invitations.service.js.map