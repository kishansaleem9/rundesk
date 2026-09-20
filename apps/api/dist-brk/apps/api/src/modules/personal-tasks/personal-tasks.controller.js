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
exports.PersonalTasksController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const personal_tasks_service_1 = require("./personal-tasks.service");
let PersonalTasksController = class PersonalTasksController {
    constructor(svc) {
        this.svc = svc;
    }
    list(workspaceId, user) {
        return this.svc.list(workspaceId, user.id);
    }
    create(workspaceId, user, body) {
        return this.svc.create(workspaceId, user.id, body.title);
    }
    // Owner-scoped (the service checks the row belongs to the caller).
    update(id, user, body) {
        return this.svc.update(id, user.id, body);
    }
    remove(id, user) {
        return this.svc.remove(id, user.id);
    }
};
exports.PersonalTasksController = PersonalTasksController;
__decorate([
    (0, common_1.Get)('workspaces/:workspaceId/personal-tasks'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PersonalTasksController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('workspaces/:workspaceId/personal-tasks'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], PersonalTasksController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)('personal-tasks/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], PersonalTasksController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)('personal-tasks/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PersonalTasksController.prototype, "remove", null);
exports.PersonalTasksController = PersonalTasksController = __decorate([
    (0, swagger_1.ApiTags)('personal-tasks'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [personal_tasks_service_1.PersonalTasksService])
], PersonalTasksController);
//# sourceMappingURL=personal-tasks.controller.js.map