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
exports.TaskMeetingsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const resource_member_guard_1 = require("../auth/guards/resource-member.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const tasks_service_1 = require("./tasks.service");
const meeting_dto_1 = require("./dto/meeting.dto");
/**
 * Task → meeting creation (Plan §12.9 Zoom / Google Meet).
 *
 * `POST /tasks/:taskId/meeting {provider}` creates a real meeting when the
 * provider is connected (Zoom via its own OAuth connection, Google Meet by
 * reusing the Google Calendar connection) and stores the join URL as a
 * `task_external_links` row with `kind:'meeting'`. When the provider isn't
 * connected the service returns a clean "connect {provider} first" 400.
 *
 * `POST /tasks/:taskId/meeting/:linkId/recording {url}` attaches a recording
 * link to a meeting after the fact. Access is enforced like the other nested
 * task writes (ResourceMemberGuard on :taskId + the service's write check).
 */
let TaskMeetingsController = class TaskMeetingsController {
    constructor(tasks) {
        this.tasks = tasks;
    }
    create(taskId, user, body) {
        return this.tasks.createTaskMeeting(taskId, user.id, body.provider);
    }
    attachRecording(taskId, linkId, user, body) {
        return this.tasks.attachMeetingRecording(taskId, linkId, user.id, body.url);
    }
};
exports.TaskMeetingsController = TaskMeetingsController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, meeting_dto_1.CreateMeetingDto]),
    __metadata("design:returntype", void 0)
], TaskMeetingsController.prototype, "create", null);
__decorate([
    (0, common_1.Post)(':linkId/recording'),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, common_1.Param)('linkId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, meeting_dto_1.AttachRecordingDto]),
    __metadata("design:returntype", void 0)
], TaskMeetingsController.prototype, "attachRecording", null);
exports.TaskMeetingsController = TaskMeetingsController = __decorate([
    (0, swagger_1.ApiTags)('tasks'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('tasks/:taskId/meeting'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, resource_member_guard_1.ResourceMemberGuard),
    __metadata("design:paramtypes", [tasks_service_1.TasksService])
], TaskMeetingsController);
//# sourceMappingURL=meetings.controller.js.map