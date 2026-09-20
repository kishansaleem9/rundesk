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
exports.ViewsService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const VISIBILITIES = ['everyone', 'private', 'protected'];
/** Roles that may act on a view they do not own. Mirrors `item-visibility.ts`. */
const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);
/** A view `config` is a keyed object — reject a string/array/primitive so a
 *  reader that reaches into `config.columns` etc. never meets a wrong type. */
function assertConfigObject(config) {
    if (config != null && (typeof config !== 'object' || Array.isArray(config))) {
        throw new common_1.BadRequestException('View "config" must be an object');
    }
}
let ViewsService = class ViewsService {
    constructor(db) {
        this.db = db;
    }
    /**
     * Is this actor a manager of the workspace the view's list belongs to?
     *
     * Resolved from the view rather than passed in, because the caller that
     * matters (`PATCH /views/:viewId`) knows a view id and nothing else — a
     * workspace id it took from the request body would be the caller's claim
     * about which workspace to check, which is not a check.
     */
    async isManagerOfViewsWorkspace(viewId, actor) {
        if (actor.role === 'super_admin')
            return true;
        const [row] = await this.db
            .select({ role: db_1.workspaceMembers.role })
            .from(db_1.taskViews)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.taskViews.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .innerJoin(db_1.workspaceMembers, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, db_1.spaces.workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, actor.id)))
            .where((0, drizzle_orm_1.eq)(db_1.taskViews.id, viewId))
            .limit(1);
        return !!row && MANAGER_ROLES.has(row.role);
    }
    /**
     * The views on a list that this actor may see, pinned ones first.
     *
     * A private view belonging to somebody else is not in the result. Not
     * greyed out, not listed as "private" — absent, because the NAME of a
     * private view is part of what makes it private.
     *
     * `autosave` rides along per row: it is this actor's own flag, so the tab
     * strip can render the switch without a second round trip per view.
     */
    async listByList(listId, actor) {
        const rows = await this.db
            .select({
            id: db_1.taskViews.id,
            listId: db_1.taskViews.listId,
            createdById: db_1.taskViews.createdById,
            name: db_1.taskViews.name,
            type: db_1.taskViews.type,
            isDefault: db_1.taskViews.isDefault,
            isPinned: db_1.taskViews.isPinned,
            visibility: db_1.taskViews.visibility,
            position: db_1.taskViews.position,
            config: db_1.taskViews.config,
            createdAt: db_1.taskViews.createdAt,
            updatedAt: db_1.taskViews.updatedAt,
            autosave: (0, drizzle_orm_1.sql) `coalesce(${db_1.taskViewPrefs.autosave}, false)`.as('autosave'),
        })
            .from(db_1.taskViews)
            .leftJoin(db_1.taskViewPrefs, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskViewPrefs.viewId, db_1.taskViews.id), (0, drizzle_orm_1.eq)(db_1.taskViewPrefs.userId, actor.id)))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskViews.listId, listId), actor.role === 'super_admin'
            ? undefined
            : (0, drizzle_orm_1.or)((0, drizzle_orm_1.ne)(db_1.taskViews.visibility, 'private'), (0, drizzle_orm_1.eq)(db_1.taskViews.createdById, actor.id))))
            // Pinned first `[frame 10:36 "Pin view"]`, then the order the list was
            // arranged in. `desc` on a boolean puts true first in Postgres.
            .orderBy((0, drizzle_orm_1.desc)(db_1.taskViews.isPinned), (0, drizzle_orm_1.asc)(db_1.taskViews.position), (0, drizzle_orm_1.asc)(db_1.taskViews.createdAt));
        return rows;
    }
    async create(data) {
        assertConfigObject(data.config);
        if (data.visibility !== undefined && !VISIBILITIES.includes(data.visibility)) {
            throw new common_1.BadRequestException(`Unknown view visibility "${data.visibility}"`);
        }
        const existing = await this.db
            .select({ id: db_1.taskViews.id })
            .from(db_1.taskViews)
            .where((0, drizzle_orm_1.eq)(db_1.taskViews.listId, data.listId));
        const [row] = await this.db
            .insert(db_1.taskViews)
            .values({
            listId: data.listId,
            name: data.name,
            type: data.type,
            config: data.config ?? {},
            visibility: data.visibility ?? 'everyone',
            isDefault: existing.length === 0,
            createdById: data.createdById,
        })
            .returning();
        return row;
    }
    /**
     * Read one view, or 404 — the single place that decides whether this actor
     * is allowed to know a view exists.
     */
    async loadVisible(viewId, actor) {
        const [row] = await this.db.select().from(db_1.taskViews).where((0, drizzle_orm_1.eq)(db_1.taskViews.id, viewId)).limit(1);
        if (!row)
            throw new common_1.NotFoundException('View not found');
        const mine = row.createdById === actor.id;
        if (row.visibility === 'private' && !mine && actor.role !== 'super_admin') {
            // 404, not 403: "you may not see this" tells you it is there.
            throw new common_1.NotFoundException('View not found');
        }
        return row;
    }
    async getOne(viewId, actor) {
        return this.loadVisible(viewId, actor);
    }
    /**
     * Who may change a view.
     *
     *   private    its creator, and nobody else — they are the only one who can
     *              see it, so there is nobody else to ask.
     *   protected  its creator and the workspace's managers. This is the switch's
     *              entire purpose.
     *   everyone   anyone who can open the list, which is what every view was
     *              before this existed, and what ClickUp does with an unprotected
     *              view. Protect view is how you opt out of it.
     */
    async assertMayWrite(row, actor) {
        if (row.createdById === actor.id || actor.role === 'super_admin')
            return;
        if (row.visibility === 'everyone')
            return;
        if (await this.isManagerOfViewsWorkspace(row.id, actor))
            return;
        throw new common_1.ForbiddenException(row.visibility === 'protected'
            ? 'This view is protected — only its owner or a workspace manager can change it'
            : 'View not found');
    }
    async update(viewId, patch, actor) {
        assertConfigObject(patch.config);
        if (patch.position !== undefined && (typeof patch.position !== 'number' || !Number.isInteger(patch.position))) {
            throw new common_1.BadRequestException('View position must be an integer');
        }
        if (patch.visibility !== undefined && !VISIBILITIES.includes(patch.visibility)) {
            throw new common_1.BadRequestException(`Unknown view visibility "${patch.visibility}"`);
        }
        const existing = await this.loadVisible(viewId, actor);
        await this.assertMayWrite(existing, actor);
        /*
         * Changing the visibility itself is the owner's and the managers' call
         * only — an `everyone` view that anybody could flip to `private` would let
         * one member hide a view the whole team works in, and the check above lets
         * anybody edit an `everyone` view.
         */
        if (patch.visibility !== undefined && patch.visibility !== existing.visibility) {
            const owner = existing.createdById === actor.id || actor.role === 'super_admin';
            if (!owner && !(await this.isManagerOfViewsWorkspace(viewId, actor))) {
                throw new common_1.ForbiddenException('Only the view\'s owner or a workspace manager can change who can see it');
            }
        }
        /*
         * A private view cannot be the list's default: the default is what
         * everyone lands on, and nobody else can open this one. Refused rather
         * than silently un-defaulted, because a switch that quietly undoes another
         * switch is worse than one that says no.
         */
        const nextVisibility = patch.visibility ?? existing.visibility;
        const nextDefault = patch.isDefault ?? existing.isDefault;
        if (nextVisibility === 'private' && nextDefault) {
            throw new common_1.BadRequestException('A private view cannot be the default view for the list');
        }
        if (patch.isDefault === true) {
            await this.db
                .update(db_1.taskViews)
                .set({ isDefault: false, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(db_1.taskViews.listId, existing.listId));
        }
        const set = { updatedAt: new Date() };
        for (const key of ['name', 'config', 'position', 'isDefault', 'isPinned', 'visibility']) {
            if (patch[key] !== undefined)
                set[key] = patch[key];
        }
        const [row] = await this.db
            .update(db_1.taskViews)
            .set(set)
            .where((0, drizzle_orm_1.eq)(db_1.taskViews.id, viewId))
            .returning();
        if (!row)
            throw new common_1.NotFoundException('View not found');
        return row;
    }
    async delete(viewId, actor) {
        const existing = await this.loadVisible(viewId, actor);
        await this.assertMayWrite(existing, actor);
        const [row] = await this.db.delete(db_1.taskViews).where((0, drizzle_orm_1.eq)(db_1.taskViews.id, viewId)).returning();
        if (!row)
            throw new common_1.NotFoundException('View not found');
        return { ok: true };
    }
    /**
     * "Autosave for me" — per user, by the tooltip in frame `10:36`. Reading a
     * view you may see is enough to set your own flag on it; you are not
     * changing the view.
     */
    async setAutosave(viewId, actor, autosave) {
        await this.loadVisible(viewId, actor);
        await this.db
            .insert(db_1.taskViewPrefs)
            .values({ viewId, userId: actor.id, autosave })
            .onConflictDoUpdate({
            target: [db_1.taskViewPrefs.viewId, db_1.taskViewPrefs.userId],
            set: { autosave, updatedAt: new Date() },
        });
        return { viewId, autosave };
    }
};
exports.ViewsService = ViewsService;
exports.ViewsService = ViewsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], ViewsService);
//# sourceMappingURL=views.service.js.map