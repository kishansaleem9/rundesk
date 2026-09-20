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
exports.MeetingsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const meetings_service_1 = require("./meetings.service");
/**
 * Meeting records. Membership is checked in the service on every route — the
 * collection hangs off a workspace, but a meeting is also reachable by its own
 * id, so no single guard covers both shapes.
 */
let MeetingsController = class MeetingsController {
    constructor(meetings) {
        this.meetings = meetings;
    }
    list(workspaceId, user, taskId, tag) {
        return this.meetings.list(workspaceId, user.id, { taskId, tag });
    }
    create(workspaceId, user, body) {
        return this.meetings.create(workspaceId, user.id, body);
    }
    ask(workspaceId, user, body) {
        return this.meetings.ask(workspaceId, user.id, body?.question ?? '');
    }
    upcoming(workspaceId, user) {
        return this.meetings.upcoming(workspaceId, user.id);
    }
    get(workspaceId, meetingId, user) {
        return this.meetings.get(workspaceId, meetingId, user.id);
    }
    update(workspaceId, meetingId, user, body) {
        return this.meetings.update(workspaceId, meetingId, user.id, body);
    }
    remove(workspaceId, meetingId, user) {
        return this.meetings.remove(workspaceId, meetingId, user.id);
    }
    addAttendee(workspaceId, meetingId, user, body) {
        return this.meetings.addAttendee(workspaceId, meetingId, user.id, body);
    }
    removeAttendee(workspaceId, meetingId, attendeeId, user) {
        return this.meetings.removeAttendee(workspaceId, meetingId, attendeeId, user.id);
    }
    shared(workspaceId, otherUserId, user) {
        return this.meetings.sharedWith(workspaceId, otherUserId, user.id);
    }
    actionItems(workspaceId, meetingId, user, body) {
        return this.meetings.extractActionItems(workspaceId, meetingId, user.id, { createIn: body?.createIn });
    }
};
exports.MeetingsController = MeetingsController;
__decorate([
    (0, common_1.Get)('workspaces/:workspaceId/meetings'),
    (0, swagger_1.ApiOperation)({ summary: 'Meetings in a workspace, newest first' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('taskId')),
    __param(3, (0, common_1.Query)('tag')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, String]),
    __metadata("design:returntype", void 0)
], MeetingsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('workspaces/:workspaceId/meetings'),
    (0, swagger_1.ApiOperation)({ summary: 'Record a meeting' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], MeetingsController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('workspaces/:workspaceId/meetings/ask'),
    (0, swagger_1.ApiOperation)({ summary: '§2.8 — ask about your meetings, answered from their records' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], MeetingsController.prototype, "ask", null);
__decorate([
    (0, common_1.Get)('workspaces/:workspaceId/meetings/upcoming'),
    (0, swagger_1.ApiOperation)({ summary: '§2.8 — meetings still to come, soonest first' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], MeetingsController.prototype, "upcoming", null);
__decorate([
    (0, common_1.Get)('workspaces/:workspaceId/meetings/:meetingId'),
    (0, swagger_1.ApiOperation)({ summary: 'One meeting with its attendees' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('meetingId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], MeetingsController.prototype, "get", null);
__decorate([
    (0, common_1.Patch)('workspaces/:workspaceId/meetings/:meetingId'),
    (0, swagger_1.ApiOperation)({ summary: 'Update notes, transcript, recording or timing' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('meetingId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], MeetingsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)('workspaces/:workspaceId/meetings/:meetingId'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a meeting record' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('meetingId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], MeetingsController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('workspaces/:workspaceId/meetings/:meetingId/attendees'),
    (0, swagger_1.ApiOperation)({ summary: 'Add an attendee — a member by id, or an outsider by email' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('meetingId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], MeetingsController.prototype, "addAttendee", null);
__decorate([
    (0, common_1.Delete)('workspaces/:workspaceId/meetings/:meetingId/attendees/:attendeeId'),
    (0, swagger_1.ApiOperation)({ summary: 'Remove an attendee' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('meetingId')),
    __param(2, (0, common_1.Param)('attendeeId')),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", void 0)
], MeetingsController.prototype, "removeAttendee", null);
__decorate([
    (0, common_1.Get)('workspaces/:workspaceId/people/:userId/shared'),
    (0, swagger_1.ApiOperation)({ summary: 'Meetings and open tasks two people share — the DM Calendar and Tasks tabs' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('userId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], MeetingsController.prototype, "shared", null);
__decorate([
    (0, common_1.Post)('workspaces/:workspaceId/meetings/:meetingId/action-items'),
    (0, swagger_1.ApiOperation)({ summary: "Extract action items from this meeting's notes, optionally creating them as tasks" }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('meetingId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], MeetingsController.prototype, "actionItems", null);
exports.MeetingsController = MeetingsController = __decorate([
    (0, swagger_1.ApiTags)('meetings'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [meetings_service_1.MeetingsService])
], MeetingsController);
//# sourceMappingURL=meetings.controller.js.map