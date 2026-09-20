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
var TrashService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrashService = exports.TRASH_RETENTION_DAYS = exports.TRASH_TYPES = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const security_service_1 = require("../security/security.service");
const search_service_1 = require("../search/search.service");
/** Item kinds the workspace Trash can hold. */
exports.TRASH_TYPES = ['space', 'folder', 'project', 'list', 'task', 'doc'];
/** Deleted items are kept this long before the nightly purge removes them. */
exports.TRASH_RETENTION_DAYS = 30;
let TrashService = TrashService_1 = class TrashService {
    constructor(db, security, search) {
        this.db = db;
        this.security = security;
        this.search = search;
        this.logger = new common_1.Logger(TrashService_1.name);
    }
    // ─── permissions ────────────────────────────────────────────────────────────
    /**
     * Workspace admins/managers (and super admins) administer the whole Trash.
     * A regular member still gets a Trash, but only of the items they deleted
     * themselves — so one member can undo their own mistake without being handed
     * everyone else's deleted work.
     */
    async resolveScope(workspaceId, actor) {
        if (actor.role === 'super_admin')
            return { isAdmin: true };
        const [member] = await this.db
            .select({ role: db_1.workspaceMembers.role })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, actor.id)))
            .limit(1);
        if (!member)
            throw new common_1.ForbiddenException('Not a member of this workspace');
        return { isAdmin: member.role === 'workspace_admin' || member.role === 'manager' };
    }
    async assertAdmin(workspaceId, actor) {
        const { isAdmin } = await this.resolveScope(workspaceId, actor);
        if (!isAdmin)
            throw new common_1.ForbiddenException('Workspace admin or manager required');
    }
    // ─── listing ────────────────────────────────────────────────────────────────
    async list(workspaceId, actor, query = {}) {
        const { isAdmin } = await this.resolveScope(workspaceId, actor);
        const wanted = new Set(query.types?.length ? query.types : [...exports.TRASH_TYPES]);
        // A non-admin only ever sees what they deleted; an explicit "Deleted by"
        // filter narrows further (never widens).
        const restrictTo = isAdmin ? query.deletedByIds ?? null : [actor.id];
        const term = query.search?.trim().toLowerCase() || null;
        const rows = [];
        const deleter = (r) => r.byId ? { id: r.byId, name: r.byName ?? 'Unknown', avatarUrl: r.byAvatar } : null;
        const stamp = (d) => (d ? new Date(d).toISOString() : null);
        if (wanted.has('space')) {
            const res = await this.db
                .select({
                id: db_1.spaces.id, name: db_1.spaces.name, at: db_1.spaces.archivedAt,
                byId: db_1.users.id, byName: db_1.users.displayName, byAvatar: db_1.users.avatarUrl,
            })
                .from(db_1.spaces)
                .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.spaces.archivedById))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.spaces.isArchived, true)));
            for (const r of res)
                rows.push({ id: r.id, type: 'space', name: r.name, location: '', deletedAt: stamp(r.at), deletedBy: deleter(r) });
        }
        if (wanted.has('folder')) {
            const res = await this.db
                .select({
                id: db_1.folders.id, name: db_1.folders.name, at: db_1.folders.archivedAt, spaceName: db_1.spaces.name,
                byId: db_1.users.id, byName: db_1.users.displayName, byAvatar: db_1.users.avatarUrl,
            })
                .from(db_1.folders)
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.folders.spaceId))
                .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.folders.archivedById))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.folders.isArchived, true)));
            for (const r of res)
                rows.push({ id: r.id, type: 'folder', name: r.name, location: r.spaceName, deletedAt: stamp(r.at), deletedBy: deleter(r) });
        }
        if (wanted.has('project')) {
            const res = await this.db
                .select({
                id: db_1.projects.id, name: db_1.projects.name, at: db_1.projects.archivedAt, spaceName: db_1.spaces.name,
                byId: db_1.users.id, byName: db_1.users.displayName, byAvatar: db_1.users.avatarUrl,
            })
                .from(db_1.projects)
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.projects.archivedById))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.projects.isArchived, true)));
            for (const r of res)
                rows.push({ id: r.id, type: 'project', name: r.name, location: r.spaceName, deletedAt: stamp(r.at), deletedBy: deleter(r) });
        }
        if (wanted.has('list')) {
            const res = await this.db
                .select({
                id: db_1.lists.id, name: db_1.lists.name, at: db_1.lists.archivedAt, spaceName: db_1.spaces.name, projectName: db_1.projects.name,
                byId: db_1.users.id, byName: db_1.users.displayName, byAvatar: db_1.users.avatarUrl,
            })
                .from(db_1.lists)
                .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.lists.archivedById))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.lists.isArchived, true)));
            for (const r of res)
                rows.push({ id: r.id, type: 'list', name: r.name, location: `${r.spaceName} › ${r.projectName}`, deletedAt: stamp(r.at), deletedBy: deleter(r) });
        }
        /*
         * §V2-08 frame `15:32` — TASKS COME IN ON `deletedAt`, NOT `isArchived`.
         *
         * The frame's menu draws Archive and Delete as two rows and this query used
         * to make them one: it listed every archived task, so archiving a task put
         * it in the Trash with a thirty-day clock on it and there was no way to
         * delete one at all. `deletedAt` is set only by `POST /tasks/:id/trash`, so
         * an archived task is never listed here and is never purged, and everything
         * listed here really was deleted.
         */
        if (wanted.has('task')) {
            const res = await this.db
                .select({
                id: db_1.tasks.id, name: db_1.tasks.title, at: db_1.tasks.deletedAt,
                spaceName: db_1.spaces.name, projectName: db_1.projects.name, listName: db_1.lists.name,
                byId: db_1.users.id, byName: db_1.users.displayName, byAvatar: db_1.users.avatarUrl,
            })
                .from(db_1.tasks)
                .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
                .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.tasks.deletedById))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.isNotNull)(db_1.tasks.deletedAt)));
            for (const r of res)
                rows.push({ id: r.id, type: 'task', name: r.name, location: `${r.spaceName} › ${r.projectName} › ${r.listName}`, deletedAt: stamp(r.at), deletedBy: deleter(r) });
        }
        if (wanted.has('doc')) {
            const res = await this.db
                .select({
                id: db_1.docs.id, name: db_1.docs.title, at: db_1.docs.archivedAt, spaceName: db_1.spaces.name,
                byId: db_1.users.id, byName: db_1.users.displayName, byAvatar: db_1.users.avatarUrl,
            })
                .from(db_1.docs)
                .leftJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.docs.spaceId))
                .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.docs.archivedById))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.docs.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.docs.isArchived, true)));
            for (const r of res)
                rows.push({ id: r.id, type: 'doc', name: r.name, location: r.spaceName ?? '', deletedAt: stamp(r.at), deletedBy: deleter(r) });
        }
        const filtered = rows.filter((r) => {
            if (restrictTo && !(r.deletedBy && restrictTo.includes(r.deletedBy.id)))
                return false;
            if (term && !r.name.toLowerCase().includes(term) && !r.location.toLowerCase().includes(term))
                return false;
            return true;
        });
        // Newest deletion first; unknown timestamps (legacy rows) sink to the bottom.
        filtered.sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));
        return filtered;
    }
    /** Distinct users who have deleted something here — powers the "Deleted by" filter. */
    async deleters(workspaceId, actor) {
        const items = await this.list(workspaceId, actor);
        const seen = new Map();
        for (const i of items)
            if (i.deletedBy && !seen.has(i.deletedBy.id))
                seen.set(i.deletedBy.id, i.deletedBy);
        return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
    }
    // ─── ownership check for a single item ──────────────────────────────────────
    /**
     * Resolve the item's workspace, who deleted it, and WHETHER IT IS ACTUALLY IN
     * THE TRASH, or throw.
     *
     * That last part was missing. `locate` looked the row up by id alone, so
     * `DELETE /workspaces/:id/trash/task/:taskId` would hard-delete a task that
     * had never been deleted — an admin, or the person who happened to have
     * archived it, could destroy a live task through an endpoint whose whole
     * contract is "this thing is already in the bin". Both callers
     * (`restore`, `deleteForever`) go through here, and restore on a live item
     * was silently a no-op reported as success.
     */
    async locate(workspaceId, type, id) {
        const q = {
            space: () => this.db.select({ name: db_1.spaces.name, by: db_1.spaces.archivedById, ws: db_1.spaces.workspaceId, trashed: db_1.spaces.isArchived })
                .from(db_1.spaces).where((0, drizzle_orm_1.eq)(db_1.spaces.id, id)).limit(1),
            folder: () => this.db.select({ name: db_1.folders.name, by: db_1.folders.archivedById, ws: db_1.spaces.workspaceId, trashed: db_1.folders.isArchived })
                .from(db_1.folders).innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.folders.spaceId)).where((0, drizzle_orm_1.eq)(db_1.folders.id, id)).limit(1),
            project: () => this.db.select({ name: db_1.projects.name, by: db_1.projects.archivedById, ws: db_1.spaces.workspaceId, trashed: db_1.projects.isArchived })
                .from(db_1.projects).innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId)).where((0, drizzle_orm_1.eq)(db_1.projects.id, id)).limit(1),
            list: () => this.db.select({ name: db_1.lists.name, by: db_1.lists.archivedById, ws: db_1.spaces.workspaceId, trashed: db_1.lists.isArchived })
                .from(db_1.lists).innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId)).where((0, drizzle_orm_1.eq)(db_1.lists.id, id)).limit(1),
            // A task is in the trash when it was DELETED. Archived is a different
            // state with a different surface, and restoring or purging one from here
            // would be acting on something the Trash never showed.
            task: () => this.db.select({ name: db_1.tasks.title, by: db_1.tasks.deletedById, ws: db_1.spaces.workspaceId, trashed: (0, drizzle_orm_1.sql) `${db_1.tasks.deletedAt} is not null` })
                .from(db_1.tasks).innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
                .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId)).where((0, drizzle_orm_1.eq)(db_1.tasks.id, id)).limit(1),
            doc: () => this.db.select({ name: db_1.docs.title, by: db_1.docs.archivedById, ws: db_1.docs.workspaceId, trashed: db_1.docs.isArchived })
                .from(db_1.docs).where((0, drizzle_orm_1.eq)(db_1.docs.id, id)).limit(1),
        }[type];
        const [row] = await q();
        if (!row || row.ws !== workspaceId)
            throw new common_1.NotFoundException('Item not found in this workspace trash');
        if (!row.trashed)
            throw new common_1.NotFoundException(`This ${type} is not in the trash`);
        return row;
    }
    /** Admins act on anything; a member may only act on what they deleted. */
    async assertMayAct(workspaceId, actor, type, id) {
        const { isAdmin } = await this.resolveScope(workspaceId, actor);
        const row = await this.locate(workspaceId, type, id);
        if (!isAdmin && row.by !== actor.id)
            throw new common_1.ForbiddenException('You can only manage items you deleted');
        return row;
    }
    assertType(type) {
        if (!exports.TRASH_TYPES.includes(type))
            throw new common_1.BadRequestException(`Unknown trash type "${type}"`);
        return type;
    }
    // ─── restore ────────────────────────────────────────────────────────────────
    /**
     * Un-archive the item **and its ancestors** — restoring a task whose list was
     * also deleted must actually make the task reachable again, otherwise the
     * restore silently appears to do nothing.
     */
    async restore(workspaceId, rawType, id, actor, ip) {
        const type = this.assertType(rawType);
        const row = await this.assertMayAct(workspaceId, actor, type, id);
        const clear = { isArchived: false, archivedAt: null, archivedById: null, updatedAt: new Date() };
        if (type === 'space') {
            await this.db.update(db_1.spaces).set(clear).where((0, drizzle_orm_1.eq)(db_1.spaces.id, id));
        }
        else if (type === 'folder') {
            const [f] = await this.db.select({ spaceId: db_1.folders.spaceId }).from(db_1.folders).where((0, drizzle_orm_1.eq)(db_1.folders.id, id)).limit(1);
            await this.db.update(db_1.folders).set(clear).where((0, drizzle_orm_1.eq)(db_1.folders.id, id));
            if (f)
                await this.db.update(db_1.spaces).set(clear).where((0, drizzle_orm_1.eq)(db_1.spaces.id, f.spaceId));
        }
        else if (type === 'project') {
            const [p] = await this.db.select({ spaceId: db_1.projects.spaceId }).from(db_1.projects).where((0, drizzle_orm_1.eq)(db_1.projects.id, id)).limit(1);
            await this.db.update(db_1.projects).set(clear).where((0, drizzle_orm_1.eq)(db_1.projects.id, id));
            if (p)
                await this.db.update(db_1.spaces).set(clear).where((0, drizzle_orm_1.eq)(db_1.spaces.id, p.spaceId));
        }
        else if (type === 'list') {
            const [l] = await this.db
                .select({ projectId: db_1.lists.projectId, spaceId: db_1.projects.spaceId })
                .from(db_1.lists).innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId)).where((0, drizzle_orm_1.eq)(db_1.lists.id, id)).limit(1);
            await this.db.update(db_1.lists).set(clear).where((0, drizzle_orm_1.eq)(db_1.lists.id, id));
            if (l) {
                await this.db.update(db_1.projects).set(clear).where((0, drizzle_orm_1.eq)(db_1.projects.id, l.projectId));
                await this.db.update(db_1.spaces).set(clear).where((0, drizzle_orm_1.eq)(db_1.spaces.id, l.spaceId));
            }
        }
        else if (type === 'task') {
            const [tk] = await this.db
                .select({ listId: db_1.tasks.listId, projectId: db_1.lists.projectId, spaceId: db_1.projects.spaceId })
                .from(db_1.tasks).innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
                .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId)).where((0, drizzle_orm_1.eq)(db_1.tasks.id, id)).limit(1);
            /*
             * A task carries BOTH flags while it is in the bin: `deletedAt` is what
             * put it here, `isArchived` is what hides it from every list, search and
             * report. Restoring has to clear both — clearing only `deletedAt` would
             * take the task out of the Trash and leave it invisible everywhere, which
             * is the worst of the two states.
             *
             * `archivedAt`/`archivedById` go too: if the task had been archived
             * before it was deleted, leaving them set would put it straight back into
             * Archived tasks after a restore that said it was bringing it back.
             */
            await this.db
                .update(db_1.tasks)
                .set({ ...clear, deletedAt: null, deletedById: null })
                .where((0, drizzle_orm_1.eq)(db_1.tasks.id, id));
            if (tk) {
                await this.db.update(db_1.lists).set(clear).where((0, drizzle_orm_1.eq)(db_1.lists.id, tk.listId));
                await this.db.update(db_1.projects).set(clear).where((0, drizzle_orm_1.eq)(db_1.projects.id, tk.projectId));
                await this.db.update(db_1.spaces).set(clear).where((0, drizzle_orm_1.eq)(db_1.spaces.id, tk.spaceId));
            }
        }
        else {
            await this.db.update(db_1.docs).set(clear).where((0, drizzle_orm_1.eq)(db_1.docs.id, id));
        }
        /*
         * Binning a task took it out of the search index (`binTask` →
         * `search.removeTask`), so restoring has to put it back. Without this a
         * restored task looks fine everywhere except search, where it is
         * permanently unfindable — the same bug `restoreTask` fixed on the archive
         * side, which this door bypasses.
         */
        if (type === 'task')
            void this.reindexTask(id).catch(() => undefined);
        await this.security.logAuditEvent({
            workspaceId, actorId: actor.id, action: 'trash.restored', resourceType: type, resourceId: id,
            description: `Restored ${type} "${row.name}" from trash`, ipAddress: ip,
        });
        return { ok: true };
    }
    /** Re-index one restored task — the ids the index needs are a join away. */
    async reindexTask(taskId) {
        const [row] = await this.db
            .select({
            id: db_1.tasks.id, title: db_1.tasks.title, description: db_1.tasks.description, listId: db_1.tasks.listId,
            createdAt: db_1.tasks.createdAt, updatedAt: db_1.tasks.updatedAt,
            projectId: db_1.lists.projectId, spaceId: db_1.projects.spaceId, workspaceId: db_1.spaces.workspaceId,
        })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId))
            .limit(1);
        if (!row)
            return;
        await this.search.indexTask(row, row.workspaceId, row.spaceId, row.projectId);
    }
    // ─── permanent delete ───────────────────────────────────────────────────────
    /** Hard-delete a single trashed item. Children cascade via FKs. */
    async deleteForever(workspaceId, rawType, id, actor, ip) {
        const type = this.assertType(rawType);
        const row = await this.assertMayAct(workspaceId, actor, type, id);
        if (type === 'space')
            await this.db.delete(db_1.spaces).where((0, drizzle_orm_1.eq)(db_1.spaces.id, id));
        else if (type === 'folder')
            await this.db.delete(db_1.folders).where((0, drizzle_orm_1.eq)(db_1.folders.id, id));
        else if (type === 'project')
            await this.db.delete(db_1.projects).where((0, drizzle_orm_1.eq)(db_1.projects.id, id));
        else if (type === 'list')
            await this.db.delete(db_1.lists).where((0, drizzle_orm_1.eq)(db_1.lists.id, id));
        else if (type === 'task') {
            await this.db.delete(db_1.tasks).where((0, drizzle_orm_1.eq)(db_1.tasks.id, id));
            /*
             * The nightly purge has always de-indexed what it removed; this path —
             * the one a person presses — never did, so "Delete forever" destroyed the
             * row and left its title in search for good, pointing at an id that no
             * longer resolves. Same removal, same reason.
             */
            await this.search.removeTask(id).catch(() => undefined);
        }
        else
            await this.db.delete(db_1.docs).where((0, drizzle_orm_1.eq)(db_1.docs.id, id));
        await this.security.logAuditEvent({
            workspaceId, actorId: actor.id, action: 'trash.purged', resourceType: type, resourceId: id,
            description: `Permanently deleted ${type} "${row.name}"`, ipAddress: ip,
        });
        return { ok: true };
    }
    /** Empty the whole workspace trash — admin only. */
    async clearAll(workspaceId, actor, ip) {
        await this.assertAdmin(workspaceId, actor);
        const items = await this.list(workspaceId, actor);
        for (const item of items) {
            try {
                await this.deleteForever(workspaceId, item.type, item.id, actor);
            }
            catch {
                // A parent purge may already have cascaded this row away — keep going.
            }
        }
        await this.security.logAuditEvent({
            workspaceId, actorId: actor.id, action: 'trash.cleared', resourceType: 'workspace', resourceId: workspaceId,
            description: `Emptied the trash (${items.length} item(s))`, ipAddress: ip,
        });
        return { ok: true, removed: items.length };
    }
    // ─── retention ──────────────────────────────────────────────────────────────
    /**
     * Items sit in the Trash for TRASH_RETENTION_DAYS and are then removed for
     * good, matching the "deleted forever after 30 days" promise in the UI.
     */
    async purgeExpired() {
        const cutoff = new Date(Date.now() - exports.TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
        const table = { space: db_1.spaces, folder: db_1.folders, project: db_1.projects, list: db_1.lists, doc: db_1.docs };
        let total = 0;
        for (const type of exports.TRASH_TYPES) {
            /*
             * TASKS PURGE ON `deletedAt`, and only on `deletedAt`.
             *
             * They used to purge on `archivedAt`, which meant archiving a task was a
             * thirty-day countdown to it being destroyed — the one state a person
             * archives a task to avoid. An archived task is now kept until somebody
             * deletes it; only a task that was actually deleted has a clock.
             */
            if (type === 'task') {
                const gone = await this.db
                    .delete(db_1.tasks)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.isNotNull)(db_1.tasks.deletedAt), (0, drizzle_orm_1.lt)(db_1.tasks.deletedAt, cutoff)))
                    .returning({ id: db_1.tasks.id });
                // Binning a task takes it out of the search index, so anything reaching
                // here should already be gone from it. This is the sweep for the ones
                // that are not: any task that reached the bin by a cascade rather than
                // through `binTask`. Without it those documents outlive the row.
                for (const row of gone)
                    await this.search.removeTask(row.id);
                total += gone.length;
                continue;
            }
            const t = table[type];
            const gone = await this.db
                .delete(t)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(t.isArchived, true), (0, drizzle_orm_1.isNotNull)(t.archivedAt), (0, drizzle_orm_1.lt)(t.archivedAt, cutoff)))
                .returning({ id: t.id });
            total += gone.length;
        }
        if (total > 0)
            this.logger.log(`Trash purge removed ${total} item(s) older than ${exports.TRASH_RETENTION_DAYS} days`);
        return { removed: total };
    }
};
exports.TrashService = TrashService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_DAY_AT_4AM, { name: 'trash-purge-expired' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TrashService.prototype, "purgeExpired", null);
exports.TrashService = TrashService = TrashService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, security_service_1.SecurityService,
        search_service_1.SearchService])
], TrashService);
//# sourceMappingURL=trash.service.js.map