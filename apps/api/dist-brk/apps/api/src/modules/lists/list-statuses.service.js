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
exports.ListStatusesService = void 0;
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
let ListStatusesService = class ListStatusesService {
    constructor(db) {
        this.db = db;
    }
    async list(listId) {
        const ctx = await (0, status_resolution_1.getListStatusContext)(this.db, listId);
        const scope = ctx?.scope ?? 'list';
        if (scope === 'project' && ctx) {
            const rows = await this.db
                .select()
                .from(db_1.projectStatuses)
                .where((0, drizzle_orm_1.eq)(db_1.projectStatuses.projectId, ctx.projectId))
                .orderBy((0, drizzle_orm_1.asc)(db_1.projectStatuses.position), (0, drizzle_orm_1.asc)(db_1.projectStatuses.createdAt));
            return rows.map((r) => ({ ...r, listId, scope }));
        }
        if (scope === 'space' && ctx) {
            const rows = await this.db
                .select()
                .from(db_1.spaceStatuses)
                .where((0, drizzle_orm_1.eq)(db_1.spaceStatuses.spaceId, ctx.spaceId))
                .orderBy((0, drizzle_orm_1.asc)(db_1.spaceStatuses.position), (0, drizzle_orm_1.asc)(db_1.spaceStatuses.createdAt));
            return rows.map((r) => ({ ...r, listId, scope }));
        }
        const rows = await this.db
            .select()
            .from(db_1.listStatuses)
            .where((0, drizzle_orm_1.eq)(db_1.listStatuses.listId, listId))
            .orderBy((0, drizzle_orm_1.asc)(db_1.listStatuses.position), (0, drizzle_orm_1.asc)(db_1.listStatuses.createdAt));
        return rows.map((r) => ({ ...r, scope: 'list' }));
    }
    /**
     * List-level status mutations are only valid when the list owns its own
     * pipeline. If it inherits a project/space template, the caller must edit
     * that template instead (409, so the UI can redirect).
     */
    async assertOwnScope(listId) {
        const ctx = await (0, status_resolution_1.getListStatusContext)(this.db, listId);
        if (ctx && ctx.scope !== 'list') {
            throw new common_1.ConflictException(`This list uses the ${ctx.scope}'s status set. Edit statuses at the ${ctx.scope} level instead.`);
        }
    }
    /**
     * Return the canonical id, name, color, and category for a status `key`
     * on a list. Used by tasks.service to validate status changes and derive
     * the status_category bucket atomically.
     */
    async getByKey(listId, key) {
        const [row] = await this.db
            .select()
            .from(db_1.listStatuses)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.listStatuses.listId, listId), (0, drizzle_orm_1.eq)(db_1.listStatuses.key, key)))
            .limit(1);
        return row ?? null;
    }
    async create(listId, input) {
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        if (!name)
            throw new common_1.BadRequestException('Status name is required');
        if (name.length > NAME_MAX_LEN) {
            throw new common_1.BadRequestException(`Status name must be ${NAME_MAX_LEN} characters or fewer`);
        }
        if (input.category && !VALID_CATEGORIES.has(input.category)) {
            throw new common_1.BadRequestException(`Invalid category "${input.category}"`);
        }
        await this.assertListExists(listId);
        await this.assertOwnScope(listId);
        // Generate a unique key from the name; suffix on collision.
        const baseKey = slugifyKey(name);
        let key = baseKey;
        let attempt = 1;
        while (await this.getByKey(listId, key)) {
            attempt += 1;
            key = `${baseKey}_${attempt}`.slice(0, KEY_MAX_LEN);
            if (attempt > 50)
                throw new common_1.ConflictException('Could not generate a unique status key');
        }
        const nextPosition = await this.nextPosition(listId);
        try {
            const [row] = await this.db
                .insert(db_1.listStatuses)
                .values({
                listId,
                key,
                name,
                color: input.color ?? '#94a3b8',
                category: input.category ?? 'open',
                position: nextPosition,
            })
                .returning();
            return row;
        }
        catch (err) {
            if (err?.code === '23505') {
                throw new common_1.ConflictException(`A status with key "${key}" already exists in this list`);
            }
            throw err;
        }
    }
    async update(listId, statusId, patch) {
        await this.assertOwnScope(listId);
        const existing = await this.requireById(listId, statusId);
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
        const [row] = await this.db
            .update(db_1.listStatuses)
            .set(updates)
            .where((0, drizzle_orm_1.eq)(db_1.listStatuses.id, existing.id))
            .returning();
        // If the category bucket changed, propagate to every task still on
        // this status so reports / "is task closed?" checks stay consistent.
        if (patch.category && patch.category !== existing.category) {
            await this.db
                .update(db_1.tasks)
                .set({ statusCategory: patch.category, updatedAt: new Date() })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.tasks.listId, listId), (0, drizzle_orm_1.eq)(db_1.tasks.status, existing.key)));
        }
        return row;
    }
    /**
     * Delete a status. If any tasks still reference it the caller must pass
     * `reassignToStatusId` so we can rebind them atomically; we never delete
     * a status that would orphan tasks.
     */
    async remove(listId, statusId, reassignToStatusId) {
        await this.assertOwnScope(listId);
        const existing = await this.requireById(listId, statusId);
        const [{ count }] = await this.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(db_1.tasks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.tasks.listId, listId), (0, drizzle_orm_1.eq)(db_1.tasks.status, existing.key)));
        if (count > 0) {
            if (!reassignToStatusId) {
                throw new common_1.BadRequestException(`Cannot delete status "${existing.name}": ${count} task(s) still use it. ` +
                    `Pass reassignToStatusId to move them first.`);
            }
            const replacement = await this.requireById(listId, reassignToStatusId);
            if (replacement.id === existing.id) {
                throw new common_1.BadRequestException('reassignToStatusId must be a different status');
            }
            await this.db
                .update(db_1.tasks)
                .set({
                status: replacement.key,
                statusCategory: replacement.category,
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.tasks.listId, listId), (0, drizzle_orm_1.eq)(db_1.tasks.status, existing.key)));
        }
        await this.db.delete(db_1.listStatuses).where((0, drizzle_orm_1.eq)(db_1.listStatuses.id, existing.id));
        return { ok: true, reassignedCount: count };
    }
    /**
     * Bulk reorder. Caller passes the full id array in the desired order;
     * we rewrite `position` to match the array index so subsequent reads
     * stay deterministic.
     */
    async reorder(listId, orderedIds) {
        await this.assertOwnScope(listId);
        const all = await this.list(listId);
        const validIds = new Set(all.map((s) => s.id));
        const missing = orderedIds.filter((id) => !validIds.has(id));
        if (missing.length > 0) {
            throw new common_1.BadRequestException(`These ids are not statuses of this list: ${missing.join(', ')}`);
        }
        if (orderedIds.length !== all.length) {
            throw new common_1.BadRequestException('orderedIds must contain every status of the list exactly once');
        }
        await Promise.all(orderedIds.map((id, position) => this.db
            .update(db_1.listStatuses)
            .set({ position, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.listStatuses.id, id))));
        return this.list(listId);
    }
    // ─── internals ────────────────────────────────────────────────────────────
    async requireById(listId, statusId) {
        const [row] = await this.db
            .select()
            .from(db_1.listStatuses)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.listStatuses.id, statusId), (0, drizzle_orm_1.eq)(db_1.listStatuses.listId, listId)))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException(`Status ${statusId} not found in list`);
        return row;
    }
    async nextPosition(listId) {
        const [row] = await this.db
            .select({ maxPos: (0, drizzle_orm_1.sql) `coalesce(max(${db_1.listStatuses.position}), -1)::int` })
            .from(db_1.listStatuses)
            .where((0, drizzle_orm_1.eq)(db_1.listStatuses.listId, listId));
        return (row?.maxPos ?? -1) + 1;
    }
    async assertListExists(listId) {
        const [row] = await this.db.select({ id: db_1.lists.id }).from(db_1.lists).where((0, drizzle_orm_1.eq)(db_1.lists.id, listId)).limit(1);
        if (!row)
            throw new common_1.NotFoundException(`List ${listId} not found`);
    }
};
exports.ListStatusesService = ListStatusesService;
exports.ListStatusesService = ListStatusesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], ListStatusesService);
//# sourceMappingURL=list-statuses.service.js.map