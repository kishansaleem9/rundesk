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
exports.ScimController = exports.ScimAdminController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_admin_guard_1 = require("../auth/guards/workspace-admin.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const scim_service_1 = require("./scim.service");
// ─── SCIM token management (workspace admin, JWT-protected) ─────────────────
let ScimAdminController = class ScimAdminController {
    constructor(scim) {
        this.scim = scim;
    }
    list(workspaceId) {
        return this.scim.listTokens(workspaceId);
    }
    create(workspaceId, body, user) {
        const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
        return this.scim.createToken(workspaceId, user.id, { name: body.name, expiresAt });
    }
    revoke(workspaceId, tokenId, user) {
        return this.scim.revokeToken(workspaceId, tokenId, user.id);
    }
};
exports.ScimAdminController = ScimAdminController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Param)('workspaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ScimAdminController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ScimAdminController.prototype, "create", null);
__decorate([
    (0, common_1.Delete)(':tokenId'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('tokenId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], ScimAdminController.prototype, "revoke", null);
exports.ScimAdminController = ScimAdminController = __decorate([
    (0, swagger_1.ApiTags)('scim-admin'),
    (0, common_1.Controller)('workspaces/:workspaceId/scim/tokens'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_admin_guard_1.WorkspaceAdminGuard),
    __metadata("design:paramtypes", [scim_service_1.ScimService])
], ScimAdminController);
// ─── SCIM 2.0 protocol surface (bearer-token-protected) ─────────────────────
//
// Note: SCIM clients (Okta, Azure AD, etc.) use long-lived bearer tokens we
// issue in the admin UI, NOT the workspace JWT. Each method extracts the
// token from the Authorization header and asks the service to resolve it to
// a workspaceId.
let ScimController = class ScimController {
    constructor(scim) {
        this.scim = scim;
    }
    serviceProviderConfig() {
        return this.scim.serviceProviderConfig();
    }
    resourceTypes() {
        return this.scim.resourceTypes();
    }
    schemas() {
        return this.scim.schemas();
    }
    async listUsers(authHeader, startIndex, count, filter) {
        const workspaceId = await this.scim.authenticate(this.extractBearer(authHeader));
        return this.scim.listUsers(workspaceId, {
            startIndex: startIndex ? Number(startIndex) : undefined,
            count: count ? Number(count) : undefined,
            filter,
        });
    }
    async getUser(authHeader, id) {
        const workspaceId = await this.scim.authenticate(this.extractBearer(authHeader));
        return this.scim.getUser(workspaceId, id);
    }
    async createUser(authHeader, body, res) {
        const workspaceId = await this.scim.authenticate(this.extractBearer(authHeader));
        const created = await this.scim.createUser(workspaceId, null, body);
        res.code?.(201);
        return created;
    }
    async replaceUser(authHeader, id, body) {
        const workspaceId = await this.scim.authenticate(this.extractBearer(authHeader));
        return this.scim.replaceUser(workspaceId, id, null, body);
    }
    async patchUser(authHeader, id, body) {
        const workspaceId = await this.scim.authenticate(this.extractBearer(authHeader));
        return this.scim.patchUser(workspaceId, id, null, body);
    }
    async deleteUser(authHeader, id, res) {
        const workspaceId = await this.scim.authenticate(this.extractBearer(authHeader));
        await this.scim.deleteUser(workspaceId, id, null);
        res.code?.(204);
        return;
    }
    // ─── SCIM 2.0 Groups ──────────────────────────────────────────────────────
    async listGroups(authHeader, startIndex, count, filter) {
        const workspaceId = await this.scim.authenticate(this.extractBearer(authHeader));
        return this.scim.listGroups(workspaceId, {
            startIndex: startIndex ? Number(startIndex) : undefined,
            count: count ? Number(count) : undefined,
            filter,
        });
    }
    async getGroup(authHeader, id) {
        const workspaceId = await this.scim.authenticate(this.extractBearer(authHeader));
        return this.scim.getGroup(workspaceId, id);
    }
    async createGroup(authHeader, body, res) {
        const workspaceId = await this.scim.authenticate(this.extractBearer(authHeader));
        const created = await this.scim.createGroup(workspaceId, null, body);
        res.code?.(201);
        return created;
    }
    async replaceGroup(authHeader, id, body) {
        const workspaceId = await this.scim.authenticate(this.extractBearer(authHeader));
        return this.scim.replaceGroup(workspaceId, id, null, body);
    }
    async patchGroup(authHeader, id, body) {
        const workspaceId = await this.scim.authenticate(this.extractBearer(authHeader));
        return this.scim.patchGroup(workspaceId, id, null, body);
    }
    async deleteGroup(authHeader, id, res) {
        const workspaceId = await this.scim.authenticate(this.extractBearer(authHeader));
        await this.scim.deleteGroup(workspaceId, id, null);
        res.code?.(204);
        return;
    }
    extractBearer(headerValue) {
        if (!headerValue)
            return undefined;
        const match = headerValue.match(/^Bearer\s+(.+)$/i);
        return match?.[1];
    }
};
exports.ScimController = ScimController;
__decorate([
    (0, common_1.Get)('ServiceProviderConfig'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ScimController.prototype, "serviceProviderConfig", null);
__decorate([
    (0, common_1.Get)('ResourceTypes'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ScimController.prototype, "resourceTypes", null);
__decorate([
    (0, common_1.Get)('Schemas'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ScimController.prototype, "schemas", null);
__decorate([
    (0, common_1.Get)('Users'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Query)('startIndex')),
    __param(2, (0, common_1.Query)('count')),
    __param(3, (0, common_1.Query)('filter')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", Promise)
], ScimController.prototype, "listUsers", null);
__decorate([
    (0, common_1.Get)('Users/:id'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ScimController.prototype, "getUser", null);
__decorate([
    (0, common_1.Post)('Users'),
    (0, common_1.HttpCode)(201),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], ScimController.prototype, "createUser", null);
__decorate([
    (0, common_1.Put)('Users/:id'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], ScimController.prototype, "replaceUser", null);
__decorate([
    (0, common_1.Patch)('Users/:id'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], ScimController.prototype, "patchUser", null);
__decorate([
    (0, common_1.Delete)('Users/:id'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], ScimController.prototype, "deleteUser", null);
__decorate([
    (0, common_1.Get)('Groups'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Query)('startIndex')),
    __param(2, (0, common_1.Query)('count')),
    __param(3, (0, common_1.Query)('filter')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", Promise)
], ScimController.prototype, "listGroups", null);
__decorate([
    (0, common_1.Get)('Groups/:id'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ScimController.prototype, "getGroup", null);
__decorate([
    (0, common_1.Post)('Groups'),
    (0, common_1.HttpCode)(201),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], ScimController.prototype, "createGroup", null);
__decorate([
    (0, common_1.Put)('Groups/:id'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], ScimController.prototype, "replaceGroup", null);
__decorate([
    (0, common_1.Patch)('Groups/:id'),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], ScimController.prototype, "patchGroup", null);
__decorate([
    (0, common_1.Delete)('Groups/:id'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, common_1.Headers)('authorization')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], ScimController.prototype, "deleteGroup", null);
exports.ScimController = ScimController = __decorate([
    (0, swagger_1.ApiTags)('scim'),
    (0, common_1.Controller)('scim/v2'),
    __metadata("design:paramtypes", [scim_service_1.ScimService])
], ScimController);
//# sourceMappingURL=scim.controller.js.map