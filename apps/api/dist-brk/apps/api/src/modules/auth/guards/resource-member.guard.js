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
exports.ResourceMemberGuard = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../../common/database/database.module");
const container_access_guard_helper_1 = require("../../../common/permissions/container-access.guard-helper");
const item_visibility_1 = require("../../../common/permissions/item-visibility");
const uuid_1 = require("../../../common/validation/uuid");
/**
 * Enforces workspace membership for resources nested under a space / project /
 * list / task (which don't carry a `workspaceId` param). Apply AFTER
 * JwtAuthGuard on controllers/routes that read or create those resources but
 * have no other authorization — otherwise any authenticated user could reach
 * another workspace's data by guessing IDs (broken tenant isolation).
 *
 * Resolves the owning workspace from whichever of workspaceId / spaceId /
 * projectId / listId / taskId is present (param first, then body), then checks
 * the caller is a member. super_admin bypasses, matching the other guards.
 */
let ResourceMemberGuard = class ResourceMemberGuard {
    constructor(db) {
        this.db = db;
    }
    async canActivate(ctx) {
        const req = ctx.switchToHttp().getRequest();
        const user = req.user;
        if (!user?.id)
            throw new common_1.ForbiddenException('Not authenticated');
        const resolved = await this.resolveResource(req.params ?? {}, req.body ?? {}, user.id);
        if (!resolved)
            throw new common_1.NotFoundException('Resource not found');
        const { workspaceId, container, item } = resolved;
        if (user.role === 'super_admin') {
            // Still populate workspace context so downstream guards/handlers that read
            // req.workspaceMember.workspaceId (e.g. PermissionsGuard) work for a
            // super_admin acting on a route whose workspace is only derivable here.
            req.workspaceMember = { workspaceId, userId: user.id, role: 'super_admin' };
            return true;
        }
        const [member] = await this.db
            .select({ role: db_1.workspaceMembers.role })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, user.id)))
            .limit(1);
        if (!member)
            throw new common_1.ForbiddenException('You are not a member of this workspace');
        // Private-container enforcement: a workspace member still needs container
        // membership to reach a private space/project. Public containers pass.
        if (container) {
            const ok = await (0, container_access_guard_helper_1.checkContainerAccess)(this.db, container, {
                userId: user.id,
                workspaceRole: member.role,
            });
            if (!ok)
                throw new common_1.ForbiddenException('This space or project is private');
        }
        // Per-item privacy (§2): a private list, or a private/foreign task, is only
        // reachable by its creator, a task assignee, or a workspace manager/admin.
        if (item) {
            const isManager = (0, item_visibility_1.isManagerRole)(member.role);
            if (item.listVisibility !== undefined &&
                !(0, item_visibility_1.canSeePrivateItem)({ visibility: item.listVisibility, createdById: item.listCreatedById }, { userId: user.id, isManager })) {
                throw new common_1.ForbiddenException('This list is private');
            }
            if (item.taskVisibility !== undefined &&
                !(0, item_visibility_1.canSeePrivateItem)({ visibility: item.taskVisibility, createdById: item.taskCreatedById }, { userId: user.id, isManager, isAssignee: item.taskIsAssignee })) {
                throw new common_1.ForbiddenException('This task is private');
            }
        }
        req.workspaceMember = { ...member, workspaceId, userId: user.id };
        return true;
    }
    async resolveResource(p, b, actorId) {
        // Path params identify the *resource being acted on* and take priority over
        // body fields (which can be attacker-supplied) — e.g. POST /sprints/:id/tasks
        // must be authorized against the sprint's workspace, not the body's taskId.
        // Containers (goal/sprint/view) are checked before taskId so nested task
        // routes still resolve correctly.
        const order = [
            [p.workspaceId, 'ws'],
            [p.spaceId, 'space'],
            [p.projectId, 'project'],
            [p.listId, 'list'],
            [p.goalId, 'goal'],
            [p.sprintId, 'sprint'],
            [p.viewId, 'view'],
            [p.labelId, 'label'],
            [p.taskId, 'task'],
            [typeof b.workspaceId === 'string' ? b.workspaceId : undefined, 'ws'],
            [typeof b.spaceId === 'string' ? b.spaceId : undefined, 'space'],
            [typeof b.projectId === 'string' ? b.projectId : undefined, 'project'],
            [typeof b.listId === 'string' ? b.listId : undefined, 'list'],
            [typeof b.taskId === 'string' ? b.taskId : undefined, 'task'],
        ];
        for (const [id, kind] of order) {
            if (!id)
                continue;
            /*
             * Every id below addresses a `uuid` column, so a value that cannot be one
             * is a query Postgres will refuse rather than a lookup that misses. It
             * showed up in CI as pages of `invalid input syntax for type uuid:
             * "dashboards"`, from a URL that had fallen through to a route it was
             * never meant to match.
             *
             * Rejected rather than skipped: falling through to the next candidate
             * would let a malformed path param be answered by a body field, which is
             * exactly the precedence this table exists to prevent. The 400 is what
             * the failed query already produced, so no caller sees a new answer.
             */
            if (!(0, uuid_1.isUuid)(id))
                throw new common_1.BadRequestException(`Malformed ${kind} id`);
            return this.resolveByKind(kind, id, actorId);
        }
        return null;
    }
    async resolveByKind(kind, id, actorId) {
        if (kind === 'ws')
            return { workspaceId: id };
        if (kind === 'label') {
            const [r] = await this.db.select({ w: db_1.labels.workspaceId }).from(db_1.labels).where((0, drizzle_orm_1.eq)(db_1.labels.id, id)).limit(1);
            return r ? { workspaceId: r.w } : null;
        }
        if (kind === 'goal') {
            const [r] = await this.db.select({ w: db_1.goals.workspaceId }).from(db_1.goals).where((0, drizzle_orm_1.eq)(db_1.goals.id, id)).limit(1);
            return r ? { workspaceId: r.w } : null;
        }
        if (kind === 'sprint') {
            const [r] = await this.db.select({ w: db_1.sprints.workspaceId }).from(db_1.sprints).where((0, drizzle_orm_1.eq)(db_1.sprints.id, id)).limit(1);
            return r ? { workspaceId: r.w } : null;
        }
        // Container-nested kinds: resolve the space + (optional) project visibility
        // chain in the same query so private access can be enforced.
        if (kind === 'space') {
            const [r] = await this.db
                .select({ w: db_1.spaces.workspaceId, spaceId: db_1.spaces.id, sv: db_1.spaces.visibility })
                .from(db_1.spaces)
                .where((0, drizzle_orm_1.eq)(db_1.spaces.id, id))
                .limit(1);
            return r
                ? { workspaceId: r.w, container: { spaceId: r.spaceId, spaceVisibility: r.sv } }
                : null;
        }
        if (kind === 'project') {
            const [r] = await this.db
                .select({ w: db_1.spaces.workspaceId, spaceId: db_1.spaces.id, sv: db_1.spaces.visibility, projectId: db_1.projects.id, pv: db_1.projects.visibility })
                .from(db_1.projects)
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .where((0, drizzle_orm_1.eq)(db_1.projects.id, id))
                .limit(1);
            return r
                ? { workspaceId: r.w, container: { spaceId: r.spaceId, spaceVisibility: r.sv, projectId: r.projectId, projectVisibility: r.pv } }
                : null;
        }
        if (kind === 'list') {
            const [r] = await this.db
                .select({ w: db_1.spaces.workspaceId, spaceId: db_1.spaces.id, sv: db_1.spaces.visibility, projectId: db_1.projects.id, pv: db_1.projects.visibility, lv: db_1.lists.visibility, lc: db_1.lists.createdById })
                .from(db_1.lists)
                .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .where((0, drizzle_orm_1.eq)(db_1.lists.id, id))
                .limit(1);
            return r
                ? {
                    workspaceId: r.w,
                    container: { spaceId: r.spaceId, spaceVisibility: r.sv, projectId: r.projectId, projectVisibility: r.pv },
                    item: { listVisibility: r.lv, listCreatedById: r.lc },
                }
                : null;
        }
        if (kind === 'task') {
            const [r] = await this.db
                .select({
                w: db_1.spaces.workspaceId, spaceId: db_1.spaces.id, sv: db_1.spaces.visibility, projectId: db_1.projects.id, pv: db_1.projects.visibility,
                lv: db_1.lists.visibility, lc: db_1.lists.createdById, tv: db_1.tasks.visibility, tc: db_1.tasks.createdById,
                isAssignee: (0, drizzle_orm_1.sql) `exists (select 1 from task_assignees ta where ta.task_id = ${db_1.tasks.id} and ta.user_id = ${actorId})`,
            })
                .from(db_1.tasks)
                .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
                .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .where((0, drizzle_orm_1.eq)(db_1.tasks.id, id))
                .limit(1);
            return r
                ? {
                    workspaceId: r.w,
                    container: { spaceId: r.spaceId, spaceVisibility: r.sv, projectId: r.projectId, projectVisibility: r.pv },
                    item: {
                        listVisibility: r.lv,
                        listCreatedById: r.lc,
                        taskVisibility: r.tv,
                        taskCreatedById: r.tc,
                        taskIsAssignee: Boolean(r.isAssignee),
                    },
                }
                : null;
        }
        if (kind === 'view') {
            const [r] = await this.db
                .select({ w: db_1.spaces.workspaceId, spaceId: db_1.spaces.id, sv: db_1.spaces.visibility, projectId: db_1.projects.id, pv: db_1.projects.visibility, lv: db_1.lists.visibility, lc: db_1.lists.createdById })
                .from(db_1.taskViews)
                .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.taskViews.listId))
                .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .where((0, drizzle_orm_1.eq)(db_1.taskViews.id, id))
                .limit(1);
            return r
                ? {
                    workspaceId: r.w,
                    container: { spaceId: r.spaceId, spaceVisibility: r.sv, projectId: r.projectId, projectVisibility: r.pv },
                    item: { listVisibility: r.lv, listCreatedById: r.lc },
                }
                : null;
        }
        return null;
    }
};
exports.ResourceMemberGuard = ResourceMemberGuard;
exports.ResourceMemberGuard = ResourceMemberGuard = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], ResourceMemberGuard);
//# sourceMappingURL=resource-member.guard.js.map