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
exports.ViewsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const resource_member_guard_1 = require("../auth/guards/resource-member.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const views_service_1 = require("./views.service");
const list_filters_service_1 = require("./list-filters.service");
/**
 * §V2-07 — saved views.
 *
 * `ResourceMemberGuard` says you are a member of the workspace this view's list
 * belongs to. That was the ONLY check here until now, which meant any member
 * could rename, re-default or delete any view on any list they could open,
 * including someone else's. The second check — who may see it, who may change
 * it — is in the service, because it needs the row.
 */
let ViewsController = class ViewsController {
    constructor(views, filters) {
        this.views = views;
        this.filters = filters;
    }
    list(listId, user) {
        return this.views.listByList(listId, { id: user.id, role: user.role });
    }
    /** "Copy link to view" lands here — one view, by id, or a 404. */
    getOne(viewId, user) {
        return this.views.getOne(viewId, { id: user.id, role: user.role });
    }
    create(listId, user, body) {
        return this.views.create({
            listId,
            name: body.name,
            type: body.type,
            config: body.config,
            visibility: body.visibility,
            createdById: user.id,
        });
    }
    update(viewId, user, body) {
        return this.views.update(viewId, body, { id: user.id, role: user.role });
    }
    /** "Autosave for me" — your own flag on someone else's view is still yours. */
    autosave(viewId, user, body) {
        return this.views.setAutosave(viewId, { id: user.id, role: user.role }, body.autosave === true);
    }
    remove(viewId, user) {
        return this.views.delete(viewId, { id: user.id, role: user.role });
    }
    // ── §V2-07 "Saved filters", frame 11:41 ───────────────────────────────────
    //
    // On the views controller because they are the other half of the same panel
    // and share its guard: `ResourceMemberGuard` resolves `:listId` to a
    // workspace, so a member of one workspace cannot read another's presets.
    listFilters(listId, user) {
        return this.filters.list(listId, user.id);
    }
    saveFilter(listId, user, body) {
        return this.filters.save(listId, user.id, body.name, body.rules);
    }
    deleteFilter(filterId, user) {
        return this.filters.remove(filterId, user.id);
    }
};
exports.ViewsController = ViewsController;
__decorate([
    (0, common_1.Get)('lists/:listId/views'),
    __param(0, (0, common_1.Param)('listId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ViewsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('views/:viewId'),
    __param(0, (0, common_1.Param)('viewId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ViewsController.prototype, "getOne", null);
__decorate([
    (0, common_1.Post)('lists/:listId/views'),
    __param(0, (0, common_1.Param)('listId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ViewsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)('views/:viewId'),
    __param(0, (0, common_1.Param)('viewId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ViewsController.prototype, "update", null);
__decorate([
    (0, common_1.Patch)('views/:viewId/autosave'),
    __param(0, (0, common_1.Param)('viewId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ViewsController.prototype, "autosave", null);
__decorate([
    (0, common_1.Delete)('views/:viewId'),
    __param(0, (0, common_1.Param)('viewId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ViewsController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)('lists/:listId/filters'),
    __param(0, (0, common_1.Param)('listId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ViewsController.prototype, "listFilters", null);
__decorate([
    (0, common_1.Post)('lists/:listId/filters'),
    __param(0, (0, common_1.Param)('listId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ViewsController.prototype, "saveFilter", null);
__decorate([
    (0, common_1.Delete)('lists/:listId/filters/:filterId'),
    __param(0, (0, common_1.Param)('filterId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ViewsController.prototype, "deleteFilter", null);
exports.ViewsController = ViewsController = __decorate([
    (0, swagger_1.ApiTags)('views'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, resource_member_guard_1.ResourceMemberGuard),
    __metadata("design:paramtypes", [views_service_1.ViewsService, list_filters_service_1.ListFiltersService])
], ViewsController);
//# sourceMappingURL=views.controller.js.map