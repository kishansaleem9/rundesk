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
exports.LabelsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const resource_member_guard_1 = require("../auth/guards/resource-member.guard");
const labels_service_1 = require("./labels.service");
const label_dto_1 = require("./dto/label.dto");
let LabelsController = class LabelsController {
    constructor(labels) {
        this.labels = labels;
    }
    list(workspaceId) {
        return this.labels.list(workspaceId);
    }
    create(workspaceId, body) {
        return this.labels.create(workspaceId, body);
    }
    update(labelId, body) {
        return this.labels.update(labelId, body);
    }
    remove(labelId) {
        return this.labels.delete(labelId);
    }
};
exports.LabelsController = LabelsController;
__decorate([
    (0, common_1.Get)('workspaces/:workspaceId/labels'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], LabelsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('workspaces/:workspaceId/labels'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, label_dto_1.CreateLabelDto]),
    __metadata("design:returntype", void 0)
], LabelsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)('labels/:labelId'),
    __param(0, (0, common_1.Param)('labelId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], LabelsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)('labels/:labelId'),
    __param(0, (0, common_1.Param)('labelId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], LabelsController.prototype, "remove", null);
exports.LabelsController = LabelsController = __decorate([
    (0, swagger_1.ApiTags)('labels'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, resource_member_guard_1.ResourceMemberGuard),
    __metadata("design:paramtypes", [labels_service_1.LabelsService])
], LabelsController);
//# sourceMappingURL=labels.controller.js.map