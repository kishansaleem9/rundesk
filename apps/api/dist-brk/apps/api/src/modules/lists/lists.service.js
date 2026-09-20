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
exports.ListsService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const container_access_1 = require("../../common/permissions/container-access");
const item_visibility_1 = require("../../common/permissions/item-visibility");
const security_service_1 = require("../security/security.service");
/**
 * Default status pipeline seeded on every new list. Existing lists were
 * back-filled with the same rows in migration `0020_custom_list_statuses.sql`.
 */
const DEFAULT_LIST_STATUSES = [
    { key: 'backlog', name: 'Backlog', color: '#94a3b8', category: 'open', position: 0 },
    { key: 'todo', name: 'To do', color: '#64748b', category: 'open', position: 1 },
    { key: 'in_progress', name: 'In progress', color: '#3b82f6', category: 'in_progress', position: 2 },
    { key: 'in_review', name: 'In review', color: '#a855f7', category: 'in_progress', position: 3 },
    { key: 'done', name: 'Done', color: '#10b981', category: 'closed', position: 4 },
    { key: 'cancelled', name: 'Cancelled', color: '#f43f5e', category: 'closed', position: 5 },
];
let ListsService = class ListsService {
    constructor(db, security) {
        this.db = db;
        this.security = security;
    }
    /**
     * §G15 [22:07] — "yeh pooch raha ke PRIVATE karni hai ke nahi."
     *
     * Visibility is settable at creation, not only afterwards. The column and the
     * update path have always carried it; this endpoint dropped it on the floor,
     * so the only way to get a private list was to create a public one and then
     * change it — which is a window, however short, in which the wrong people
     * can see it. Omitted still means public, exactly as before.
     */
    /**
     * §G15-10 [21:49–21:54] — the container that makes "a List in a Space" work.
     *
     * Resolved, then created if absent. `project_id` on a list is NOT NULL and
     * stays that way: 114 inner joins across 34 files reach a list's workspace
     * through its project — the resource guard among them — so a list with no
     * project would 404 for everybody while quietly disappearing from search,
     * the knowledge index, notifications and reminders. The hierarchy the person
     * sees is Space → List; this is what carries it.
     *
     * The insert races safely. Two people creating a list in the same empty space
     * at once both find nothing and both insert; the partial unique index in
     * migration 0129 lets exactly one win, and the loser re-reads rather than
     * failing — which is why this is written as insert-then-reread and not as a
     * check-then-act.
     */
    async defaultContainerForSpace(spaceId, actorId) {
        const [existing] = await this.db
            .select({ id: db_1.projects.id })
            .from(db_1.projects)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.projects.spaceId, spaceId), (0, drizzle_orm_1.eq)(db_1.projects.isDefaultContainer, true)))
            .limit(1);
        if (existing)
            return existing.id;
        const [space] = await this.db
            .select({ id: db_1.spaces.id })
            .from(db_1.spaces)
            .where((0, drizzle_orm_1.eq)(db_1.spaces.id, spaceId))
            .limit(1);
        if (!space)
            throw new common_1.NotFoundException('Space not found');
        const [made] = await this.db
            .insert(db_1.projects)
            .values({
            spaceId,
            // Never shown. Named rather than blank so anybody reading the table
            // directly can tell what it is and why it is not in the tree.
            name: 'Lists',
            isDefaultContainer: true,
            createdById: actorId ?? null,
        })
            .onConflictDoNothing()
            .returning({ id: db_1.projects.id });
        if (made)
            return made.id;
        const [won] = await this.db
            .select({ id: db_1.projects.id })
            .from(db_1.projects)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.projects.spaceId, spaceId), (0, drizzle_orm_1.eq)(db_1.projects.isDefaultContainer, true)))
            .limit(1);
        if (!won)
            throw new common_1.BadRequestException('could not resolve the space container');
        return won.id;
    }
    /**
     * §G15-10 — the lists that live directly in a space.
     *
     * Everything in the space's hidden container, which is exactly the set that
     * was created by choosing a Space and nothing else.
     */
    async getListsBySpace(spaceId, actor) {
        const [container] = await this.db
            .select({ id: db_1.projects.id })
            .from(db_1.projects)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.projects.spaceId, spaceId), (0, drizzle_orm_1.eq)(db_1.projects.isDefaultContainer, true)))
            .limit(1);
        // No container means nobody has made a space-level list here yet, which is
        // an empty list and not an error.
        if (!container)
            return [];
        return this.getListsByProject(container.id, actor);
    }
    /**
     * §V2-S11 frame `08:50` — "List name taken".
     *
     * The constraint lives in the database (migration 0147, a partial
     * case-insensitive unique index) so two requests racing cannot both win. This
     * check exists so the ANSWER is a 409 with the frame's words rather than a
     * bare Postgres unique-violation surfacing as a 500 — the person typed a
     * name, and what they need back is that the name is taken.
     *
     * Archived lists are excluded, matching the index: a name in the bin does not
     * reserve itself forever.
     */
    async assertListNameFree(projectId, name, exceptListId) {
        const trimmed = name.trim();
        if (!trimmed)
            return;
        const clash = await this.db
            .select({ id: db_1.lists.id })
            .from(db_1.lists)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.lists.projectId, projectId), (0, drizzle_orm_1.eq)(db_1.lists.isArchived, false), (0, drizzle_orm_1.sql) `lower(${db_1.lists.name}) = lower(${trimmed})`, exceptListId ? (0, drizzle_orm_1.ne)(db_1.lists.id, exceptListId) : undefined))
            .limit(1);
        if (clash.length > 0)
            throw new common_1.ConflictException('List name taken');
    }
    async createList(projectId, data, actorId) {
        await this.assertListNameFree(projectId, data.name);
        const result = await this.db
            .insert(db_1.lists)
            .values({
            projectId,
            name: data.name,
            description: data.description,
            visibility: data.visibility ?? 'public',
            createdById: actorId ?? null,
        })
            .returning();
        const list = result[0];
        // Seed the default status pipeline so the list is immediately usable.
        await this.db
            .insert(db_1.listStatuses)
            .values(DEFAULT_LIST_STATUSES.map((s) => ({ listId: list.id, ...s })))
            .onConflictDoNothing();
        return list;
    }
    async getListsByProject(projectId, actor) {
        // §2 per-item privacy: hide private lists the actor may not see.
        let visFilter;
        if (actor) {
            const [ctx] = await this.db
                .select({ workspaceId: db_1.spaces.workspaceId })
                .from(db_1.projects)
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .where((0, drizzle_orm_1.eq)(db_1.projects.id, projectId))
                .limit(1);
            if (ctx) {
                const isManager = await (0, item_visibility_1.resolveIsManager)(this.db, ctx.workspaceId, actor.id, actor.role);
                visFilter = (0, item_visibility_1.listVisibilityFilter)(actor.id, isManager);
            }
        }
        return this.db
            .select()
            .from(db_1.lists)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.lists.projectId, projectId), (0, drizzle_orm_1.eq)(db_1.lists.isArchived, false), visFilter))
            .orderBy((0, drizzle_orm_1.asc)(db_1.lists.position), (0, drizzle_orm_1.asc)(db_1.lists.createdAt));
    }
    /**
     * §V2-02 — every list in a workspace the actor may see.
     *
     * Added for the Planner's "Default list for new tasks" picker (frame
     * `14:10`), which needs to offer the whole workspace. Lists were reachable
     * only per-project and per-space, so a workspace-wide picker would have had
     * to walk every space from the browser — one request per space, and a
     * different visibility answer than the server would give.
     *
     * The same `listVisibilityFilter` the per-project read uses, resolved once
     * for the workspace rather than once per project: a private list you cannot
     * open must not be offerable as the place your tasks land.
     */
    async getListsByWorkspace(workspaceId, actor) {
        let visFilter;
        if (actor) {
            const isManager = await (0, item_visibility_1.resolveIsManager)(this.db, workspaceId, actor.id, actor.role);
            visFilter = (0, item_visibility_1.listVisibilityFilter)(actor.id, isManager);
        }
        return this.db
            .select({ id: db_1.lists.id, name: db_1.lists.name, projectId: db_1.lists.projectId, spaceId: db_1.projects.spaceId })
            .from(db_1.lists)
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.lists.isArchived, false), visFilter))
            .orderBy((0, drizzle_orm_1.asc)(db_1.lists.name));
    }
    /** Reorder lists within a project; writes each list's position to its index. */
    async reorderLists(projectId, orderedIds, actorId) {
        const all = await this.getListsByProject(projectId);
        const validIds = new Set(all.map((l) => l.id));
        const missing = orderedIds.filter((id) => !validIds.has(id));
        if (missing.length > 0) {
            throw new common_1.BadRequestException(`These ids are not lists of this project: ${missing.join(', ')}`);
        }
        if (orderedIds.length !== all.length) {
            throw new common_1.BadRequestException('orderedIds must contain every list of the project exactly once');
        }
        if (actorId && all[0])
            await this.assertManageable(all[0].id, actorId);
        await Promise.all(orderedIds.map((id, position) => this.db.update(db_1.lists).set({ position, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(db_1.lists.id, id))));
        return this.getListsByProject(projectId);
    }
    async getList(listId) {
        const [list] = await this.db
            .select()
            .from(db_1.lists)
            .where((0, drizzle_orm_1.eq)(db_1.lists.id, listId));
        return list ?? null;
    }
    async updateList(listId, data, actorId) {
        if (actorId)
            await this.assertManageable(listId, actorId);
        if (data.visibility !== undefined && data.visibility !== 'public' && data.visibility !== 'private') {
            throw new common_1.BadRequestException('visibility must be public or private');
        }
        // Whitelist updatable columns rather than spreading the untyped body — a
        // stray `position: true` would otherwise hit the integer column and 500.
        const set = { updatedAt: new Date() };
        for (const key of ['name', 'description', 'visibility']) {
            if (data[key] !== undefined)
                set[key] = data[key];
        }
        // Renaming obeys the same rule as creating, or the constraint is half a
        // rule: blocked at the front door and open at the side.
        if (data.name !== undefined) {
            const [owner] = await this.db
                .select({ projectId: db_1.lists.projectId })
                .from(db_1.lists)
                .where((0, drizzle_orm_1.eq)(db_1.lists.id, listId))
                .limit(1);
            if (owner)
                await this.assertListNameFree(owner.projectId, data.name, listId);
        }
        const result = await this.db
            .update(db_1.lists)
            .set(set)
            .where((0, drizzle_orm_1.eq)(db_1.lists.id, listId))
            .returning();
        return result[0];
    }
    async deleteList(listId, actorId, ipAddress) {
        const ctx = actorId ? await this.assertManageable(listId, actorId, 'delete') : null;
        await this.db
            .update(db_1.lists)
            .set({ isArchived: true, archivedAt: new Date(), archivedById: actorId ?? null, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.lists.id, listId));
        if (actorId && ctx) {
            // §13.3 — audit the container deletion (list archival).
            await this.security.logAuditEvent({
                workspaceId: ctx.workspaceId,
                actorId,
                action: 'list.deleted',
                resourceType: 'list',
                resourceId: listId,
                description: `Archived list "${ctx.name}"`,
                ipAddress,
            });
        }
    }
    /**
     * Move a list into another project (its tasks follow). The destination must
     * be in the same workspace and not archived.
     */
    async moveList(listId, targetProjectId, actorId, ipAddress) {
        const src = actorId
            ? await this.assertManageable(listId, actorId)
            : (await this.db
                .select({ name: db_1.lists.name, workspaceId: db_1.spaces.workspaceId, spaceId: db_1.projects.spaceId })
                .from(db_1.lists)
                .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .where((0, drizzle_orm_1.eq)(db_1.lists.id, listId))
                .limit(1))[0];
        if (!src)
            throw new common_1.NotFoundException('List not found');
        const [dest] = await this.db
            .select({ name: db_1.projects.name, workspaceId: db_1.spaces.workspaceId, isArchived: db_1.projects.isArchived })
            .from(db_1.projects)
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.eq)(db_1.projects.id, targetProjectId))
            .limit(1);
        if (!dest)
            throw new common_1.NotFoundException('Target project not found');
        if (dest.workspaceId !== src.workspaceId) {
            throw new common_1.BadRequestException('A list can only be moved within its own workspace');
        }
        if (dest.isArchived)
            throw new common_1.BadRequestException('Cannot move into a deleted project');
        const [row] = await this.db
            .update(db_1.lists)
            .set({ projectId: targetProjectId, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.lists.id, listId))
            .returning();
        if (actorId) {
            await this.security.logAuditEvent({
                workspaceId: src.workspaceId,
                actorId,
                action: 'list.moved',
                resourceType: 'list',
                resourceId: listId,
                description: `Moved list "${src.name}" to project "${dest.name}"`,
                ipAddress,
                metadata: { toProjectId: targetProjectId },
            });
        }
        return row;
    }
    async assertManageable(listId, actorId, action = 'manage') {
        const [row] = await this.db
            .select({
            createdById: db_1.lists.createdById,
            workspaceId: db_1.spaces.workspaceId,
            name: db_1.lists.name,
            spaceId: db_1.projects.spaceId,
        })
            .from(db_1.lists)
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.eq)(db_1.lists.id, listId))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException('List not found');
        await (0, container_access_1.assertCanManageContainer)(this.db, {
            workspaceId: row.workspaceId,
            createdById: row.createdById,
            actorId,
            kind: 'list',
            action,
            // Managers may delete a list only within a space they belong to.
            spaceId: row.spaceId,
        });
        return row;
    }
};
exports.ListsService = ListsService;
exports.ListsService = ListsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, security_service_1.SecurityService])
], ListsService);
//# sourceMappingURL=lists.service.js.map