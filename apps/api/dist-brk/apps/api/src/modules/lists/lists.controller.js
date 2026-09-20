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
exports.ListsController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const resource_member_guard_1 = require("../auth/guards/resource-member.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const lists_service_1 = require("./lists.service");
const scoped_statuses_service_1 = require("./scoped-statuses.service");
const VALID_SCOPES = new Set(['list', 'project', 'space']);
let ListsController = class ListsController {
    constructor(listsService, scopedStatuses) {
        this.listsService = listsService;
        this.scopedStatuses = scopedStatuses;
    }
    async setStatusScope(listId, body) {
        if (!body?.scope || !VALID_SCOPES.has(body.scope)) {
            throw new common_1.BadRequestException("scope must be one of 'list', 'project', 'space'");
        }
        return this.scopedStatuses.setListScope(listId, body.scope);
    }
    async getListsByProject(projectId, user) {
        return this.listsService.getListsByProject(projectId, { id: user.id, role: user.role });
    }
    /**
     * §G15-10 — the lists that live directly in a space.
     *
     * Declared BEFORE `:listId`, or Nest matches this path as a list whose id is
     * the word "space" and answers 404 for a route that exists.
     */
    /**
     * §V2-02 — the Planner's default-list picker needs the whole workspace.
     *
     * Declared BEFORE `@Get(':listId')`, or `/lists/workspace/<id>` arrives as a
     * list id and 404s — the same ordering trap `/spaces/presets` hit.
     */
    byWorkspace(workspaceId, user) {
        return this.listsService.getListsByWorkspace(workspaceId, { id: user.id, role: user.role });
    }
    async getListsBySpace(spaceId, user) {
        return this.listsService.getListsBySpace(spaceId, { id: user.id, role: user.role });
    }
    async getList(listId) {
        return this.listsService.getList(listId);
    }
    async createList(user, body) {
        // §G15 [22:07] — a list can be born private. Anything other than the two
        // known values is ignored rather than trusted into the enum column.
        const visibility = body.visibility === 'private' ? 'private' : 'public';
        /*
         * §G15-10 — "pehle space hoti hai. Iske baad LIST aati hai."
         *
         * A project still wins when one is given, so every existing caller behaves
         * exactly as before. With only a space, the space's hidden container is
         * resolved (or made) and the list goes there — which is what lets the
         * person stop after choosing a Space instead of inventing a Project first.
         */
        if (!body.projectId && !body.spaceId) {
            throw new common_1.BadRequestException('a list needs either a projectId or a spaceId');
        }
        const projectId = body.projectId ?? (await this.listsService.defaultContainerForSpace(body.spaceId, user.id));
        return this.listsService.createList(projectId, { name: body.name, description: body.description, visibility }, user.id);
    }
    async reorderLists(projectId, user, body) {
        return this.listsService.reorderLists(projectId, body.orderedIds ?? [], user.id);
    }
    async updateList(listId, user, body) {
        return this.listsService.updateList(listId, body, user.id);
    }
    /** Move a list into another project (its tasks follow). */
    async moveList(listId, user, ip, body) {
        return this.listsService.moveList(listId, body.projectId, user.id, ip);
    }
    async deleteList(listId, user, ip) {
        await this.listsService.deleteList(listId, user.id, ip);
        return { message: 'List archived successfully' };
    }
};
exports.ListsController = ListsController;
__decorate([
    (0, common_1.Patch)(':listId/status-scope'),
    __param(0, (0, common_1.Param)('listId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ListsController.prototype, "setStatusScope", null);
__decorate([
    (0, common_1.Get)('project/:projectId'),
    __param(0, (0, common_1.Param)('projectId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ListsController.prototype, "getListsByProject", null);
__decorate([
    (0, common_1.Get)('workspace/:workspaceId'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ListsController.prototype, "byWorkspace", null);
__decorate([
    (0, common_1.Get)('space/:spaceId'),
    __param(0, (0, common_1.Param)('spaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ListsController.prototype, "getListsBySpace", null);
__decorate([
    (0, common_1.Get)(':listId'),
    __param(0, (0, common_1.Param)('listId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ListsController.prototype, "getList", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ListsController.prototype, "createList", null);
__decorate([
    (0, common_1.Post)('project/:projectId/reorder'),
    __param(0, (0, common_1.Param)('projectId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], ListsController.prototype, "reorderLists", null);
__decorate([
    (0, common_1.Put)(':listId'),
    __param(0, (0, common_1.Param)('listId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], ListsController.prototype, "updateList", null);
__decorate([
    (0, common_1.Post)(':listId/move'),
    __param(0, (0, common_1.Param)('listId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Ip)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, Object]),
    __metadata("design:returntype", Promise)
], ListsController.prototype, "moveList", null);
__decorate([
    (0, common_1.Delete)(':listId'),
    __param(0, (0, common_1.Param)('listId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Ip)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", Promise)
], ListsController.prototype, "deleteList", null);
exports.ListsController = ListsController = __decorate([
    (0, common_1.Controller)('lists'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, resource_member_guard_1.ResourceMemberGuard),
    __metadata("design:paramtypes", [lists_service_1.ListsService,
        scoped_statuses_service_1.ScopedStatusesService])
], ListsController);
//# sourceMappingURL=lists.controller.js.map