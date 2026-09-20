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
exports.FavoritesService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const item_visibility_1 = require("../../common/permissions/item-visibility");
const ENTITY_TYPES = ['space', 'list', 'task', 'doc', 'channel'];
let FavoritesService = class FavoritesService {
    constructor(db) {
        this.db = db;
    }
    assertType(entityType) {
        if (!ENTITY_TYPES.includes(entityType)) {
            throw new common_1.BadRequestException(`Unsupported favorite type: ${entityType}`);
        }
    }
    /**
     * Resolve display metadata for a batch of entity ids of one type, scoped to
     * the workspace. Ids that don't exist (or moved out of the workspace) are
     * simply absent from the returned map, which drives dangling-row pruning.
     */
    async resolveBatch(workspaceId, entityType, ids, actor) {
        const out = new Map();
        if (ids.length === 0)
            return out;
        if (entityType === 'space') {
            const rows = await this.db
                .select({ id: db_1.spaces.id, name: db_1.spaces.name })
                .from(db_1.spaces)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.spaces.id, ids)));
            for (const r of rows) {
                out.set(r.id, { entityType, entityId: r.id, label: r.name, url: `/app/${workspaceId}/${r.id}` });
            }
        }
        else if (entityType === 'list') {
            const rows = await this.db
                .select({ id: db_1.lists.id, name: db_1.lists.name, projectId: db_1.projects.id, spaceId: db_1.spaces.id })
                .from(db_1.lists)
                .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.lists.id, ids), (0, item_visibility_1.listVisibilityFilter)(actor.id, actor.isManager)));
            for (const r of rows) {
                out.set(r.id, {
                    entityType,
                    entityId: r.id,
                    label: r.name,
                    url: `/app/${workspaceId}/${r.spaceId}/${r.projectId}/${r.id}`,
                });
            }
        }
        else if (entityType === 'task') {
            const rows = await this.db
                .select({ id: db_1.tasks.id, title: db_1.tasks.title, listId: db_1.lists.id, projectId: db_1.projects.id, spaceId: db_1.spaces.id })
                .from(db_1.tasks)
                .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
                .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.tasks.id, ids), (0, item_visibility_1.taskVisibilityFilter)(this.db, actor.id, actor.isManager)));
            for (const r of rows) {
                out.set(r.id, {
                    entityType,
                    entityId: r.id,
                    label: r.title,
                    url: `/app/${workspaceId}/${r.spaceId}/${r.projectId}/${r.listId}?task=${r.id}`,
                });
            }
        }
        else if (entityType === 'doc') {
            const rows = await this.db
                .select({ id: db_1.docs.id, title: db_1.docs.title })
                .from(db_1.docs)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.docs.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.docs.id, ids)));
            for (const r of rows) {
                out.set(r.id, { entityType, entityId: r.id, label: r.title, url: `/app/${workspaceId}/docs?doc=${r.id}` });
            }
        }
        else if (entityType === 'channel') {
            const rows = await this.db
                .select({ id: db_1.chatChannels.id, name: db_1.chatChannels.name })
                .from(db_1.chatChannels)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.chatChannels.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.chatChannels.id, ids)));
            for (const r of rows) {
                out.set(r.id, { entityType, entityId: r.id, label: `#${r.name}`, url: `/app/${workspaceId}/chat?channel=${r.id}` });
            }
        }
        return out;
    }
    /** List a user's favorites in a workspace, hydrated + pruned of dangling rows. */
    async list(workspaceId, userId, actorRole) {
        const rows = await this.db
            .select()
            .from(db_1.favorites)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.favorites.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.favorites.userId, userId)));
        // §2 per-item privacy: the favorites owner is the actor — hide private
        // tasks/lists they may not see (creator/assignee/manager only).
        const isManager = await (0, item_visibility_1.resolveIsManager)(this.db, workspaceId, userId, actorRole);
        const actor = { id: userId, isManager };
        // Group ids by type, resolve each type in one query.
        const byType = new Map();
        for (const r of rows) {
            const list = byType.get(r.entityType) ?? [];
            list.push(r.entityId);
            byType.set(r.entityType, list);
        }
        const resolved = new Map(); // key: `${type}:${id}`
        for (const [type, ids] of byType) {
            const map = await this.resolveBatch(workspaceId, type, ids, actor);
            for (const [id, meta] of map)
                resolved.set(`${type}:${id}`, meta);
        }
        const hydrated = [];
        const stale = [];
        for (const r of rows) {
            const meta = resolved.get(`${r.entityType}:${r.entityId}`);
            if (!meta) {
                stale.push(r.id);
                continue;
            }
            hydrated.push({ id: r.id, entityType: r.entityType, entityId: r.entityId, label: meta.label, url: meta.url, createdAt: r.createdAt });
        }
        // Prune favorites whose target no longer exists / left the workspace.
        if (stale.length > 0) {
            await this.db.delete(db_1.favorites).where((0, drizzle_orm_1.inArray)(db_1.favorites.id, stale));
        }
        // Newest first.
        hydrated.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return hydrated;
    }
    /** Add or remove a favorite; returns the new favorited state. */
    async toggle(workspaceId, userId, entityType, entityId, actorRole) {
        this.assertType(entityType);
        if (!entityId)
            throw new common_1.BadRequestException('entityId is required');
        // The target must exist, belong to this workspace, and be visible to the
        // caller — you cannot favorite a private task/list you may not see (§2).
        const isManager = await (0, item_visibility_1.resolveIsManager)(this.db, workspaceId, userId, actorRole);
        const resolved = await this.resolveBatch(workspaceId, entityType, [entityId], { id: userId, isManager });
        if (!resolved.has(entityId))
            throw new common_1.NotFoundException('That item does not exist in this workspace');
        const [existing] = await this.db
            .select({ id: db_1.favorites.id })
            .from(db_1.favorites)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.favorites.userId, userId), (0, drizzle_orm_1.eq)(db_1.favorites.entityType, entityType), (0, drizzle_orm_1.eq)(db_1.favorites.entityId, entityId)))
            .limit(1);
        if (existing) {
            await this.db.delete(db_1.favorites).where((0, drizzle_orm_1.eq)(db_1.favorites.id, existing.id));
            return { favorited: false, entityType, entityId };
        }
        await this.db
            .insert(db_1.favorites)
            .values({ workspaceId, userId, entityType, entityId })
            .onConflictDoNothing();
        return { favorited: true, entityType, entityId };
    }
    /** Remove a favorite (idempotent). */
    async remove(workspaceId, userId, entityType, entityId) {
        this.assertType(entityType);
        await this.db
            .delete(db_1.favorites)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.favorites.userId, userId), (0, drizzle_orm_1.eq)(db_1.favorites.entityType, entityType), (0, drizzle_orm_1.eq)(db_1.favorites.entityId, entityId)));
        return { favorited: false, entityType, entityId };
    }
};
exports.FavoritesService = FavoritesService;
exports.FavoritesService = FavoritesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], FavoritesService);
//# sourceMappingURL=favorites.service.js.map