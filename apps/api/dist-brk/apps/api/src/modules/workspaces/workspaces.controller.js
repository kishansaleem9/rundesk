"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspacesPublicController = exports.WorkspacesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const workspaces_service_1 = require("./workspaces.service");
const plans_service_1 = require("../plans/plans.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const workspace_admin_guard_1 = require("../auth/guards/workspace-admin.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const create_workspace_dto_1 = require("./dto/create-workspace.dto");
const workspace_creation_policy_1 = require("./workspace-creation-policy");
let WorkspacesController = class WorkspacesController {
    constructor(workspacesService, plans) {
        this.workspacesService = workspacesService;
        this.plans = plans;
    }
    async getMyWorkspaces(user) {
        return this.workspacesService.findByMember(user.id);
    }
    // Declared before ':workspaceId' so the literal path wins over the UUID param.
    async getArchivedWorkspaces(user) {
        return this.workspacesService.listArchivedWorkspaces(user.id);
    }
    async create(user, dto) {
        // §7 [09:29] — "WORKSPACE IS A FEATURE jo ke har member kar sakta hai —
        // it's not necessary ke humare paas kuch admin hi aaye jo kar sake." This
        // was Super-Admin-only, which is the thing she called missing outright at
        // [10:03]. The rule lives in workspace-creation-policy.ts with her wording.
        if (!(0, workspace_creation_policy_1.canCreateWorkspace)(user.role)) {
            throw new common_1.ForbiddenException('Guests cannot create workspaces');
        }
        return this.workspacesService.create(user.id, dto);
    }
    async getOne(workspaceId) {
        return this.workspacesService.findById(workspaceId);
    }
    async getPlan(workspaceId) {
        return this.plans.getUsage(workspaceId);
    }
    async setPlan(workspaceId, body, user) {
        // Changing a workspace's commercial plan is a platform-level (billing) action,
        // reserved for the Super Admin — mirrors the OrganizationsController gate.
        if (user.role !== 'super_admin') {
            throw new common_1.ForbiddenException('Only a Super Admin can change a workspace plan');
        }
        return this.plans.setWorkspacePlan(workspaceId, body.plan, body.planLimits);
    }
    async update(workspaceId, body, user, ip) {
        return this.workspacesService.update(workspaceId, body, { id: user.id, email: user.email, ip });
    }
    async presignLogo(workspaceId, body) {
        return this.workspacesService.createLogoUploadUrl(workspaceId, body);
    }
    async getArchivedTasks(workspaceId, user) {
        return this.workspacesService.listArchivedTasks(workspaceId, { id: user.id, role: user.role });
    }
    async verifyDomain(workspaceId) {
        return this.workspacesService.verifyCustomDomain(workspaceId);
    }
    async archive(workspaceId, user, ip) {
        return this.workspacesService.archiveWorkspace(workspaceId, { id: user.id, email: user.email, ip });
    }
    async restore(workspaceId, user) {
        return this.workspacesService.restoreWorkspace(workspaceId, { id: user.id, email: user.email });
    }
    async getOnboarding(workspaceId, user) {
        return this.workspacesService.getOnboardingStatus(workspaceId, user.id);
    }
    async dismissOnboarding(_workspaceId, user) {
        return this.workspacesService.dismissOnboarding(user.id);
    }
    async listMembers(workspaceId) {
        return this.workspacesService.listMembers(workspaceId);
    }
    async addMember(workspaceId, body, user) {
        return this.workspacesService.addMember(workspaceId, body.email, body.role, {
            id: user.id,
            email: user.email,
        });
    }
    async updateMember(workspaceId, userId, body, user, ip) {
        return this.workspacesService.updateMemberRole(workspaceId, userId, body.role, {
            id: user.id,
            email: user.email,
            ip,
        });
    }
    async updateMemberCapacity(workspaceId, userId, body, user) {
        return this.workspacesService.updateMemberCapacity(workspaceId, userId, body.weeklyCapacityHours, {
            id: user.id,
            email: user.email,
        });
    }
    // Reporting line. Admin-only: who reports to whom drives the org tree and
    // (in time) approval routing, so it is not a self-service field.
    async updateMemberManager(workspaceId, userId, body, user, ip) {
        return this.workspacesService.updateMemberManager(workspaceId, userId, body.managerId ?? null, {
            id: user.id,
            email: user.email,
            ip,
        });
    }
    async getWorkSchedule(workspaceId) {
        return this.workspacesService.getWorkSchedule(workspaceId);
    }
    async setWorkDays(workspaceId, body, user, ip) {
        return this.workspacesService.setWorkDays(workspaceId, body.workDays, {
            id: user.id,
            email: user.email,
            ip,
        });
    }
    async addHoliday(workspaceId, body, user, ip) {
        return this.workspacesService.addHoliday(workspaceId, body.day, body.name, {
            id: user.id,
            email: user.email,
            ip,
        });
    }
    async removeHoliday(workspaceId, holidayId, user, ip) {
        return this.workspacesService.removeHoliday(workspaceId, holidayId, {
            id: user.id,
            email: user.email,
            ip,
        });
    }
    async removeMember(workspaceId, userId, user, ip) {
        return this.workspacesService.removeMember(workspaceId, userId, {
            id: user.id,
            email: user.email,
            ip,
        });
    }
};
exports.WorkspacesController = WorkspacesController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List workspaces the current user belongs to' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WorkspacesController.prototype, "getMyWorkspaces", null);
__decorate([
    (0, common_1.Get)('archived'),
    (0, swagger_1.ApiOperation)({ summary: 'List archived workspaces the current user belongs to (Plan §13.4)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WorkspacesController.prototype, "getArchivedWorkspaces", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new workspace (§7 — any member except a guest)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_workspace_dto_1.CreateWorkspaceDto]),
    __metadata("design:returntype", Promise)
], WorkspacesController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(':workspaceId'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Get a workspace by id (must be a member)' }),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], WorkspacesController.prototype, "getOne", null);
__decorate([
    (0, common_1.Get)(':workspaceId/plan'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Get the workspace plan + limits + current usage (Plan §14.1)' }),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], WorkspacesController.prototype, "getPlan", null);
__decorate([
    (0, common_1.Patch)(':workspaceId/plan'),
    (0, swagger_1.ApiOperation)({ summary: "Set a workspace's plan (Super Admin only, Plan §14.1)" }),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], WorkspacesController.prototype, "setPlan", null);
__decorate([
    (0, common_1.Patch)(':workspaceId'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Ip)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, String]),
    __metadata("design:returntype", Promise)
], WorkspacesController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':workspaceId/logo/presign'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Presign a direct-to-R2 upload for the workspace logo (Plan §13.5)' }),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], WorkspacesController.prototype, "presignLogo", null);
__decorate([
    (0, common_1.Get)(':workspaceId/archived-tasks'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    (0, swagger_1.ApiOperation)({ summary: 'List archived tasks in the workspace (Plan §13.4)' }),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], WorkspacesController.prototype, "getArchivedTasks", null);
__decorate([
    (0, common_1.Post)(':workspaceId/verify-domain'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Verify the workspace custom domain via DNS TXT' }),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], WorkspacesController.prototype, "verifyDomain", null);
__decorate([
    (0, common_1.Delete)(':workspaceId'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Archive (soft-delete) a workspace' }),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Ip)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", Promise)
], WorkspacesController.prototype, "archive", null);
__decorate([
    (0, common_1.Post)(':workspaceId/restore'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Restore an archived workspace' }),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], WorkspacesController.prototype, "restore", null);
__decorate([
    (0, common_1.Get)(':workspaceId/onboarding'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Guided onboarding checklist state for the current user (Plan §14.3)' }),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], WorkspacesController.prototype, "getOnboarding", null);
__decorate([
    (0, common_1.Post)(':workspaceId/onboarding/dismiss'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Dismiss the onboarding checklist for the current user (Plan §14.3)' }),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], WorkspacesController.prototype, "dismissOnboarding", null);
__decorate([
    (0, common_1.Get)(':workspaceId/members'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], WorkspacesController.prototype, "listMembers", null);
__decorate([
    (0, common_1.Post)(':workspaceId/members'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], WorkspacesController.prototype, "addMember", null);
__decorate([
    (0, common_1.Patch)(':workspaceId/members/:userId'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Param)('userId', new common_1.ParseUUIDPipe())),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __param(4, (0, common_1.Ip)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object, String]),
    __metadata("design:returntype", Promise)
], WorkspacesController.prototype, "updateMember", null);
__decorate([
    (0, common_1.Patch)(':workspaceId/members/:userId/capacity'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Param)('userId', new common_1.ParseUUIDPipe())),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", Promise)
], WorkspacesController.prototype, "updateMemberCapacity", null);
__decorate([
    (0, common_1.Patch)(':workspaceId/members/:userId/manager'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Param)('userId', new common_1.ParseUUIDPipe())),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __param(4, (0, common_1.Ip)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object, String]),
    __metadata("design:returntype", Promise)
], WorkspacesController.prototype, "updateMemberManager", null);
__decorate([
    (0, common_1.Get)(':workspaceId/work-schedule'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], WorkspacesController.prototype, "getWorkSchedule", null);
__decorate([
    (0, common_1.Patch)(':workspaceId/work-schedule'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Ip)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, String]),
    __metadata("design:returntype", Promise)
], WorkspacesController.prototype, "setWorkDays", null);
__decorate([
    (0, common_1.Post)(':workspaceId/holidays'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Ip)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, String]),
    __metadata("design:returntype", Promise)
], WorkspacesController.prototype, "addHoliday", null);
__decorate([
    (0, common_1.Delete)(':workspaceId/holidays/:holidayId'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Param)('holidayId', new common_1.ParseUUIDPipe())),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Ip)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, String]),
    __metadata("design:returntype", Promise)
], WorkspacesController.prototype, "removeHoliday", null);
__decorate([
    (0, common_1.Delete)(':workspaceId/members/:userId'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Param)('userId', new common_1.ParseUUIDPipe())),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Ip)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, String]),
    __metadata("design:returntype", Promise)
], WorkspacesController.prototype, "removeMember", null);
exports.WorkspacesController = WorkspacesController = __decorate([
    (0, swagger_1.ApiTags)('workspaces'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('workspaces'),
    __metadata("design:paramtypes", [workspaces_service_1.WorkspacesService,
        plans_service_1.PlansService])
], WorkspacesController);
/**
 * Public, unauthenticated custom-domain resolution (Plan §13.5 / §2.2). No
 * JwtAuthGuard — mirrors ClientPortalPublicController / DocsPublicController — so
 * the SPA can, at bootstrap on a custom domain, discover which workspace the
 * domain belongs to and apply its branding before anyone signs in. GET is a
 * safe method, so the global CsrfGuard admits it too. Returns only the safe
 * public branding projection, or 404 when no verified workspace claims the host.
 *
 * It also hosts the on-demand-TLS authorization ("ask") endpoint a
 * TLS-terminating reverse proxy calls to decide whether to obtain a certificate
 * for an incoming Host — see `authorizeTls` for the operational contract.
 */
let WorkspacesPublicController = class WorkspacesPublicController {
    constructor(workspacesService) {
        this.workspacesService = workspacesService;
    }
    async workspaceByDomain(hostParam, hostHeader) {
        // Prefer an explicit ?host= (the SPA passes window.location.host); fall back
        // to the request's own Host header when the query param is absent.
        const host = (hostParam && hostParam.trim()) || hostHeader || '';
        const workspace = await this.workspacesService.resolveByCustomDomain(host);
        if (!workspace)
            throw new common_1.NotFoundException('No workspace is served on that domain');
        return workspace;
    }
    /**
     * On-demand TLS authorization ("ask") endpoint for a TLS-terminating reverse
     * proxy (Plan §13.5 / §2.2). This closes the custom-domain TLS caveat at the
     * app layer: certificate provisioning used to be noted as a manual ops step,
     * but the app now OWNS the authorization decision (which hosts may get a
     * certificate) while the proxy owns ACME + certificate storage.
     *
     * OPERATIONAL CONTRACT — point the proxy's on-demand-TLS "ask" at:
     *
     *     GET /api/v1/public/tls/authorize?domain={host}
     *
     * It returns HTTP 200 (`{ ok: true }`) IF AND ONLY IF {host} is the VERIFIED
     * custom domain of a live (non-archived) workspace, and HTTP 403 otherwise. A
     * TLS-terminating proxy (e.g. Caddy `on_demand_tls` with `ask`, or any proxy
     * exposing an on-demand-TLS authorization hook) treats a 2xx as "yes, obtain /
     * renew a certificate for this host" and any non-2xx as "no". Wiring this in
     * makes custom-domain HTTPS FULLY AUTOMATIC in production — the proxy obtains
     * and renews certificates on demand ONLY for domains a workspace owner has
     * verified (via the DNS-TXT `verifyCustomDomain` flow), with NO per-domain
     * manual certificate step — and it refuses every other host, which prevents an
     * attacker from steering the proxy into requesting ACME certificates for
     * arbitrary domains it does not control.
     *
     * Example Caddyfile:
     *
     *     {
     *       on_demand_tls {
     *         ask http://rundesk-api:3001/api/v1/public/tls/authorize
     *       }
     *     }
     *     https:// {
     *       tls { on_demand }
     *       reverse_proxy rundesk-api:3001
     *     }
     *
     * Caddy appends `?domain=<sni-host>` to the ask URL automatically. The
     * decision reuses `resolveByCustomDomain`, so it can never diverge from which
     * host the app actually serves, and is a single cheap lookup over the small
     * set of workspaces that set a custom domain. Because that decision keys on
     * the `?domain=` query value, a short `Cache-Control` hint lets the proxy/edge
     * skip re-asking for the same host on every handshake without meaningfully
     * delaying propagation when a domain is later unverified or archived. The
     * header is only emitted on the 200 path, so a refusal is never cached.
     */
    async authorizeTls(domainParam, hostParam, hostHeader) {
        // Caddy sends the SNI host as ?domain=; accept ?host= as an alias and fall
        // back to the request's own Host header (same precedence as workspaceByDomain).
        const host = (domainParam && domainParam.trim()) || (hostParam && hostParam.trim()) || hostHeader || '';
        const authorized = await this.workspacesService.isCustomDomainAuthorized(host);
        // A non-2xx means "do NOT issue a certificate for this host". 403 (rather
        // than 404) makes the refusal explicit: the host is a valid request target
        // but is NOT authorized for certificate issuance until its workspace owner
        // has verified it — the guard against ACME issuance for arbitrary domains.
        if (!authorized)
            throw new common_1.ForbiddenException('TLS is not authorized for that host');
        return { ok: true };
    }
};
exports.WorkspacesPublicController = WorkspacesPublicController;
__decorate([
    (0, common_1.Get)('public/workspace-by-domain'),
    (0, swagger_1.ApiOperation)({ summary: 'Resolve a verified custom domain to its workspace branding (no auth)' }),
    __param(0, (0, common_1.Query)('host')),
    __param(1, (0, common_1.Headers)('host')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], WorkspacesPublicController.prototype, "workspaceByDomain", null);
__decorate([
    (0, common_1.Get)('public/tls/authorize'),
    (0, common_1.Header)('Cache-Control', 'public, max-age=60'),
    (0, swagger_1.ApiOperation)({ summary: 'On-demand TLS authorization for a verified custom domain (no auth)' }),
    __param(0, (0, common_1.Query)('domain')),
    __param(1, (0, common_1.Query)('host')),
    __param(2, (0, common_1.Headers)('host')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], WorkspacesPublicController.prototype, "authorizeTls", null);
exports.WorkspacesPublicController = WorkspacesPublicController = __decorate([
    (0, swagger_1.ApiTags)('workspaces-public'),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [workspaces_service_1.WorkspacesService])
], WorkspacesPublicController);
//# sourceMappingURL=workspaces.controller.js.map