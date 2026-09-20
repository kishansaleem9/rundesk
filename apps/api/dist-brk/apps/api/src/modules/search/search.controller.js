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
exports.SearchController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const resource_member_guard_1 = require("../auth/guards/resource-member.guard");
const feature_flag_guard_1 = require("../../common/guards/feature-flag.guard");
const feature_flag_decorator_1 = require("../../common/decorators/feature-flag.decorator");
const feature_flags_1 = require("@rundesk/feature-flags");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const search_service_1 = require("./search.service");
const entity_types_1 = require("./entity-types");
const STATUS_CATEGORIES = new Set(['open', 'in_progress', 'closed']);
const PRIORITIES = new Set(['urgent', 'high', 'normal', 'low']);
let SearchController = class SearchController {
    constructor(search) {
        this.search = search;
    }
    /**
     * §G03-6 — somebody opened a search result.
     *
     * Its own endpoint rather than a side effect of the search call: what makes
     * a thing trending is being OPENED, not being returned. Counting appearances
     * would rank whatever the index happens to match most often, which is a
     * measure of the query and not of anybody's interest.
     */
    async recordOpen(workspaceId, user, body) {
        return this.search.recordOpen(workspaceId, user.id, body?.entityType ?? '', body?.entityId ?? '');
    }
    /**
     * §G02-9 — the sources this workspace can search, and which are connected.
     *
     * Declared BEFORE `:workspaceId`, or Nest reads "sources" as a workspace id
     * and answers 404 for a route that exists.
     */
    async sources(workspaceId) {
        return this.search.listSources(workspaceId);
    }
    query(workspaceId, user, q, limit, types, statusCategory, priority, assigneeId, creatorId, includeArchived, labelId, taskTypeId, dueAfter, dueBefore, createdAfter, createdBefore, spaceId, folderId, listId, customFieldId, customFieldValue, sort) {
        const filters = {};
        if (types) {
            const parsed = types
                .split(',')
                .map((t) => t.trim())
                .filter((t) => entity_types_1.ENTITY_TYPES.includes(t));
            if (parsed.length > 0)
                filters.types = parsed;
        }
        if (statusCategory && STATUS_CATEGORIES.has(statusCategory)) {
            filters.statusCategory = statusCategory;
        }
        if (priority && PRIORITIES.has(priority)) {
            filters.priority = priority;
        }
        if (assigneeId)
            filters.assigneeId = assigneeId;
        if (creatorId)
            filters.creatorId = creatorId;
        if (includeArchived === 'true')
            filters.includeArchived = true;
        if (labelId)
            filters.labelId = labelId;
        // §1.1 — she filters search by type as well as choosing one at create time.
        if (taskTypeId)
            filters.taskTypeId = taskTypeId;
        /*
         * §G03-6 — the two engagement modes join the whitelist.
         *
         * Whitelisted rather than passed through, like every other filter here: an
         * unrecognised name has to be DROPPED, because a sort the service does not
         * know silently returns relevance and reads as "the control did nothing".
         */
        if (sort === 'updated' || sort === 'created' || sort === 'trending' || sort === 'trending_me') {
            filters.sort = sort;
        }
        const parseDate = (s) => {
            if (!s)
                return undefined;
            const d = new Date(s);
            return Number.isNaN(d.getTime()) ? undefined : d;
        };
        filters.dueAfter = parseDate(dueAfter);
        filters.dueBefore = parseDate(dueBefore);
        filters.createdAfter = parseDate(createdAfter);
        filters.createdBefore = parseDate(createdBefore);
        if (spaceId)
            filters.spaceId = spaceId;
        if (folderId)
            filters.folderId = folderId;
        if (listId)
            filters.listId = listId;
        // Custom-field value filter — only applied when both the field and a
        // non-empty value are supplied (Plan §11.2).
        if (customFieldId && customFieldValue != null && customFieldValue !== '') {
            filters.customFieldId = customFieldId;
            filters.customFieldValue = customFieldValue;
        }
        return this.search.search(workspaceId, user.id, q ?? '', limit ? Number(limit) : 10, filters);
    }
    customFields(workspaceId) {
        return this.search.listWorkspaceCustomFields(workspaceId);
    }
    reindex(workspaceId) {
        return this.search.reindexWorkspace(workspaceId);
    }
    listSaved(workspaceId, user) {
        return this.search.listSavedSearches(workspaceId, user.id);
    }
    createSaved(workspaceId, user, body) {
        return this.search.createSavedSearch(workspaceId, user.id, body.name, body.query ?? null, body.filters ?? {});
    }
    deleteSaved(id, user) {
        return this.search.deleteSavedSearch(id, user.id);
    }
};
exports.SearchController = SearchController;
__decorate([
    (0, common_1.Post)(':workspaceId/opened'),
    (0, common_1.UseGuards)(resource_member_guard_1.ResourceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], SearchController.prototype, "recordOpen", null);
__decorate([
    (0, common_1.Get)('sources/:workspaceId'),
    (0, common_1.UseGuards)(resource_member_guard_1.ResourceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SearchController.prototype, "sources", null);
__decorate([
    (0, common_1.Get)(':workspaceId'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('q')),
    __param(3, (0, common_1.Query)('limit')),
    __param(4, (0, common_1.Query)('types')),
    __param(5, (0, common_1.Query)('statusCategory')),
    __param(6, (0, common_1.Query)('priority')),
    __param(7, (0, common_1.Query)('assigneeId')),
    __param(8, (0, common_1.Query)('creatorId')),
    __param(9, (0, common_1.Query)('includeArchived')),
    __param(10, (0, common_1.Query)('labelId')),
    __param(11, (0, common_1.Query)('taskTypeId')),
    __param(12, (0, common_1.Query)('dueAfter')),
    __param(13, (0, common_1.Query)('dueBefore')),
    __param(14, (0, common_1.Query)('createdAfter')),
    __param(15, (0, common_1.Query)('createdBefore')),
    __param(16, (0, common_1.Query)('spaceId')),
    __param(17, (0, common_1.Query)('folderId')),
    __param(18, (0, common_1.Query)('listId')),
    __param(19, (0, common_1.Query)('customFieldId')),
    __param(20, (0, common_1.Query)('customFieldValue')),
    __param(21, (0, common_1.Query)('sort')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, String, String, String, String, String, String, String, String, String, String, String, String, String, String, String, String, String, String, String]),
    __metadata("design:returntype", void 0)
], SearchController.prototype, "query", null);
__decorate([
    (0, common_1.Get)(':workspaceId/custom-fields'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SearchController.prototype, "customFields", null);
__decorate([
    (0, common_1.Post)(':workspaceId/reindex'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SearchController.prototype, "reindex", null);
__decorate([
    (0, common_1.Get)(':workspaceId/saved'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], SearchController.prototype, "listSaved", null);
__decorate([
    (0, common_1.Post)(':workspaceId/saved'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], SearchController.prototype, "createSaved", null);
__decorate([
    (0, common_1.Delete)(':workspaceId/saved/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], SearchController.prototype, "deleteSaved", null);
exports.SearchController = SearchController = __decorate([
    (0, swagger_1.ApiTags)('search'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('search')
    // SEARCH is default-enabled; FeatureFlagGuard (after JwtAuthGuard) enforces the
    // flag at the API so a disabled workspace can't reach search via direct calls.
    ,
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, resource_member_guard_1.ResourceMemberGuard, feature_flag_guard_1.FeatureFlagGuard),
    (0, feature_flag_decorator_1.FeatureFlag)(feature_flags_1.FLAGS.SEARCH),
    __metadata("design:paramtypes", [search_service_1.SearchService])
], SearchController);
//# sourceMappingURL=search.controller.js.map