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
exports.TimeOffController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const database_module_1 = require("../../common/database/database.module");
const container_access_guard_helper_1 = require("../../common/permissions/container-access.guard-helper");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const time_off_service_1 = require("./time-off.service");
let TimeOffController = class TimeOffController {
    constructor(timeOff, db) {
        this.timeOff = timeOff;
        this.db = db;
    }
    list(workspaceId, from, to) {
        return this.timeOff.list(workspaceId, { from, to });
    }
    async create(workspaceId, user, body) {
        return this.timeOff.create(workspaceId, await this.actor(workspaceId, user.id), body);
    }
    async remove(workspaceId, entryId, user) {
        return this.timeOff.remove(workspaceId, entryId, await this.actor(workspaceId, user.id));
    }
    async actor(workspaceId, userId) {
        return { id: userId, isManager: await (0, container_access_guard_helper_1.isWorkspaceManager)(this.db, workspaceId, userId) };
    }
};
exports.TimeOffController = TimeOffController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Time off overlapping a date range (§A4.10)' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Query)('from')),
    __param(2, (0, common_1.Query)('to')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], TimeOffController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Record time off for yourself, or for anyone if you manage the workspace' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], TimeOffController.prototype, "create", null);
__decorate([
    (0, common_1.Delete)(':entryId'),
    (0, swagger_1.ApiOperation)({ summary: 'Remove a time off entry' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('entryId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], TimeOffController.prototype, "remove", null);
exports.TimeOffController = TimeOffController = __decorate([
    (0, swagger_1.ApiTags)('time-off'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('workspaces/:workspaceId/time-off'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard),
    __param(1, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [time_off_service_1.TimeOffService, Object])
], TimeOffController);
//# sourceMappingURL=time-off.controller.js.map