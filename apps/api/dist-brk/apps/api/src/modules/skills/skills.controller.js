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
exports.SkillsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const skills_service_1 = require("./skills.service");
const skill_dto_1 = require("./dto/skill.dto");
/**
 * §15 Skills.
 *
 * Every route carries `:workspaceId` and `WorkspaceMemberGuard`, including the
 * ones addressing a single skill by id. Hanging the detail routes off a bare
 * `/skills/:id` would have been shorter and would have skipped the membership
 * check entirely — the service's own visibility filter would then be the only
 * thing standing between a stranger and a workspace's skills, which is one
 * mistake away from nothing at all.
 */
let SkillsController = class SkillsController {
    constructor(svc) {
        this.svc = svc;
    }
    templates() {
        return this.svc.templates();
    }
    list(workspaceId, user, tab) {
        const requested = tab === 'enabled' || tab === 'mine' ? tab : 'all';
        return this.svc.list(workspaceId, user.id, requested);
    }
    counts(workspaceId, user) {
        return this.svc.counts(workspaceId, user.id);
    }
    create(workspaceId, user, body) {
        return this.svc.create(workspaceId, user.id, body);
    }
    createFromProposal(workspaceId, user, body) {
        return this.svc.createFromProposal(workspaceId, user.id, body);
    }
    discover(workspaceId, user) {
        return this.svc.discover(workspaceId, user.id);
    }
    installed(workspaceId, user) {
        return this.svc.installedIds(workspaceId, user.id);
    }
    install(workspaceId, id, user) {
        return this.svc.install(workspaceId, user.id, id);
    }
    uninstall(workspaceId, id, user) {
        return this.svc.uninstall(workspaceId, user.id, id);
    }
    get(workspaceId, id, user) {
        return this.svc.get(workspaceId, user.id, id);
    }
    update(workspaceId, id, user, body) {
        return this.svc.update(workspaceId, user.id, id, body);
    }
    remove(workspaceId, id, user) {
        return this.svc.remove(workspaceId, user.id, id);
    }
    // ─── Memory ───────────────────────────────────────────────────────────────
    listMemories(workspaceId, id, user) {
        return this.svc.listMemories(workspaceId, user.id, id);
    }
    addMemory(workspaceId, id, user, body) {
        return this.svc.addMemory(workspaceId, user.id, id, body);
    }
    removeMemory(workspaceId, id, memoryId, user) {
        return this.svc.removeMemory(workspaceId, user.id, id, memoryId);
    }
    // ─── Connections ──────────────────────────────────────────────────────────
    listConnections(workspaceId, id, user) {
        return this.svc.listConnections(workspaceId, user.id, id);
    }
    addConnection(workspaceId, id, user, body) {
        return this.svc.addConnection(workspaceId, user.id, id, body);
    }
    removeConnection(workspaceId, id, connectionRowId, user) {
        return this.svc.removeConnection(workspaceId, user.id, id, connectionRowId);
    }
};
exports.SkillsController = SkillsController;
__decorate([
    (0, common_1.Get)('templates'),
    (0, swagger_1.ApiOperation)({ summary: 'Starter skill templates for the hub carousel' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SkillsController.prototype, "templates", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List skills visible to the caller (tab: all | enabled | mine)' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('tab')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", void 0)
], SkillsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('counts'),
    (0, swagger_1.ApiOperation)({ summary: 'Skill counts per library tab' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], SkillsController.prototype, "counts", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a skill, optionally seeded from a template' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, skill_dto_1.CreateSkillDto]),
    __metadata("design:returntype", void 0)
], SkillsController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('from-proposal'),
    (0, swagger_1.ApiOperation)({ summary: "§15 — approve a drafted skill: \"Approve this approach and I'll create it\"" }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, skill_dto_1.ApproveSkillProposalDto]),
    __metadata("design:returntype", void 0)
], SkillsController.prototype, "createFromProposal", null);
__decorate([
    (0, common_1.Get)('discover'),
    (0, swagger_1.ApiOperation)({ summary: '§15 — "Discover skills created across your workspace"' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], SkillsController.prototype, "discover", null);
__decorate([
    (0, common_1.Get)('installed'),
    (0, swagger_1.ApiOperation)({ summary: '§15 — ids of the skills the caller has installed' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], SkillsController.prototype, "installed", null);
__decorate([
    (0, common_1.Post)(':id/install'),
    (0, swagger_1.ApiOperation)({ summary: "§15 — the hub's install: needs only the right to see it" }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], SkillsController.prototype, "install", null);
__decorate([
    (0, common_1.Delete)(':id/install'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], SkillsController.prototype, "uninstall", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], SkillsController.prototype, "get", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, skill_dto_1.UpdateSkillDto]),
    __metadata("design:returntype", void 0)
], SkillsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], SkillsController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)(':id/memories'),
    (0, swagger_1.ApiOperation)({ summary: "What the skill has been told — [18:42] 'yeh MEMORY hai'" }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], SkillsController.prototype, "listMemories", null);
__decorate([
    (0, common_1.Post)(':id/memories'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, skill_dto_1.AddSkillMemoryDto]),
    __metadata("design:returntype", void 0)
], SkillsController.prototype, "addMemory", null);
__decorate([
    (0, common_1.Delete)(':id/memories/:memoryId'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('memoryId')),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", void 0)
], SkillsController.prototype, "removeMemory", null);
__decorate([
    (0, common_1.Get)(':id/connections'),
    (0, swagger_1.ApiOperation)({ summary: 'Systems this skill may draw on — [18:58]' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], SkillsController.prototype, "listConnections", null);
__decorate([
    (0, common_1.Post)(':id/connections'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, skill_dto_1.AddSkillConnectionDto]),
    __metadata("design:returntype", void 0)
], SkillsController.prototype, "addConnection", null);
__decorate([
    (0, common_1.Delete)(':id/connections/:connectionRowId'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('connectionRowId')),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", void 0)
], SkillsController.prototype, "removeConnection", null);
exports.SkillsController = SkillsController = __decorate([
    (0, swagger_1.ApiTags)('skills'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('workspaces/:workspaceId/skills'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard),
    __metadata("design:paramtypes", [skills_service_1.SkillsService])
], SkillsController);
//# sourceMappingURL=skills.controller.js.map