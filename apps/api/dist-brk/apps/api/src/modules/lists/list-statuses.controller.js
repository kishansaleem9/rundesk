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
exports.ListStatusesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const resource_member_guard_1 = require("../auth/guards/resource-member.guard");
const list_statuses_service_1 = require("./list-statuses.service");
let ListStatusesController = class ListStatusesController {
    constructor(statuses) {
        this.statuses = statuses;
    }
    list(listId) {
        return this.statuses.list(listId);
    }
    create(listId, body) {
        return this.statuses.create(listId, body);
    }
    update(listId, statusId, body) {
        return this.statuses.update(listId, statusId, body);
    }
    remove(listId, statusId, reassignToStatusId) {
        return this.statuses.remove(listId, statusId, reassignToStatusId ?? null);
    }
    reorder(listId, body) {
        return this.statuses.reorder(listId, body.orderedIds ?? []);
    }
};
exports.ListStatusesController = ListStatusesController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Param)('listId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ListStatusesController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Param)('listId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ListStatusesController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':statusId'),
    __param(0, (0, common_1.Param)('listId')),
    __param(1, (0, common_1.Param)('statusId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], ListStatusesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':statusId'),
    __param(0, (0, common_1.Param)('listId')),
    __param(1, (0, common_1.Param)('statusId')),
    __param(2, (0, common_1.Query)('reassignToStatusId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], ListStatusesController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('reorder'),
    __param(0, (0, common_1.Param)('listId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ListStatusesController.prototype, "reorder", null);
exports.ListStatusesController = ListStatusesController = __decorate([
    (0, swagger_1.ApiTags)('list-statuses'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('lists/:listId/statuses'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, resource_member_guard_1.ResourceMemberGuard),
    __metadata("design:paramtypes", [list_statuses_service_1.ListStatusesService])
], ListStatusesController);
//# sourceMappingURL=list-statuses.controller.js.map