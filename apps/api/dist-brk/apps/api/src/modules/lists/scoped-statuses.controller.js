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
exports.ProjectStatusesController = exports.SpaceStatusesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const resource_member_guard_1 = require("../auth/guards/resource-member.guard");
const scoped_statuses_service_1 = require("./scoped-statuses.service");
let SpaceStatusesController = class SpaceStatusesController {
    constructor(statuses) {
        this.statuses = statuses;
    }
    list(spaceId) {
        return this.statuses.list('space', spaceId);
    }
    create(spaceId, body) {
        return this.statuses.create('space', spaceId, body);
    }
    update(spaceId, statusId, body) {
        return this.statuses.update('space', spaceId, statusId, body);
    }
    remove(spaceId, statusId, reassignToStatusId) {
        return this.statuses.remove('space', spaceId, statusId, reassignToStatusId ?? null);
    }
    reorder(spaceId, body) {
        return this.statuses.reorder('space', spaceId, body.orderedIds ?? []);
    }
};
exports.SpaceStatusesController = SpaceStatusesController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Param)('spaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SpaceStatusesController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Param)('spaceId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], SpaceStatusesController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':statusId'),
    __param(0, (0, common_1.Param)('spaceId')),
    __param(1, (0, common_1.Param)('statusId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], SpaceStatusesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':statusId'),
    __param(0, (0, common_1.Param)('spaceId')),
    __param(1, (0, common_1.Param)('statusId')),
    __param(2, (0, common_1.Query)('reassignToStatusId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], SpaceStatusesController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('reorder'),
    __param(0, (0, common_1.Param)('spaceId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], SpaceStatusesController.prototype, "reorder", null);
exports.SpaceStatusesController = SpaceStatusesController = __decorate([
    (0, swagger_1.ApiTags)('space-statuses'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('spaces/:spaceId/statuses'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, resource_member_guard_1.ResourceMemberGuard),
    __metadata("design:paramtypes", [scoped_statuses_service_1.ScopedStatusesService])
], SpaceStatusesController);
let ProjectStatusesController = class ProjectStatusesController {
    constructor(statuses) {
        this.statuses = statuses;
    }
    list(projectId) {
        return this.statuses.list('project', projectId);
    }
    create(projectId, body) {
        return this.statuses.create('project', projectId, body);
    }
    update(projectId, statusId, body) {
        return this.statuses.update('project', projectId, statusId, body);
    }
    remove(projectId, statusId, reassignToStatusId) {
        return this.statuses.remove('project', projectId, statusId, reassignToStatusId ?? null);
    }
    reorder(projectId, body) {
        return this.statuses.reorder('project', projectId, body.orderedIds ?? []);
    }
};
exports.ProjectStatusesController = ProjectStatusesController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Param)('projectId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ProjectStatusesController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Param)('projectId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ProjectStatusesController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':statusId'),
    __param(0, (0, common_1.Param)('projectId')),
    __param(1, (0, common_1.Param)('statusId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], ProjectStatusesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':statusId'),
    __param(0, (0, common_1.Param)('projectId')),
    __param(1, (0, common_1.Param)('statusId')),
    __param(2, (0, common_1.Query)('reassignToStatusId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], ProjectStatusesController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('reorder'),
    __param(0, (0, common_1.Param)('projectId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ProjectStatusesController.prototype, "reorder", null);
exports.ProjectStatusesController = ProjectStatusesController = __decorate([
    (0, swagger_1.ApiTags)('project-statuses'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('projects/:projectId/statuses'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, resource_member_guard_1.ResourceMemberGuard),
    __metadata("design:paramtypes", [scoped_statuses_service_1.ScopedStatusesService])
], ProjectStatusesController);
//# sourceMappingURL=scoped-statuses.controller.js.map