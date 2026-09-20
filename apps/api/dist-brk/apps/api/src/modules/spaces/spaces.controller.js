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
exports.SpacePresetsController = exports.SpacesController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const resource_member_guard_1 = require("../auth/guards/resource-member.guard");
const permissions_guard_1 = require("../custom-roles/permissions.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const spaces_service_1 = require("./spaces.service");
const plans_service_1 = require("../plans/plans.service");
const space_presets_1 = require("./space-presets");
let SpacesController = class SpacesController {
    constructor(spacesService) {
        this.spacesService = spacesService;
    }
    async getSpacesByWorkspace(workspaceId, user) {
        return this.spacesService.getSpacesByWorkspace(workspaceId, user.id);
    }
    /** Destination tree for the Move picker: spaces → folders → projects. */
    async moveTargets(workspaceId, user) {
        return this.spacesService.moveTargets(workspaceId, user.id);
    }
    async getSpace(spaceId) {
        return this.spacesService.getSpace(spaceId);
    }
    async createSpace(user, body) {
        return this.spacesService.createSpace(body.workspaceId, {
            name: body.name,
            description: body.description,
            color: body.color,
            icon: body.icon,
            visibility: body.visibility,
            defaultPermission: body.defaultPermission,
            presetKey: body.presetKey,
            viewConfig: body.viewConfig,
            features: body.features,
        }, user.id);
    }
    async updateSpace(spaceId, user, body) {
        // Passed whole rather than field-by-field: the service whitelists, and a
        // second whitelist here is how `features` and `defaultPermission` came to
        // be declared in this signature and dropped on the way through.
        return this.spacesService.updateSpace(spaceId, body, user.id);
    }
    async deleteSpace(spaceId, user, ip) {
        await this.spacesService.deleteSpace(spaceId, user.id, ip);
        return { message: 'Space archived successfully' };
    }
};
exports.SpacesController = SpacesController;
__decorate([
    (0, common_1.Get)('workspace/:workspaceId'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], SpacesController.prototype, "getSpacesByWorkspace", null);
__decorate([
    (0, common_1.Get)('workspace/:workspaceId/move-targets'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], SpacesController.prototype, "moveTargets", null);
__decorate([
    (0, common_1.Get)(':spaceId'),
    __param(0, (0, common_1.Param)('spaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SpacesController.prototype, "getSpace", null);
__decorate([
    (0, common_1.Post)(),
    (0, permissions_guard_1.RequirePermissions)('space.create'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SpacesController.prototype, "createSpace", null);
__decorate([
    (0, common_1.Put)(':spaceId'),
    __param(0, (0, common_1.Param)('spaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], SpacesController.prototype, "updateSpace", null);
__decorate([
    (0, common_1.Delete)(':spaceId'),
    __param(0, (0, common_1.Param)('spaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Ip)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", Promise)
], SpacesController.prototype, "deleteSpace", null);
exports.SpacesController = SpacesController = __decorate([
    (0, common_1.Controller)('spaces'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, resource_member_guard_1.ResourceMemberGuard, permissions_guard_1.PermissionsGuard),
    __metadata("design:paramtypes", [spaces_service_1.SpacesService])
], SpacesController);
/**
 * §V2-06 — the workflow presets of frame `07:06`, served rather than
 * duplicated in the web bundle.
 *
 * The wizard previews what each card will do — its views, its statuses, its
 * ClickApps and the lists it seeds — and that preview has to be the same object
 * the server applies. A second copy in the front end is a second definition of
 * what "Marketing Teams" means, and the two would disagree the first time
 * either one changed.
 *
 * ITS OWN CONTROLLER, at its own path, for two reasons that are not style.
 * `SpacesController` declares `@Get(':spaceId')`, so `/spaces/presets` would
 * match that first and arrive as a space id; and its class-level
 * `ResourceMemberGuard` resolves a workspace from that id, so the request
 * would be refused as a malformed UUID before reaching any handler. A constant
 * needs neither.
 */
let SpacePresetsController = class SpacePresetsController {
    constructor(plans) {
        this.plans = plans;
    }
    listPresets() {
        return { presets: space_presets_1.SPACE_PRESETS, features: space_presets_1.SPACE_FEATURE_KEYS, views: space_presets_1.SPACE_VIEW_KEYS };
    }
    /**
     * §V2-06 `[07:20]` — the same constant, plus what THIS workspace's plan
     * reaches.
     *
     * > "ClickUp Apps is also dependent on that — ke aap ke paas PACKAGE PLAN
     * > kaun sa hai."
     *
     * A separate, workspace-scoped route rather than a `?workspaceId=` on the one
     * above, for a reason that is not style: `ResourceMemberGuard` resolves the
     * workspace from route params and body and NOT from the query string, so a
     * query parameter would be an ungated read of another workspace's commercial
     * tier. As a path param the existing guard does the work.
     *
     * `features` stays the full set and `lockedFeatures` says which of them this
     * plan cannot have, rather than the server quietly sending a shorter list.
     * A ClickApp that simply vanishes is indistinguishable from one that was
     * never built — and "upgrade to get this" is the thing the transcript is
     * actually describing.
     */
    async listPresetsForWorkspace(workspaceId) {
        const plan = await this.plans.getWorkspacePlan(workspaceId);
        return {
            presets: space_presets_1.SPACE_PRESETS,
            features: space_presets_1.SPACE_FEATURE_KEYS,
            views: space_presets_1.SPACE_VIEW_KEYS,
            plan: { id: plan.id, label: plan.label, recognized: plan.recognized },
            allowedFeatures: (0, space_presets_1.clickAppsForPlan)(plan.id),
            lockedFeatures: (0, space_presets_1.lockedClickApps)(plan.id),
        };
    }
};
exports.SpacePresetsController = SpacePresetsController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SpacePresetsController.prototype, "listPresets", null);
__decorate([
    (0, common_1.Get)(':workspaceId'),
    (0, common_1.UseGuards)(resource_member_guard_1.ResourceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SpacePresetsController.prototype, "listPresetsForWorkspace", null);
exports.SpacePresetsController = SpacePresetsController = __decorate([
    (0, common_1.Controller)('space-presets'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [plans_service_1.PlansService])
], SpacePresetsController);
//# sourceMappingURL=spaces.controller.js.map