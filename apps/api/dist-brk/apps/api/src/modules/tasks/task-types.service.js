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
exports.TaskTypesService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const MAX_NAME = 80;
/** Emoji, or a couple of characters. Long enough for "🚀", short enough not to be a label. */
const MAX_ICON = 8;
/**
 * Task Types — what a row *is*, not what state it is in. "Task", "Campaign",
 * "Invoice", "Bug". ClickUp puts these beside the title; a team's vocabulary
 * for its own work matters more than the settings furniture around it.
 *
 * Workspace-scoped, and every route re-checks membership: the types hang off a
 * workspace, but they are applied from a task, so there is no single resource a
 * guard could key on across both.
 */
let TaskTypesService = class TaskTypesService {
    constructor(db) {
        this.db = db;
    }
    async assertMember(workspaceId, userId) {
        const [m] = await this.db
            .select({ role: db_1.workspaceMembers.role })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)))
            .limit(1);
        if (!m)
            throw new common_1.ForbiddenException('Workspace membership required');
        return m;
    }
    async assertAdmin(workspaceId, userId) {
        const m = await this.assertMember(workspaceId, userId);
        // Editing the vocabulary is an admin act; applying a type is not.
        if (m.role !== 'workspace_admin' && m.role !== 'manager') {
            throw new common_1.ForbiddenException('Only workspace admins can manage task types');
        }
    }
    /** The workspace a task belongs to, walking list → project → space. */
    async workspaceOfTask(taskId) {
        const [row] = await this.db
            .select({ workspaceId: db_1.spaces.workspaceId })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException('Task not found');
        return row.workspaceId;
    }
    clean(body) {
        const name = (body.name ?? '').trim();
        if (!name)
            throw new common_1.BadRequestException('name is required');
        if (name.length > MAX_NAME)
            throw new common_1.BadRequestException(`name must be ${MAX_NAME} characters or fewer`);
        const icon = (body.icon ?? '').trim().slice(0, MAX_ICON) || null;
        const color = (body.color ?? '').trim() || null;
        return { name, icon, color };
    }
    async list(workspaceId, userId) {
        await this.assertMember(workspaceId, userId);
        return this.db
            .select()
            .from(db_1.taskTypes)
            .where((0, drizzle_orm_1.eq)(db_1.taskTypes.workspaceId, workspaceId))
            .orderBy((0, drizzle_orm_1.asc)(db_1.taskTypes.position), (0, drizzle_orm_1.asc)(db_1.taskTypes.createdAt));
    }
    async create(workspaceId, userId, body) {
        await this.assertAdmin(workspaceId, userId);
        const fields = this.clean(body);
        // Append: a new type goes to the end of the picker rather than the top.
        const [{ next } = { next: 0 }] = await this.db
            .select({ next: (0, drizzle_orm_1.sql) `coalesce(max(${db_1.taskTypes.position}), -1) + 1` })
            .from(db_1.taskTypes)
            .where((0, drizzle_orm_1.eq)(db_1.taskTypes.workspaceId, workspaceId));
        if (body.isDefault)
            await this.clearDefault(workspaceId);
        const [row] = await this.db
            .insert(db_1.taskTypes)
            .values({ workspaceId, ...fields, position: Number(next) || 0, isDefault: body.isDefault === true })
            .returning();
        return row;
    }
    /**
     * The partial unique index allows exactly one default per workspace, so a new
     * default has to unset the old one first or the insert/update is rejected by
     * the database. That rejection is the point — the constraint is real, and this
     * is the one place allowed to satisfy it.
     */
    async clearDefault(workspaceId, exceptId) {
        await this.db
            .update(db_1.taskTypes)
            .set({ isDefault: false, updatedAt: new Date() })
            .where(exceptId
            ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskTypes.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.taskTypes.isDefault, true), (0, drizzle_orm_1.ne)(db_1.taskTypes.id, exceptId))
            : (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskTypes.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.taskTypes.isDefault, true)));
    }
    async update(workspaceId, typeId, userId, body) {
        await this.assertAdmin(workspaceId, userId);
        const existing = await this.byId(workspaceId, typeId);
        const set = { updatedAt: new Date() };
        if (body.name !== undefined || body.icon !== undefined || body.color !== undefined) {
            const fields = this.clean({ name: body.name ?? existing.name, icon: body.icon, color: body.color });
            set.name = fields.name;
            if (body.icon !== undefined)
                set.icon = fields.icon;
            if (body.color !== undefined)
                set.color = fields.color;
        }
        if (body.position !== undefined && Number.isInteger(body.position))
            set.position = body.position;
        if (body.isDefault === true)
            await this.clearDefault(workspaceId, typeId);
        if (body.isDefault !== undefined)
            set.isDefault = body.isDefault === true;
        const [row] = await this.db
            .update(db_1.taskTypes)
            .set(set)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskTypes.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.taskTypes.id, typeId)))
            .returning();
        return row;
    }
    /**
     * Deleting a type does not delete the work filed under it — the column is
     * `ON DELETE SET NULL`, so those tasks come back untyped. The count is
     * returned so the UI can say how many were affected rather than doing it
     * silently.
     */
    async remove(workspaceId, typeId, userId) {
        await this.assertAdmin(workspaceId, userId);
        // One lookup, reused: byId already returns the row, and asking twice for
        // the same record to read one boolean off it is two round trips for no
        // reason.
        const existing = await this.byId(workspaceId, typeId);
        const [{ count } = { count: 0 }] = await this.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(db_1.tasks)
            .where((0, drizzle_orm_1.eq)(db_1.tasks.taskTypeId, typeId));
        const wasDefault = existing.isDefault;
        await this.db.delete(db_1.taskTypes).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskTypes.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.taskTypes.id, typeId)));
        // Deleting the default used to leave the workspace with none, and nothing
        // re-nominated one — so every task created afterwards came out untyped,
        // and the create-modal picker and the search filter both went back to
        // hiding themselves. Production reached that state during a deploy check,
        // which is how it was found: "found 0 defaults, expected 1".
        if (wasDefault)
            await this.ensureDefault(workspaceId);
        return { ok: true, untypedTasks: Number(count) || 0 };
    }
    /**
     * Make sure the workspace still has exactly one default, promoting the first
     * remaining type if it has none. A workspace with types but no default is a
     * silently broken state: tasks come out untyped and nothing says why.
     */
    async ensureDefault(workspaceId) {
        const [existing] = await this.db
            .select({ id: db_1.taskTypes.id })
            .from(db_1.taskTypes)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskTypes.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.taskTypes.isDefault, true)))
            .limit(1);
        if (existing)
            return;
        const [candidate] = await this.db
            .select({ id: db_1.taskTypes.id })
            .from(db_1.taskTypes)
            .where((0, drizzle_orm_1.eq)(db_1.taskTypes.workspaceId, workspaceId))
            .orderBy((0, drizzle_orm_1.asc)(db_1.taskTypes.position), (0, drizzle_orm_1.asc)(db_1.taskTypes.createdAt))
            .limit(1);
        if (!candidate)
            return;
        await this.db
            .update(db_1.taskTypes)
            .set({ isDefault: true, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.taskTypes.id, candidate.id));
    }
    /** Scoped by workspace, so a valid id from another tenant reads as missing. */
    async byId(workspaceId, typeId) {
        const [row] = await this.db
            .select()
            .from(db_1.taskTypes)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskTypes.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.taskTypes.id, typeId)))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException('Task type not found');
        return row;
    }
    /** Apply a type to a task, or clear it with `null`. */
    async setForTask(taskId, typeId, userId) {
        const workspaceId = await this.workspaceOfTask(taskId);
        await this.assertMember(workspaceId, userId);
        const type = typeId ? await this.byId(workspaceId, typeId) : null;
        // §1.1 — the type is what a person sets; tasks.isMilestone is what the
        // timeline, list badges and the client portal render from. Moving onto a
        // milestone type has to draw the diamond, and moving off one has to stop
        // drawing it — otherwise the two disagree and the app shows a milestone the
        // Milestone filter cannot find.
        const [row] = await this.db
            .update(db_1.tasks)
            .set({ taskTypeId: typeId, isMilestone: !!type?.isMilestone, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId))
            .returning({ id: db_1.tasks.id, taskTypeId: db_1.tasks.taskTypeId, isMilestone: db_1.tasks.isMilestone });
        return row;
    }
};
exports.TaskTypesService = TaskTypesService;
exports.TaskTypesService = TaskTypesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], TaskTypesService);
//# sourceMappingURL=task-types.service.js.map