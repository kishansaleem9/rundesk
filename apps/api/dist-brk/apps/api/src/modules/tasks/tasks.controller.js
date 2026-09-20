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
exports.TasksController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const resource_member_guard_1 = require("../auth/guards/resource-member.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const tasks_service_1 = require("./tasks.service");
const plans_service_1 = require("../plans/plans.service");
const email_to_task_service_1 = require("../email-to-task/email-to-task.service");
const task_dto_1 = require("./dto/task.dto");
let TasksController = class TasksController {
    constructor(tasks, emailToTask, plans) {
        this.tasks = tasks;
        this.emailToTask = emailToTask;
        this.plans = plans;
    }
    /**
     * §V2-13, frames `09:26` / `10:42` — REFUSE, don't hide.
     *
     * A paywall the browser draws is not a paywall; it is a `display:none` with a
     * price on it. Both gated surfaces below therefore run this first, and the
     * client's modal is the courtesy, not the control.
     *
     * Fails OPEN on a list whose workspace cannot be resolved, matching
     * `PlanFeatureGuard`: gating must never break a read that used to work, and a
     * list with no workspace is a database problem, not an entitlement one.
     */
    async assertPlanFeature(listId, feature) {
        const workspaceId = await this.tasks.workspaceIdForList(listId);
        if (!workspaceId)
            return;
        await this.plans.assertFeature(workspaceId, feature);
    }
    /**
     * §V2-13, frame `09:26` — the rows Team View draws, and the 403 it gets
     * instead when the workspace's plan does not include it.
     */
    async getTeamView(listId, user, includeArchived, unassignedLabel) {
        await this.assertPlanFeature(listId, 'teamView');
        return this.tasks.getTeamRollup(listId, { id: user.id, role: user.role }, {
            includeArchived: includeArchived === 'true',
            // The caller's own word for "nobody", so the row reads in the language
            // the rest of the page is in. Bounded, because it lands in a response.
            unassignedLabel: unassignedLabel ? unassignedLabel.slice(0, 60) : undefined,
        });
    }
    async getTimeline(workspaceId, user, projectId) {
        return this.tasks.getTimelineForWorkspace(workspaceId, {
            ...(projectId ? { projectId } : {}),
            actor: { id: user.id, role: user.role },
        });
    }
    async getWorkspaceTasks(workspaceId, user, limit, assigneeId) {
        // Pass the caller so the listing is scoped to containers they can access
        // (the guard only checks workspace membership, not private space/project
        // membership).
        return this.tasks.getTasksForWorkspace(workspaceId, limit ? Number(limit) : 500, {
            actorId: user.id,
            actorRole: user.role,
            /*
             * `assigneeId=me` rather than a raw id: this narrows to the caller, and
             * accepting an arbitrary id here would turn a workspace listing into a
             * way to read any colleague's workload without a separate permission
             * check. The member-scoped endpoint below is the one for that.
             */
            assigneeId: assigneeId === 'me' ? user.id : undefined,
        });
    }
    async getMemberTasks(workspaceId, userId) {
        return this.tasks.getTasksForMember(workspaceId, userId);
    }
    /**
     * §V2-07 — "Customize → Export view → Download".
     *
     * `ResourceMemberGuard`, not `WorkspaceAdminGuard`. The existing export is
     * admin-only and dumps the whole workspace, so the person actually looking at
     * a list — usually not an admin — had no way to download it. Exporting the
     * list you can already read gives away nothing you could not read.
     */
    async exportList(listId, user, res, columns, fields, format, dateFormat, timeFormat, includeArchived, includeClosed, view) {
        const mode = columns === 'names' || columns === 'all' ? columns : 'visible';
        /*
         * §V2-13 `[10:42]`–`[10:49]` — ONLY the board download is paid.
         *
         * "agar aap ke paas premium nahi [hai] to aap LIST VIEW download karo" is
         * the requirement, so the assertion is deliberately inside this branch: no
         * `view`, or any value that is not `board`, is the export that has always
         * been free and stays free, and the narrowness of this `if` is the thing
         * that stops the gate spreading.
         */
        const boardShaped = view === 'board';
        if (boardShaped)
            await this.assertPlanFeature(listId, 'boardExport');
        const out = await this.tasks.exportListView(listId, { id: user.id, role: user.role }, {
            columns: mode,
            fields: fields ? fields.split(',').filter(Boolean) : undefined,
            format: format === 'xlsx' ? 'xlsx' : 'csv',
            // Unrecognised values fall back inside the service rather than 400ing:
            // a stale bookmark should still download the list.
            dateFormat: dateFormat,
            timeFormat: timeFormat,
            includeArchived: includeArchived === 'true',
            includeClosed: includeClosed !== 'false',
            view: boardShaped ? 'board' : 'list',
        });
        // Quoted, and stripped of anything that could end the header early: a list
        // named `"; drop` would otherwise break the Content-Disposition it lands in.
        const safeName = out.name.replace(/[^\w \-.]/g, '').trim() || 'list';
        res.header('Content-Type', out.contentType);
        res.header('Content-Disposition', `attachment; filename="${safeName}.${out.extension}"`);
        res.send(out.body);
    }
    async getByList(listId, user, includeSubtasks, includeArchived) {
        return this.tasks.getTasksByList(listId, {
            includeSubtasks: includeSubtasks === 'true',
            includeArchived: includeArchived === 'true',
        }, { id: user.id, role: user.role });
    }
    async getOne(taskId) {
        return this.tasks.getTask(taskId);
    }
    async getSubtasks(taskId, user) {
        return this.tasks.listSubtasks(taskId, { id: user.id, role: user.role });
    }
    async getTaskNavigation(taskId) {
        return this.tasks.getTaskNavigation(taskId);
    }
    async create(user, body) {
        return this.tasks.createTask({
            listId: body.listId,
            title: body.title,
            description: body.description,
            priority: body.priority,
            status: body.status,
            position: body.position,
            startDate: body.startDate ? new Date(body.startDate) : undefined,
            dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
            timeEstimate: body.timeEstimate,
            parentTaskId: body.parentTaskId,
            assigneeIds: body.assigneeIds,
            labelIds: body.labelIds,
            // §1.1 — this handler builds the argument field by field, so a field
            // added to the DTO and honoured by the service still goes nowhere unless
            // it is named here. taskTypeId was accepted by the DTO, validated and
            // used by createTask, and dropped in between: choosing a type on create
            // has never once applied.
            taskTypeId: body.taskTypeId,
            createdById: user.id,
        });
    }
    async update(taskId, user, body) {
        const toDate = (label, value) => {
            if (!value)
                return null;
            const d = new Date(value);
            if (Number.isNaN(d.getTime()))
                throw new common_1.BadRequestException(`${label} is not a valid date`);
            return d;
        };
        // Type-check the non-string fields before they reach the DB. The body is an
        // untyped inline shape (no DTO), so e.g. `position: true` would otherwise hit
        // the integer column and 500 with a Postgres type error instead of a 400.
        if (body.position !== undefined && (typeof body.position !== 'number' || !Number.isInteger(body.position))) {
            throw new common_1.BadRequestException('position must be an integer');
        }
        if (body.timeEstimate !== undefined && body.timeEstimate !== null && typeof body.timeEstimate !== 'number') {
            throw new common_1.BadRequestException('timeEstimate must be a number or null');
        }
        for (const flag of ['isArchived', 'isMilestone']) {
            if (body[flag] !== undefined && typeof body[flag] !== 'boolean') {
                throw new common_1.BadRequestException(`${flag} must be a boolean`);
            }
        }
        if (body.visibility !== undefined && body.visibility !== 'public' && body.visibility !== 'private') {
            throw new common_1.BadRequestException('visibility must be public or private');
        }
        const patch = { ...body };
        if ('startDate' in body)
            patch.startDate = toDate('startDate', body.startDate);
        if ('dueDate' in body)
            patch.dueDate = toDate('dueDate', body.dueDate);
        return this.tasks.updateTask(taskId, user.id, patch);
    }
    async bulkUpdate(user, body) {
        if (!Array.isArray(body?.taskIds) || body.taskIds.length === 0) {
            throw new common_1.BadRequestException('taskIds must be a non-empty array');
        }
        if (!body.patch || typeof body.patch !== 'object') {
            throw new common_1.BadRequestException('patch object is required');
        }
        const patch = { ...body.patch };
        if ('startDate' in body.patch)
            patch.startDate = body.patch.startDate ? new Date(body.patch.startDate) : null;
        if ('dueDate' in body.patch)
            patch.dueDate = body.patch.dueDate ? new Date(body.patch.dueDate) : null;
        return this.tasks.bulkUpdateTasks(body.taskIds, user.id, patch);
    }
    async createNextRecurring(taskId, user, body) {
        return this.tasks.createNextRecurringOccurrence(taskId, user.id, body.cadenceDays ?? null, body.recurrenceRule ?? null, body.preserveAssignees ?? true);
    }
    // Persist (or clear) a task's recurrence so completing it auto-creates the
    // next occurrence. Body: { cadenceDays } | { rule } | null (to clear).
    async setRecurrence(taskId, user, body) {
        const config = body && (body.cadenceDays != null || body.rule != null)
            ? { cadenceDays: body.cadenceDays ?? null, rule: body.rule ?? null }
            : null;
        return this.tasks.setRecurrence(taskId, user.id, config);
    }
    async move(taskId, user, body) {
        return this.tasks.moveTask(taskId, user.id, body.listId, body.position);
    }
    /**
     * §V2-08 `[15:27]` — "yahan par aap ko HISTORY wagera sab cheezein show hoti
     * hain". What this task's description used to say.
     */
    /**
     * §V2-08, frame `15:32` — Merge.
     *
     * `:taskId` is the task being merged AWAY and `targetTaskId` the survivor:
     * "merge this into that", which is the direction the menu item reads in.
     * Both ids go through `ResourceMemberGuard` — the param one here, the body
     * one inside the service, which also checks write access to it. Merging is a
     * write to the target as much as to the source.
     */
    merge(taskId, user, body) {
        return this.tasks.mergeTask(taskId, body.targetTaskId, user.id);
    }
    /**
     * §V2-08, frame `15:32` — "Send email to task". The address that turns an
     * email into a comment on this task. It has worked since email-to-task was
     * written; nothing has ever told anybody it exists.
     */
    emailAddress(taskId) {
        return this.emailToTask.taskEmailAddress(taskId);
    }
    descriptionHistory(taskId) {
        return this.tasks.listDescriptionRevisions(taskId);
    }
    restoreDescription(taskId, revisionId, user) {
        return this.tasks.restoreDescriptionRevision(taskId, revisionId, user.id);
    }
    /**
     * ARCHIVE. Reversible, kept for good, listed under
     * `GET /workspaces/:id/archived-tasks`. The verb is historical — see
     * `deleteTask` — and the menu row that fires this says "Archive".
     */
    async delete(taskId, user, ip) {
        return this.tasks.deleteTask(taskId, user.id, ip);
    }
    /**
     * §V2-08 frame `15:32` — **DELETE**, the row under Archive.
     *
     * POST rather than a second DELETE because `DELETE /tasks/:id` is taken by
     * archiving, and overloading it on a query flag is how a destructive action
     * ends up one typo away from the reversible one.
     *
     * Moves the task into the workspace Trash: restorable from there via
     * `POST /workspaces/:id/trash/task/:taskId/restore`, permanently removed by
     * `DELETE /workspaces/:id/trash/task/:taskId`, and purged automatically after
     * the retention window the response reports.
     */
    async moveToTrash(taskId, user, ip) {
        return this.tasks.binTask(taskId, user.id, ip);
    }
    /** Un-archive. Refuses a task that is in the Trash — that restore is the trash one. */
    async restore(taskId, user) {
        return this.tasks.restoreTask(taskId, user.id);
    }
    // --- Assignees ----------------------------------------------------------
    async addAssignee(taskId, user, body) {
        return this.tasks.addAssignee(taskId, body.userId, user.id);
    }
    async removeAssignee(taskId, userId, actor) {
        return this.tasks.removeAssignee(taskId, userId, actor.id);
    }
    // --- Labels -------------------------------------------------------------
    async addLabel(taskId, labelId, user) {
        return this.tasks.addLabel(taskId, labelId, user.id);
    }
    async removeLabel(taskId, labelId, user) {
        return this.tasks.removeLabel(taskId, labelId, user.id);
    }
    // --- Linked docs --------------------------------------------------------
    async listLinkedDocs(taskId, user) {
        return this.tasks.listLinkedDocs(taskId, user.id);
    }
    async linkDoc(taskId, user, body) {
        return this.tasks.linkDoc(taskId, body.docId, user.id);
    }
    async unlinkDoc(taskId, docId, user) {
        return this.tasks.unlinkDoc(taskId, docId, user.id);
    }
    // --- Watchers -----------------------------------------------------------
    async addWatcher(taskId, body, user) {
        // §2.2 — the actor has to reach the service or the follower-changed
        // notification cannot leave them out, and they would be told about their
        // own click.
        return this.tasks.addWatcher(taskId, body.userId, user.id);
    }
    async removeWatcher(taskId, userId, user) {
        return this.tasks.removeWatcher(taskId, userId, user.id);
    }
    // --- Attachments ---------------------------------------------------------
    // Listing returns working signed R2 download URLs, so it needs the same
    // membership + private-container gate as viewing the task (ResourceMemberGuard,
    // mirroring the GET read routes). The service re-asserts read access as
    // defense-in-depth.
    async listAttachments(taskId, user) {
        return this.tasks.listAttachments(taskId, user.id);
    }
    async addAttachment(taskId, user, body) {
        return this.tasks.addAttachment(taskId, user.id, body);
    }
    async presignAttachmentUpload(taskId, user, body) {
        return this.tasks.createAttachmentUploadUrl(taskId, user.id, {
            fileName: body.fileName,
            contentType: body.contentType ?? 'application/octet-stream',
            sizeBytes: body.sizeBytes,
        });
    }
    async removeAttachment(taskId, attachmentId, user) {
        return this.tasks.removeAttachment(taskId, attachmentId, user.id);
    }
};
exports.TasksController = TasksController;
__decorate([
    (0, common_1.Get)('list/:listId/team'),
    (0, common_1.UseGuards)(resource_member_guard_1.ResourceMemberGuard),
    __param(0, (0, common_1.Param)('listId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('includeArchived')),
    __param(3, (0, common_1.Query)('unassignedLabel')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "getTeamView", null);
__decorate([
    (0, common_1.Get)('workspace/:workspaceId/timeline'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('projectId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "getTimeline", null);
__decorate([
    (0, common_1.Get)('workspace/:workspaceId'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('limit')),
    __param(3, (0, common_1.Query)('assigneeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "getWorkspaceTasks", null);
__decorate([
    (0, common_1.Get)('workspace/:workspaceId/members/:userId'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "getMemberTasks", null);
__decorate([
    (0, common_1.Get)('list/:listId/export'),
    (0, common_1.UseGuards)(resource_member_guard_1.ResourceMemberGuard),
    __param(0, (0, common_1.Param)('listId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Res)()),
    __param(3, (0, common_1.Query)('columns')),
    __param(4, (0, common_1.Query)('fields')),
    __param(5, (0, common_1.Query)('format')),
    __param(6, (0, common_1.Query)('dateFormat')),
    __param(7, (0, common_1.Query)('timeFormat')),
    __param(8, (0, common_1.Query)('includeArchived')),
    __param(9, (0, common_1.Query)('includeClosed')),
    __param(10, (0, common_1.Query)('view')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, String, String, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "exportList", null);
__decorate([
    (0, common_1.Get)('list/:listId'),
    (0, common_1.UseGuards)(resource_member_guard_1.ResourceMemberGuard),
    __param(0, (0, common_1.Param)('listId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('includeSubtasks')),
    __param(3, (0, common_1.Query)('includeArchived')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "getByList", null);
__decorate([
    (0, common_1.Get)(':taskId'),
    (0, common_1.UseGuards)(resource_member_guard_1.ResourceMemberGuard),
    __param(0, (0, common_1.Param)('taskId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "getOne", null);
__decorate([
    (0, common_1.Get)(':taskId/subtasks'),
    (0, common_1.UseGuards)(resource_member_guard_1.ResourceMemberGuard),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "getSubtasks", null);
__decorate([
    (0, common_1.Get)(':taskId/navigation'),
    (0, common_1.UseGuards)(resource_member_guard_1.ResourceMemberGuard),
    __param(0, (0, common_1.Param)('taskId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "getTaskNavigation", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(resource_member_guard_1.ResourceMemberGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, task_dto_1.CreateTaskDto]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':taskId'),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "update", null);
__decorate([
    (0, common_1.Patch)('bulk/update'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "bulkUpdate", null);
__decorate([
    (0, common_1.Post)(':taskId/recurring/next'),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "createNextRecurring", null);
__decorate([
    (0, common_1.Put)(':taskId/recurrence'),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "setRecurrence", null);
__decorate([
    (0, common_1.Post)(':taskId/move'),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "move", null);
__decorate([
    (0, common_1.Post)(':taskId/merge'),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "merge", null);
__decorate([
    (0, common_1.Get)(':taskId/email-address'),
    __param(0, (0, common_1.Param)('taskId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "emailAddress", null);
__decorate([
    (0, common_1.Get)(':taskId/description-history'),
    __param(0, (0, common_1.Param)('taskId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "descriptionHistory", null);
__decorate([
    (0, common_1.Post)(':taskId/description-history/:revisionId/restore'),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, common_1.Param)('revisionId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "restoreDescription", null);
__decorate([
    (0, common_1.Delete)(':taskId'),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Ip)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "delete", null);
__decorate([
    (0, common_1.Post)(':taskId/trash'),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Ip)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "moveToTrash", null);
__decorate([
    (0, common_1.Post)(':taskId/restore'),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "restore", null);
__decorate([
    (0, common_1.Post)(':taskId/assignees'),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "addAssignee", null);
__decorate([
    (0, common_1.Delete)(':taskId/assignees/:userId'),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, common_1.Param)('userId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "removeAssignee", null);
__decorate([
    (0, common_1.Post)(':taskId/labels/:labelId'),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, common_1.Param)('labelId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "addLabel", null);
__decorate([
    (0, common_1.Delete)(':taskId/labels/:labelId'),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, common_1.Param)('labelId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "removeLabel", null);
__decorate([
    (0, common_1.Get)(':taskId/linked-docs'),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "listLinkedDocs", null);
__decorate([
    (0, common_1.Post)(':taskId/linked-docs'),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "linkDoc", null);
__decorate([
    (0, common_1.Delete)(':taskId/linked-docs/:docId'),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, common_1.Param)('docId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "unlinkDoc", null);
__decorate([
    (0, common_1.Post)(':taskId/watchers'),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "addWatcher", null);
__decorate([
    (0, common_1.Delete)(':taskId/watchers/:userId'),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, common_1.Param)('userId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "removeWatcher", null);
__decorate([
    (0, common_1.Get)(':taskId/attachments'),
    (0, common_1.UseGuards)(resource_member_guard_1.ResourceMemberGuard),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "listAttachments", null);
__decorate([
    (0, common_1.Post)(':taskId/attachments'),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, task_dto_1.AddAttachmentDto]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "addAttachment", null);
__decorate([
    (0, common_1.Post)(':taskId/attachments/presign'),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "presignAttachmentUpload", null);
__decorate([
    (0, common_1.Delete)(':taskId/attachments/:attachmentId'),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, common_1.Param)('attachmentId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "removeAttachment", null);
exports.TasksController = TasksController = __decorate([
    (0, swagger_1.ApiTags)('tasks'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('tasks'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [tasks_service_1.TasksService,
        email_to_task_service_1.EmailToTaskService,
        plans_service_1.PlansService])
], TasksController);
//# sourceMappingURL=tasks.controller.js.map