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
exports.ClientPortalPublicController = exports.ClientPortalController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const resource_member_guard_1 = require("../auth/guards/resource-member.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const client_portal_service_1 = require("./client-portal.service");
/**
 * Admin management of client portals. Creating/listing is scoped to a project
 * and gated by ResourceMemberGuard (workspace membership + private-container
 * access resolved from :projectId). Update/delete carry only the portal id, so
 * the service re-derives the project and enforces the same access there.
 */
let ClientPortalController = class ClientPortalController {
    constructor(portals) {
        this.portals = portals;
    }
    create(projectId, user, body) {
        return this.portals.create(projectId, user.id, body ?? {});
    }
    list(projectId, user) {
        return this.portals.listForProject(projectId, user.id);
    }
    update(id, user, body) {
        return this.portals.update(id, user.id, body ?? {});
    }
    remove(id, user) {
        return this.portals.remove(id, user.id);
    }
};
exports.ClientPortalController = ClientPortalController;
__decorate([
    (0, common_1.Post)('projects/:projectId/portal'),
    (0, common_1.UseGuards)(resource_member_guard_1.ResourceMemberGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Create a client portal for a project' }),
    __param(0, (0, common_1.Param)('projectId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ClientPortalController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('projects/:projectId/portal'),
    (0, common_1.UseGuards)(resource_member_guard_1.ResourceMemberGuard),
    (0, swagger_1.ApiOperation)({ summary: 'List a project\'s client portals' }),
    __param(0, (0, common_1.Param)('projectId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ClientPortalController.prototype, "list", null);
__decorate([
    (0, common_1.Patch)('portals/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Enable/disable, rename, or toggle show-completed for a portal' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ClientPortalController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)('portals/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Revoke (delete) a client portal' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ClientPortalController.prototype, "remove", null);
exports.ClientPortalController = ClientPortalController = __decorate([
    (0, swagger_1.ApiTags)('client-portal'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [client_portal_service_1.ClientPortalService])
], ClientPortalController);
/**
 * Public, anonymous, token-only read. No auth guard — `/portal/<token>` works
 * for any client with the link. Returns only the linked project's client-safe
 * projection (see ClientPortalService.getPublicView).
 */
let ClientPortalPublicController = class ClientPortalPublicController {
    constructor(portals) {
        this.portals = portals;
    }
    getPublic(token) {
        return this.portals.getPublicView(token);
    }
};
exports.ClientPortalPublicController = ClientPortalPublicController;
__decorate([
    (0, common_1.Get)('portal/:token'),
    (0, swagger_1.ApiOperation)({ summary: 'Get a client portal by token (no auth required)' }),
    __param(0, (0, common_1.Param)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ClientPortalPublicController.prototype, "getPublic", null);
exports.ClientPortalPublicController = ClientPortalPublicController = __decorate([
    (0, swagger_1.ApiTags)('client-portal-public'),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [client_portal_service_1.ClientPortalService])
], ClientPortalPublicController);
//# sourceMappingURL=client-portal.controller.js.map