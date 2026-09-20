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
exports.ListFiltersService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
/**
 * §V2-07 "Saved filters" — frame `11:41`.
 *
 * The rules themselves are stored as opaque JSON, the same bargain
 * `task_views.config` makes: the shape of a filter tree is a property of the
 * screen that builds and evaluates it, and a server-side mirror of it would be
 * a second definition to keep in step. What IS enforced here is the shape of
 * the CONTAINER — an array, of objects, of a bounded size — because those are
 * the things whose absence would break the reader rather than the filter.
 */
/** One level of nesting, so a saved preset cannot be a tree of arbitrary depth. */
const MAX_NODES = 100;
function assertRules(rules) {
    if (rules === undefined)
        return [];
    if (!Array.isArray(rules))
        throw new common_1.BadRequestException('Filter "rules" must be an array');
    if (rules.length > MAX_NODES)
        throw new common_1.BadRequestException(`A filter can hold at most ${MAX_NODES} rules`);
    for (const node of rules) {
        if (node === null || typeof node !== 'object' || Array.isArray(node)) {
            throw new common_1.BadRequestException('Each filter rule must be an object');
        }
        const nested = node.rules;
        if (nested !== undefined) {
            if (!Array.isArray(nested))
                throw new common_1.BadRequestException('A nested filter\'s "rules" must be an array');
            if (nested.length > MAX_NODES)
                throw new common_1.BadRequestException(`A nested filter can hold at most ${MAX_NODES} rules`);
            for (const leaf of nested) {
                if (leaf === null || typeof leaf !== 'object' || Array.isArray(leaf)) {
                    throw new common_1.BadRequestException('Each filter rule must be an object');
                }
                // Depth is capped at one: a group inside a group has no control in the
                // panel that builds it, so it could only arrive from a hand-written
                // request and would render as nothing.
                if (leaf.rules !== undefined) {
                    throw new common_1.BadRequestException('Filters can nest one level deep');
                }
            }
        }
    }
    return rules;
}
let ListFiltersService = class ListFiltersService {
    constructor(db) {
        this.db = db;
    }
    list(listId, userId) {
        return this.db
            .select()
            .from(db_1.listFilterPresets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.listFilterPresets.listId, listId), (0, drizzle_orm_1.eq)(db_1.listFilterPresets.userId, userId)))
            .orderBy((0, drizzle_orm_1.asc)(db_1.listFilterPresets.name));
    }
    /** Saving under a name you already used replaces it — that is what "save" means. */
    async save(listId, userId, name, rules) {
        const trimmed = (name ?? '').trim();
        if (!trimmed)
            throw new common_1.BadRequestException('A filter name is required');
        const [row] = await this.db
            .insert(db_1.listFilterPresets)
            .values({ listId, userId, name: trimmed.slice(0, 80), rules: assertRules(rules) })
            .onConflictDoUpdate({
            target: [db_1.listFilterPresets.listId, db_1.listFilterPresets.userId, db_1.listFilterPresets.name],
            set: { rules: assertRules(rules), updatedAt: new Date() },
        })
            .returning();
        return row;
    }
    /** Scoped by user, so one person cannot delete another's saved filter. */
    async remove(id, userId) {
        const [row] = await this.db
            .delete(db_1.listFilterPresets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.listFilterPresets.id, id), (0, drizzle_orm_1.eq)(db_1.listFilterPresets.userId, userId)))
            .returning();
        if (!row)
            throw new common_1.NotFoundException('Filter not found');
        return { ok: true };
    }
};
exports.ListFiltersService = ListFiltersService;
exports.ListFiltersService = ListFiltersService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], ListFiltersService);
//# sourceMappingURL=list-filters.service.js.map