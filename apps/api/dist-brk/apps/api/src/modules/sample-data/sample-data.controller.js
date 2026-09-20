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
exports.SampleDataController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_admin_guard_1 = require("../auth/guards/workspace-admin.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const sample_data_service_1 = require("./sample-data.service");
/**
 * One-shot endpoint that loads a realistic demo workspace.
 * Admin-only and idempotent-by-refusal: see SampleDataService.seed.
 */
let SampleDataController = class SampleDataController {
    constructor(sampleData) {
        this.sampleData = sampleData;
    }
    async seed(workspaceId, user) {
        const summary = await this.sampleData.seed(workspaceId, { id: user.id, email: user.email });
        return { ok: true, summary };
    }
};
exports.SampleDataController = SampleDataController;
__decorate([
    (0, common_1.Post)('seed'),
    (0, swagger_1.ApiOperation)({
        summary: 'Seed a demo workspace (only if empty)',
        description: 'Creates 3 spaces, 6 projects, 24 lists with default custom statuses, a curated set of tasks with subtasks, checklists, labels and assignees, plus a handful of docs and goals. Rejects with 409 if the workspace already has any spaces.',
    }),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], SampleDataController.prototype, "seed", null);
exports.SampleDataController = SampleDataController = __decorate([
    (0, swagger_1.ApiTags)('sample-data'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_admin_guard_1.WorkspaceAdminGuard),
    (0, common_1.Controller)('workspaces/:workspaceId/sample-data'),
    __metadata("design:paramtypes", [sample_data_service_1.SampleDataService])
], SampleDataController);
//# sourceMappingURL=sample-data.controller.js.map