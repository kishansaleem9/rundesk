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
exports.PrioritiesController = exports.PeopleController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const people_service_1 = require("./people.service");
/**
 * §G06 [05:35–06:35] — the person profile panel.
 *
 * Everything here is workspace-scoped and reads about one member. The panel
 * opens over whatever page you were on, so the profile itself is one request:
 * six round trips is six chances to render half a card.
 */
let PeopleController = class PeopleController {
    constructor(people) {
        this.people = people;
    }
    profile(workspaceId, userId, user) {
        return this.people.getProfile(workspaceId, user.id, userId);
    }
    /** §G06 [06:00] — activity by ACTOR, which nothing could query before. */
    activity(workspaceId, userId, user, q, limit) {
        return this.people.getActivity(workspaceId, user.id, userId, {
            q,
            limit: limit ? Number(limit) : undefined,
        });
    }
    /**
     * §G05 [05:40] — "✦ Get StandUp": what this person has been doing.
     *
     * POST rather than GET because it may call a model, which costs money and
     * must not be issued by a cache warming a link or a browser prefetching one.
     * It reads nothing it does not own and writes nothing, so it is safe to
     * repeat — but "safe to repeat" and "free to repeat" are different claims.
     *
     * Always answers. With no model configured it returns the deterministic
     * summary, which is a real answer rather than a 503 — the same rule the daily
     * briefing follows, and the reason this can be tested on a box with no key.
     */
    standup(workspaceId, userId, user, body) {
        return this.people.generateStandup(workspaceId, user.id, userId, { days: body?.days });
    }
    /** §G06 [06:22] — their dated tasks and the meetings they are in. */
    calendar(workspaceId, userId, user, from, to) {
        return this.people.getCalendar(workspaceId, user.id, userId, { from, to });
    }
    /**
     * §G06 [05:54] — their priorities.
     *
     * Readable by any colleague — "what are you actually doing today" is what a
     * teammate opens a profile to find out. The writes below are the owner's
     * only: a decision somebody else can edit is not a decision.
     */
    priorities(workspaceId, userId, user) {
        return this.people.listPriorities(workspaceId, user.id, userId);
    }
};
exports.PeopleController = PeopleController;
__decorate([
    (0, common_1.Get)(':userId'),
    (0, swagger_1.ApiOperation)({ summary: 'Who this person is: identity, teams, reporting line, open work' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('userId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], PeopleController.prototype, "profile", null);
__decorate([
    (0, common_1.Get)(':userId/activity'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('userId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Query)('q')),
    __param(4, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, String, String]),
    __metadata("design:returntype", void 0)
], PeopleController.prototype, "activity", null);
__decorate([
    (0, common_1.Post)(':userId/standup'),
    (0, swagger_1.ApiOperation)({ summary: 'Summarise what this person has been working on (§G05 [05:40])' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('userId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], PeopleController.prototype, "standup", null);
__decorate([
    (0, common_1.Get)(':userId/calendar'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('userId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Query)('from')),
    __param(4, (0, common_1.Query)('to')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, String, String]),
    __metadata("design:returntype", void 0)
], PeopleController.prototype, "calendar", null);
__decorate([
    (0, common_1.Get)(':userId/priorities'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('userId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], PeopleController.prototype, "priorities", null);
exports.PeopleController = PeopleController = __decorate([
    (0, swagger_1.ApiTags)('people'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('workspaces/:workspaceId/people'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard),
    __metadata("design:paramtypes", [people_service_1.PeopleService])
], PeopleController);
/**
 * The caller's own priorities. A separate controller because these are writes
 * about yourself and take no `:userId` — routing them under `/people/:userId`
 * would invite a client to pass somebody else's id and expect it to work.
 */
let PrioritiesController = class PrioritiesController {
    constructor(people) {
        this.people = people;
    }
    list(workspaceId, user) {
        return this.people.listPriorities(workspaceId, user.id, user.id);
    }
    add(workspaceId, user, body) {
        return this.people.addPriority(workspaceId, user.id, body ?? {});
    }
    setDone(priorityId, user, body) {
        return this.people.setPriorityDone(priorityId, user.id, body?.done !== false);
    }
    remove(priorityId, user) {
        return this.people.removePriority(priorityId, user.id);
    }
    /** The whole order in one call — a drag produces one order, not N moves. */
    reorder(workspaceId, user, body) {
        return this.people.reorderPriorities(workspaceId, user.id, body?.ids ?? []);
    }
};
exports.PrioritiesController = PrioritiesController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PrioritiesController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Add a task, or a typed line, to today’s priorities' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], PrioritiesController.prototype, "add", null);
__decorate([
    (0, common_1.Patch)(':priorityId'),
    __param(0, (0, common_1.Param)('priorityId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], PrioritiesController.prototype, "setDone", null);
__decorate([
    (0, common_1.Delete)(':priorityId'),
    __param(0, (0, common_1.Param)('priorityId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PrioritiesController.prototype, "remove", null);
__decorate([
    (0, common_1.Put)('order'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], PrioritiesController.prototype, "reorder", null);
exports.PrioritiesController = PrioritiesController = __decorate([
    (0, swagger_1.ApiTags)('people'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('workspaces/:workspaceId/priorities'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard),
    __metadata("design:paramtypes", [people_service_1.PeopleService])
], PrioritiesController);
//# sourceMappingURL=people.controller.js.map