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
exports.InvitationsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const organization_admin_guard_1 = require("../auth/guards/organization-admin.guard");
const invitations_service_1 = require("./invitations.service");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const auth_service_1 = require("../auth/auth.service");
const database_module_1 = require("../../common/database/database.module");
const jwt_1 = require("@nestjs/jwt");
let InvitationsController = class InvitationsController {
    constructor(invitationsService, authService, jwtService, db) {
        this.invitationsService = invitationsService;
        this.authService = authService;
        this.jwtService = jwtService;
        this.db = db;
    }
    async assertInviteWorkspaceAdminOrManager(invitationId, userId) {
        const { invitations, workspaceMembers } = await Promise.resolve().then(() => __importStar(require('@rundesk/db')));
        const { eq, and, inArray } = await Promise.resolve().then(() => __importStar(require('drizzle-orm')));
        const [inv] = await this.db.select().from(invitations).where(eq(invitations.id, invitationId)).limit(1);
        if (!inv)
            throw new common_1.NotFoundException('Invitation not found');
        const workspaceIds = Array.isArray(inv.workspaceMemberships)
            ? inv.workspaceMemberships.map((m) => m.workspaceId).filter(Boolean)
            : [];
        if (workspaceIds.length === 0)
            throw new common_1.ForbiddenException('No workspace context on invitation');
        const [membership] = await this.db
            .select()
            .from(workspaceMembers)
            .where(and(inArray(workspaceMembers.workspaceId, workspaceIds), eq(workspaceMembers.userId, userId), inArray(workspaceMembers.role, ['workspace_admin', 'manager'])))
            .limit(1);
        if (!membership)
            throw new common_1.ForbiddenException('Workspace admin or manager access required');
        return inv;
    }
    async createSingular(user, body) {
        const { workspaceMembers } = await Promise.resolve().then(() => __importStar(require('@rundesk/db')));
        const { and, eq, inArray } = await Promise.resolve().then(() => __importStar(require('drizzle-orm')));
        const [membership] = await this.db
            .select()
            .from(workspaceMembers)
            .where(and(eq(workspaceMembers.workspaceId, body.workspaceId), eq(workspaceMembers.userId, user.id), inArray(workspaceMembers.role, ['workspace_admin', 'manager'])))
            .limit(1);
        if (!membership)
            throw new common_1.ForbiddenException('Workspace admin or manager access required');
        // 1. Find organization for this workspace
        // We'll use the raw DB for a quick lookup
        const { workspaces } = await Promise.resolve().then(() => __importStar(require('@rundesk/db')));
        const { eq: eqWorkspace } = await Promise.resolve().then(() => __importStar(require('drizzle-orm')));
        const [ws] = await this.db
            .select()
            .from(workspaces)
            .where(eqWorkspace(workspaces.id, body.workspaceId))
            .limit(1);
        if (!ws)
            throw new common_1.NotFoundException('Workspace not found');
        // 2. Create invitation
        // We map workspace role to org role (defaulting to member)
        // and store the workspace membership in the invitation payload
        return this.invitationsService.create(ws.organizationId, user.id, {
            email: body.email,
            orgRole: 'member',
            workspaceMemberships: [{ workspaceId: body.workspaceId, role: body.role }],
        });
    }
    async claim(dto, req) {
        let currentUserId = req.user?.id;
        const authHeader = req.headers?.authorization ?? '';
        const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
        if (!currentUserId && bearerToken) {
            try {
                const payload = this.jwtService.verify(bearerToken);
                currentUserId = payload?.sub;
            }
            catch {
                throw new common_1.ForbiddenException('Invalid access token');
            }
        }
        const { userId } = await this.invitationsService.claim(dto, currentUserId);
        return this.authService.issueSessionForUserId(userId, {
            userAgent: req.headers['user-agent'],
            ip: req.ip,
        });
    }
    async listWorkspacePending(workspaceId, req) {
        const { workspaceMembers } = await Promise.resolve().then(() => __importStar(require('@rundesk/db')));
        const { and, eq } = await Promise.resolve().then(() => __importStar(require('drizzle-orm')));
        const reqUserId = req.user?.id;
        if (!reqUserId)
            throw new common_1.ForbiddenException('Not authenticated');
        const [membership] = await this.db
            .select()
            .from(workspaceMembers)
            .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, reqUserId)))
            .limit(1);
        if (!membership)
            throw new common_1.ForbiddenException('Workspace membership required');
        return this.invitationsService.listPendingForWorkspace(workspaceId);
    }
    async decline(dto) {
        return this.invitationsService.decline(dto?.token);
    }
    async preview(token) {
        return this.invitationsService.preview(token);
    }
    async bulkInvite(orgId, user, body) {
        const results = [];
        for (const inv of body.invites) {
            results.push(await this.invitationsService.create(orgId, user.id, inv));
        }
        return results;
    }
    async listPending(orgId) {
        return this.invitationsService.listPending(orgId);
    }
    async revoke(id, req) {
        const reqUserId = req.user?.id;
        if (!reqUserId)
            throw new common_1.ForbiddenException('Not authenticated');
        await this.assertInviteWorkspaceAdminOrManager(id, reqUserId);
        return this.invitationsService.revoke(id);
    }
    async getLink(id, req) {
        const reqUserId = req.user?.id;
        if (!reqUserId)
            throw new common_1.ForbiddenException('Not authenticated');
        await this.assertInviteWorkspaceAdminOrManager(id, reqUserId);
        return this.invitationsService.getClaimUrlById(id);
    }
    async resend(id, req) {
        const reqUserId = req.user?.id;
        if (!reqUserId)
            throw new common_1.ForbiddenException('Not authenticated');
        await this.assertInviteWorkspaceAdminOrManager(id, reqUserId);
        return this.invitationsService.resend(id);
    }
};
exports.InvitationsController = InvitationsController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a singular invitation for a workspace' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], InvitationsController.prototype, "createSingular", null);
__decorate([
    (0, common_1.Post)('claim'),
    (0, swagger_1.ApiOperation)({ summary: 'Claim an invitation and create an account if needed' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], InvitationsController.prototype, "claim", null);
__decorate([
    (0, common_1.Get)('workspace/:workspaceId'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'List pending invitations scoped to a workspace' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], InvitationsController.prototype, "listWorkspacePending", null);
__decorate([
    (0, common_1.Post)('decline'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Decline an invitation — the recipient says no' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], InvitationsController.prototype, "decline", null);
__decorate([
    (0, common_1.Get)('preview'),
    (0, swagger_1.ApiOperation)({ summary: 'Preview an invitation before claiming' }),
    __param(0, (0, common_1.Query)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], InvitationsController.prototype, "preview", null);
__decorate([
    (0, common_1.Post)(':organizationId/bulk'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, organization_admin_guard_1.OrganizationAdminGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Bulk invite members' }),
    __param(0, (0, common_1.Param)('organizationId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], InvitationsController.prototype, "bulkInvite", null);
__decorate([
    (0, common_1.Get)(':organizationId/pending'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, organization_admin_guard_1.OrganizationAdminGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'List pending invitations' }),
    __param(0, (0, common_1.Param)('organizationId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], InvitationsController.prototype, "listPending", null);
__decorate([
    (0, common_1.Delete)(':invitationId'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Revoke an invitation (workspace admin/manager only)' }),
    __param(0, (0, common_1.Param)('invitationId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], InvitationsController.prototype, "revoke", null);
__decorate([
    (0, common_1.Get)(':invitationId/link'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get invitation claim link (workspace admin/manager only)' }),
    __param(0, (0, common_1.Param)('invitationId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], InvitationsController.prototype, "getLink", null);
__decorate([
    (0, common_1.Post)(':invitationId/resend'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Resend invitation email (workspace admin/manager only)' }),
    __param(0, (0, common_1.Param)('invitationId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], InvitationsController.prototype, "resend", null);
exports.InvitationsController = InvitationsController = __decorate([
    (0, swagger_1.ApiTags)('invitations'),
    (0, common_1.Controller)('invitations'),
    __param(3, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [invitations_service_1.InvitationsService,
        auth_service_1.AuthService,
        jwt_1.JwtService, Object])
], InvitationsController);
//# sourceMappingURL=invitations.controller.js.map