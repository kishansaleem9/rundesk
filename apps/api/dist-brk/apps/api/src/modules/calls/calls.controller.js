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
exports.CallsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const uuid_1 = require("../../common/validation/uuid");
const calls_service_1 = require("./calls.service");
/**
 * §2.8 SyncUp — the call's lifecycle.
 *
 * Signalling does NOT go through here: offers, answers and ICE candidates are
 * relayed by the realtime gateway, because they are per-peer and constant.
 * This is the part that has to be true for everyone — who is in, and whether
 * it is being recorded.
 */
let CallsController = class CallsController {
    constructor(svc) {
        this.svc = svc;
    }
    live(_workspaceId, channelId, user) {
        if (!channelId)
            return null;
        /*
         * Absent means "no channel, so no call" — but PRESENT AND MALFORMED is a
         * different thing, and `!channelId` never caught it: the string "null" is
         * truthy, so a client that interpolated a missing id into the query string
         * sailed past this line and had its `where channel_id = 'null'` refused by
         * Postgres. The caller was fixed too (see call-host.tsx), but a request
         * that cannot be answered should say so here rather than in the database.
         */
        if (!(0, uuid_1.isUuid)(channelId))
            throw new common_1.BadRequestException('Malformed channelId');
        return this.svc.liveInChannel(channelId, user.id);
    }
    // The one POST here that can genuinely create something, so the one that
    // keeps 201. Every other route below acts on a call that already exists, and
    // 201 there claims a resource was created at a URI it never returns.
    start(workspaceId, user, body) {
        return this.svc.start(workspaceId, user.id, body ?? {});
    }
    join(callId, user) {
        return this.svc.join(callId, user.id);
    }
    leave(callId, user) {
        return this.svc.leave(callId, user.id);
    }
    end(callId, user) {
        return this.svc.end(callId, user.id);
    }
    recording(callId, user, body) {
        return this.svc.setRecording(callId, user.id, body?.recording === true);
    }
    /**
     * §2.8 gap 10 — the transcript, as it is being said.
     *
     * Over HTTP rather than the socket, unlike signalling: a line of speech is
     * something that must be KEPT, and a fire-and-forget socket emit gives the
     * client no way to know whether it landed. It is also the surface that
     * refuses to record while the banner is down, which is not a decision to make
     * on a channel with no reply.
     */
    transcript(callId, user, body) {
        return this.svc.appendTranscript(callId, user.id, body?.text ?? '', body?.replacesPrevious === true);
    }
    readTranscript(callId, user) {
        return this.svc.liveTranscript(callId, user.id);
    }
    recordingUploadUrl(callId, user, body) {
        return this.svc.recordingUploadUrl(callId, user.id, body?.contentType ?? 'audio/webm');
    }
    attachRecording(callId, user, body) {
        return this.svc.attachRecording(callId, user.id, body?.storageKey ?? '');
    }
};
exports.CallsController = CallsController;
__decorate([
    (0, common_1.Get)('live'),
    (0, swagger_1.ApiOperation)({ summary: 'The live call in a channel, if there is one' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Query)('channelId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], CallsController.prototype, "live", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Start a call — or join the one already running here' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], CallsController.prototype, "start", null);
__decorate([
    (0, common_1.Post)(':callId/join'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('callId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], CallsController.prototype, "join", null);
__decorate([
    (0, common_1.Post)(':callId/leave'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('callId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], CallsController.prototype, "leave", null);
__decorate([
    (0, common_1.Post)(':callId/end'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('callId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], CallsController.prototype, "end", null);
__decorate([
    (0, common_1.Post)(':callId/recording'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '§2.8 — start/stop recording; everyone in the call is told in the same breath',
    }),
    __param(0, (0, common_1.Param)('callId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], CallsController.prototype, "recording", null);
__decorate([
    (0, common_1.Post)(':callId/transcript'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '§2.8 — append one line of what was said (only while recording)' }),
    __param(0, (0, common_1.Param)('callId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], CallsController.prototype, "transcript", null);
__decorate([
    (0, common_1.Get)(':callId/transcript'),
    (0, swagger_1.ApiOperation)({ summary: '§2.8 — the call so far, attributed' }),
    __param(0, (0, common_1.Param)('callId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], CallsController.prototype, "readTranscript", null);
__decorate([
    (0, common_1.Post)(':callId/recording/upload-url'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '§2.8 — where to PUT the recording; the media never passes through here' }),
    __param(0, (0, common_1.Param)('callId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], CallsController.prototype, "recordingUploadUrl", null);
__decorate([
    (0, common_1.Post)(':callId/recording/attach'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '§2.8 — the upload finished; remember where it landed' }),
    __param(0, (0, common_1.Param)('callId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], CallsController.prototype, "attachRecording", null);
exports.CallsController = CallsController = __decorate([
    (0, swagger_1.ApiTags)('calls'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('workspaces/:workspaceId/calls'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard),
    __metadata("design:paramtypes", [calls_service_1.CallsService])
], CallsController);
//# sourceMappingURL=calls.controller.js.map