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
exports.ScopedStatusesService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const status_resolution_1 = require("../../common/statuses/status-resolution");
const VALID_CATEGORIES = new Set(['open', 'in_progress', 'closed']);
const KEY_MAX_LEN = 64;
const NAME_MAX_LEN = 60;
function slugifyKey(name) {
    const base = name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    if (!base)
        return `status_${Math.random().toString(36).slice(2, 8)}`;
    return base.slice(0, KEY_MAX_LEN);
}
/**
 * CRUD for Space- and Project-scoped status templates (see 0036). Mirrors
 * ListStatusesService, but a template is shared by every list that adopts the
 * scope, so category changes and deletes fan out to tasks across ALL of those
 * lists — never orphaning a task's status.
 */
let ScopedStatusesService = class ScopedStatusesService {
    constructor(db) {
        this.db = db;
    }
    table(scope) {
        return scope === 'space' ? db_1.spaceStatuses : db_1.projectStatuses;
    }
    ownerCol(scope) {
        return scope === 'space' ? db_1.spaceStatuses.spaceId : db_1.projectStatuses.projectId;
    }
    async list(scope, containerId) {
        const t = this.table(scope);
        return this.db
            .select()
            .from(t)
            .where((0, drizzle_orm_1.eq)(this.ownerCol(scope), containerId))
            .orderBy((0, drizzle_orm_1.asc)(t.position), (0, drizzle_orm_1.asc)(t.createdAt));
    }
    async getByKey(scope, containerId, key) {
        const t = this.table(scope);
        const [row] = await this.db
            .select()
            .from(t)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(this.ownerCol(scope), containerId), (0, drizzle_orm_1.eq)(t.key, key)))
            .limit(1);
        return row ?? null;
    }
    async requireById(scope, containerId, statusId) {
        const t = this.table(scope);
        const [row] = await this.db
            .select()
            .from(t)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(t.id, statusId), (0, drizzle_orm_1.eq)(this.ownerCol(scope), containerId)))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException(`Status ${statusId} not found in ${scope}`);
        return row;
    }
    async nextPosition(scope, containerId) {
        const t = this.table(scope);
        const [row] = await this.db
            .select({ maxPos: (0, drizzle_orm_1.sql) `coalesce(max(${t.position}), -1)::int` })
            .from(t)
            .where((0, drizzle_orm_1.eq)(this.ownerCol(scope), containerId));
        return (row?.maxPos ?? -1) + 1;
    }
    async assertContainerExists(scope, containerId) {
        if (scope === 'space') {
            const [row] = await this.db.select({ id: db_1.spaces.id }).from(db_1.spaces).where((0, drizzle_orm_1.eq)(db_1.spaces.id, containerId)).limit(1);
            if (!row)
                throw new common_1.NotFoundException(`Space ${containerId} not found`);
        }
        else {
            const [row] = await this.db.select({ id: db_1.projects.id }).from(db_1.projects).where((0, drizzle_orm_1.eq)(db_1.projects.id, containerId)).limit(1);
            if (!row)
                throw new common_1.NotFoundException(`Project ${containerId} not found`);
        }
    }
    /** Ids of every list that currently draws its statuses from this template. */
    async affectedListIds(scope, containerId) {
        if (scope === 'project') {
            const rows = await this.db
                .select({ id: db_1.lists.id })
                .from(db_1.lists)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.lists.projectId, containerId), (0, drizzle_orm_1.eq)(db_1.lists.statusScope, 'project')));
            return rows.map((r) => r.id);
        }
        const rows = await this.db
            .select({ id: db_1.lists.id })
            .from(db_1.lists)
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.projects.spaceId, containerId), (0, drizzle_orm_1.eq)(db_1.lists.statusScope, 'space')));
        return rows.map((r) => r.id);
    }
    async create(scope, containerId, input) {
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        if (!name)
            throw new common_1.BadRequestException('Status name is required');
        if (name.length > NAME_MAX_LEN) {
            throw new common_1.BadRequestException(`Status name must be ${NAME_MAX_LEN} characters or fewer`);
        }
        if (input.category && !VALID_CATEGORIES.has(input.category)) {
            throw new common_1.BadRequestException(`Invalid category "${input.category}"`);
        }
        await this.assertContainerExists(scope, containerId);
        const baseKey = slugifyKey(name);
        let key = baseKey;
        let attempt = 1;
        while (await this.getByKey(scope, containerId, key)) {
            attempt += 1;
            key = `${baseKey}_${attempt}`.slice(0, KEY_MAX_LEN);
            if (attempt > 50)
                throw new common_1.ConflictException('Could not generate a unique status key');
        }
        const position = await this.nextPosition(scope, containerId);
        const t = this.table(scope);
        try {
            const [row] = await this.db
                .insert(t)
                .values({
                ...(scope === 'space' ? { spaceId: containerId } : { projectId: containerId }),
                key,
                name,
                color: input.color ?? '#94a3b8',
                category: input.category ?? 'open',
                position,
            })
                .returning();
            return row;
        }
        catch (err) {
            if (err?.code === '23505') {
                throw new common_1.ConflictException(`A status with key "${key}" already exists in this ${scope}`);
            }
            throw err;
        }
    }
    async update(scope, containerId, statusId, patch) {
        const existing = await this.requireById(scope, containerId, statusId);
        const updates = { updatedAt: new Date() };
        if (patch.name !== undefined) {
            const trimmed = patch.name.trim();
            if (!trimmed)
                throw new common_1.BadRequestException('Status name cannot be empty');
            if (trimmed.length > NAME_MAX_LEN) {
                throw new common_1.BadRequestException(`Status name must be ${NAME_MAX_LEN} characters or fewer`);
            }
            updates.name = trimmed;
        }
        if (patch.color !== undefined)
            updates.color = patch.color || '#94a3b8';
        if (patch.category !== undefined) {
            if (!VALID_CATEGORIES.has(patch.category)) {
                throw new common_1.BadRequestException(`Invalid category "${patch.category}"`);
            }
            updates.category = patch.category;
        }
        if (Object.keys(updates).length === 1)
            return existing;
        const t = this.table(scope);
        const [row] = await this.db.update(t).set(updates).where((0, drizzle_orm_1.eq)(t.id, existing.id)).returning();
        // Category bucket changed → propagate to every task on a list that uses
        // this template so completion / report semantics stay consistent.
        if (patch.category && patch.category !== existing.category) {
            const listIds = await this.affectedListIds(scope, containerId);
            if (listIds.length > 0) {
                await this.db
                    .update(db_1.tasks)
                    .set({ statusCategory: patch.category, updatedAt: new Date() })
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(db_1.tasks.listId, listIds), (0, drizzle_orm_1.eq)(db_1.tasks.status, existing.key)));
            }
        }
        return row;
    }
    async remove(scope, containerId, statusId, reassignToStatusId) {
        const existing = await this.requireById(scope, containerId, statusId);
        const listIds = await this.affectedListIds(scope, containerId);
        let count = 0;
        if (listIds.length > 0) {
            const [{ c }] = await this.db
                .select({ c: (0, drizzle_orm_1.sql) `count(*)::int` })
                .from(db_1.tasks)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(db_1.tasks.listId, listIds), (0, drizzle_orm_1.eq)(db_1.tasks.status, existing.key)));
            count = c;
        }
        if (count > 0) {
            if (!reassignToStatusId) {
                throw new common_1.BadRequestException(`Cannot delete status "${existing.name}": ${count} task(s) across this ${scope} still use it. ` +
                    `Pass reassignToStatusId to move them first.`);
            }
            const replacement = await this.requireById(scope, containerId, reassignToStatusId);
            if (replacement.id === existing.id) {
                throw new common_1.BadRequestException('reassignToStatusId must be a different status');
            }
            await this.db
                .update(db_1.tasks)
                .set({ status: replacement.key, statusCategory: replacement.category, updatedAt: new Date() })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(db_1.tasks.listId, listIds), (0, drizzle_orm_1.eq)(db_1.tasks.status, existing.key)));
        }
        const t = this.table(scope);
        await this.db.delete(t).where((0, drizzle_orm_1.eq)(t.id, existing.id));
        return { ok: true, reassignedCount: count };
    }
    /**
     * Switch which scope a list draws its statuses from. Refuses the switch if
     * the target status set is empty, or if any status key currently used by a
     * task on the list is absent from the target set (which would orphan it).
     */
    async setListScope(listId, target) {
        const ctx = await (0, status_resolution_1.getListStatusContext)(this.db, listId);
        if (!ctx)
            throw new common_1.NotFoundException(`List ${listId} not found`);
        if (ctx.scope === target)
            return { listId, scope: target, changed: false };
        let targetKeys;
        if (target === 'list') {
            targetKeys = (await this.db.select({ key: db_1.listStatuses.key }).from(db_1.listStatuses).where((0, drizzle_orm_1.eq)(db_1.listStatuses.listId, listId))).map((r) => r.key);
        }
        else if (target === 'project') {
            targetKeys = (await this.db
                .select({ key: db_1.projectStatuses.key })
                .from(db_1.projectStatuses)
                .where((0, drizzle_orm_1.eq)(db_1.projectStatuses.projectId, ctx.projectId))).map((r) => r.key);
        }
        else {
            targetKeys = (await this.db
                .select({ key: db_1.spaceStatuses.key })
                .from(db_1.spaceStatuses)
                .where((0, drizzle_orm_1.eq)(db_1.spaceStatuses.spaceId, ctx.spaceId))).map((r) => r.key);
        }
        if (targetKeys.length === 0) {
            throw new common_1.BadRequestException(`The ${target} has no statuses defined yet. Add statuses to it before switching this list.`);
        }
        const targetSet = new Set(targetKeys);
        const usedKeys = (await this.db
            .selectDistinct({ status: db_1.tasks.status })
            .from(db_1.tasks)
            .where((0, drizzle_orm_1.eq)(db_1.tasks.listId, listId))).map((r) => r.status);
        const missing = usedKeys.filter((k) => !targetSet.has(k));
        if (missing.length > 0) {
            throw new common_1.BadRequestException(`Cannot switch to the ${target} status set: it is missing status(es) still used by tasks here: ${missing.join(', ')}. ` +
                `Add them to the ${target} first.`);
        }
        await this.db.update(db_1.lists).set({ statusScope: target, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(db_1.lists.id, listId));
        return { listId, scope: target, changed: true };
    }
    async reorder(scope, containerId, orderedIds) {
        const all = await this.list(scope, containerId);
        const validIds = new Set(all.map((s) => s.id));
        const missing = orderedIds.filter((id) => !validIds.has(id));
        if (missing.length > 0) {
            throw new common_1.BadRequestException(`These ids are not statuses of this ${scope}: ${missing.join(', ')}`);
        }
        if (orderedIds.length !== all.length) {
            throw new common_1.BadRequestException('orderedIds must contain every status of the container exactly once');
        }
        const t = this.table(scope);
        await Promise.all(orderedIds.map((id, position) => this.db.update(t).set({ position, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(t.id, id))));
        return this.list(scope, containerId);
    }
};
exports.ScopedStatusesService = ScopedStatusesService;
exports.ScopedStatusesService = ScopedStatusesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], ScopedStatusesService);
//# sourceMappingURL=scoped-statuses.service.js.map