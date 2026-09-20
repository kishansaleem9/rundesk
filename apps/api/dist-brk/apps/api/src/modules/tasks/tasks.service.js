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
exports.TasksService = exports.MAX_ATTACHMENT_BYTES = void 0;
exports.humanizeFieldValue = humanizeFieldValue;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
// One source of truth for "how long the bin keeps things". The task delete
// below reports it to the caller so the confirmation can say thirty days
// without a second copy of the number drifting away from the purge job's.
const trash_service_1 = require("../trash/trash.service");
const csv_1 = require("../../common/export/csv");
const xlsx_1 = require("../../common/export/xlsx");
const datetime_1 = require("../../common/export/datetime");
const external_links_util_1 = require("./external-links.util");
const comment_summary_1 = require("./comment-summary");
const mention_access_1 = require("./mention-access");
const task_merge_1 = require("./task-merge");
const status_resolution_1 = require("../../common/statuses/status-resolution");
const item_visibility_1 = require("../../common/permissions/item-visibility");
const public_user_1 = require("../../common/permissions/public-user");
const safe_fetch_1 = require("../../common/http/safe-fetch");
const realtime_gateway_1 = require("../realtime/realtime.gateway");
const search_service_1 = require("../search/search.service");
const automations_service_1 = require("../automations/automations.service");
const webhooks_service_1 = require("../webhooks/webhooks.service");
const slack_service_1 = require("../integrations/slack/slack.service");
const notifications_service_1 = require("../notifications/notifications.service");
const r2_service_1 = require("../../common/storage/r2.service");
const calendar_sync_service_1 = require("../calendar-sync/calendar-sync.service");
const security_service_1 = require("../security/security.service");
/**
 * §A2.8 — render a status/priority key for a notification body. Status keys are
 * per-list slugs (`in_review`), so there is no catalogue to look them up in;
 * de-slugging is what the rest of the product does with them too.
 */
function humanizeFieldValue(value) {
    const spaced = value.replace(/[_-]+/g, ' ').trim();
    if (!spaced)
        return value;
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
/** Hard cap on a single task/comment attachment (Plan §4). */
exports.MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024; // 100 MB
/**
 * §V2-08 — how long consecutive edits by one person collapse into one entry of
 * description history.
 *
 * Two minutes, matching `doc_revisions`. Somebody fixing a typo, then a second
 * typo, then reordering a sentence is doing one thing, and a history that
 * records it as three is a history nobody scrolls. Longer than this and two
 * genuinely separate visits to the same task get merged, which loses the
 * intermediate text for real.
 */
const DESCRIPTION_REVISION_WINDOW_MS = 2 * 60 * 1000;
let TasksService = class TasksService {
    constructor(db, realtime, search, automations, webhooks, slack, notifications, r2, calendarSync, security) {
        this.db = db;
        this.realtime = realtime;
        this.search = search;
        this.automations = automations;
        this.webhooks = webhooks;
        this.slack = slack;
        this.notifications = notifications;
        this.r2 = r2;
        this.calendarSync = calendarSync;
        this.security = security;
    }
    /**
     * Best-effort push of a task to every connected calendar in its workspace.
     * Swallowed errors keep task writes fast; failures surface via the
     * connection's status field on the next sync poll.
     */
    fireCalendarPush(taskId) {
        void this.calendarSync.pushTask(taskId).catch(() => undefined);
    }
    /**
     * Best-effort fan-out of a task event to automations + webhooks.
     * Errors are logged but never propagated — task ops must not break
     * because a webhook URL is down.
     */
    async fireTaskEvent(eventType, workspaceId, payload, triggerCtx = {}) {
        try {
            await this.automations.fire(eventType, { workspaceId, ...triggerCtx });
        }
        catch (e) {
            // eslint-disable-next-line no-console
            console.error(`[automations.fire] ${eventType} failed:`, e);
        }
        try {
            await this.webhooks.fire(workspaceId, eventType, payload);
        }
        catch (e) {
            // eslint-disable-next-line no-console
            console.error(`[webhooks.fire] ${eventType} failed:`, e);
        }
        try {
            await this.slack.notify(workspaceId, eventType, this.formatSlackMessage(eventType, payload), {
                projectId: triggerCtx.projectId,
            });
        }
        catch (e) {
            // eslint-disable-next-line no-console
            console.error(`[slack.notify] ${eventType} failed:`, e);
        }
    }
    formatSlackMessage(eventType, payload) {
        const task = payload.task ?? null;
        const title = task?.title ?? 'a task';
        switch (eventType) {
            case 'task.created':
                return `:sparkles: New task created: *${title}*`;
            case 'task.status_changed':
                return `:arrows_counterclockwise: *${title}* → ${payload.to ?? '?'}`;
            case 'task.assigned':
                return `:bust_in_silhouette: *${title}* was assigned to a teammate`;
            case 'task.deleted':
                return `:wastebasket: Task archived: *${title}*`;
            default:
                return `:bell: ${eventType} — ${title}`;
        }
    }
    async resolveWorkspaceForList(listId) {
        const [row] = await this.db
            .select({ workspaceId: db_1.spaces.workspaceId, spaceId: db_1.spaces.id, projectId: db_1.lists.projectId })
            .from(db_1.lists)
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.eq)(db_1.lists.id, listId))
            .limit(1);
        return row ?? null;
    }
    /**
     * §V2-13 — the workspace a list belongs to, for callers outside this service.
     *
     * The paywall is enforced in the controller (where PlansService is injected,
     * so the ten unit tests that construct this service positionally keep
     * working), and a plan is a property of the WORKSPACE, not of the list. This
     * is the one fact the controller is missing.
     */
    async workspaceIdForList(listId) {
        const ctx = await this.resolveWorkspaceForList(listId);
        return ctx?.workspaceId ?? null;
    }
    async resolveWorkspaceName(workspaceId) {
        const [row] = await this.db
            .select({ name: db_1.workspaces.name })
            .from(db_1.workspaces)
            .where((0, drizzle_orm_1.eq)(db_1.workspaces.id, workspaceId))
            .limit(1);
        return row?.name ?? 'Rundesk';
    }
    buildTaskUrl(workspaceId, spaceId, projectId, listId, taskId) {
        return `/app/${workspaceId}/${spaceId}/${projectId}/${listId}?task=${taskId}`;
    }
    /**
     * G10-11 [12:38–12:41] — a subtask appeared under a task you are on.
     *
     * The audience is the PARENT's watchers and assignees, which is the only
     * honest one available: her list pairs this with "Task created", which fires
     * to people following a List, and there is no list-follow concept here. So
     * this ships and that one waits, rather than adding a notification kind with
     * nothing behind it.
     *
     * Off by default (see DEFAULT_PRIMARY_TYPES) — worth being able to turn on,
     * not worth interrupting anybody who did not ask.
     */
    async notifySubtaskCreated(parentTaskId, subtaskId, subtaskTitle, actorId) {
        const [parent] = await this.db
            .select({ id: db_1.tasks.id, title: db_1.tasks.title, listId: db_1.tasks.listId })
            .from(db_1.tasks)
            .where((0, drizzle_orm_1.eq)(db_1.tasks.id, parentTaskId))
            .limit(1);
        if (!parent)
            return;
        const ctx = await this.resolveWorkspaceForList(parent.listId);
        if (!ctx)
            return;
        const [watchers, assignees] = await Promise.all([
            this.db.select({ userId: db_1.taskWatchers.userId }).from(db_1.taskWatchers).where((0, drizzle_orm_1.eq)(db_1.taskWatchers.taskId, parentTaskId)),
            this.db.select({ userId: db_1.taskAssignees.userId }).from(db_1.taskAssignees).where((0, drizzle_orm_1.eq)(db_1.taskAssignees.taskId, parentTaskId)),
        ]);
        // Not the person who just made it: they know.
        const recipients = [...new Set([...watchers, ...assignees].map((r) => r.userId))].filter((id) => id !== actorId);
        if (recipients.length === 0)
            return;
        const workspaceName = await this.resolveWorkspaceName(ctx.workspaceId);
        // The link opens the SUBTASK — the thing that is new — not the parent the
        // reader already knows about.
        const url = this.buildTaskUrl(ctx.workspaceId, ctx.spaceId, ctx.projectId, parent.listId, subtaskId);
        for (const userId of recipients) {
            void this.notifications.create({
                userId,
                workspaceId: ctx.workspaceId,
                actorId,
                type: 'subtask_created',
                title: `New subtask in "${parent.title}"`,
                body: subtaskTitle,
                target: { entityType: 'task', entityId: subtaskId, url },
                emailContext: { taskTitle: parent.title, workspaceName },
            });
        }
    }
    async notifyTaskUpdate(params) {
        const watcherRows = await this.db
            .select({ userId: db_1.taskWatchers.userId })
            .from(db_1.taskWatchers)
            .where((0, drizzle_orm_1.eq)(db_1.taskWatchers.taskId, params.taskId));
        const watcherIds = [...new Set(watcherRows.map((w) => w.userId))]
            .filter((id) => id !== params.actorId);
        if (watcherIds.length === 0)
            return;
        const changedBits = [];
        // §A2.8 — name both ends of a transition. The activity log already records
        // { from, to }; a watcher reading "Updated status to In review" still has to
        // open the task to learn what it moved off.
        if (params.patch.status && params.patch.status !== params.before.status) {
            changedBits.push(`status from ${humanizeFieldValue(params.before.status)} to ${humanizeFieldValue(params.patch.status)}`);
        }
        if (params.patch.priority && params.patch.priority !== params.before.priority) {
            changedBits.push(`priority from ${humanizeFieldValue(params.before.priority)} to ${humanizeFieldValue(params.patch.priority)}`);
        }
        if ('dueDate' in params.patch && (params.patch.dueDate?.getTime() ?? null) !== (params.before.dueDate?.getTime() ?? null)) {
            changedBits.push(params.patch.dueDate ? 'due date' : 'due date cleared');
        }
        if (params.patch.title && params.patch.title !== params.before.title)
            changedBits.push('title');
        if ('description' in params.patch && params.patch.description !== params.before.description)
            changedBits.push('description');
        if (changedBits.length === 0)
            return;
        const notificationType = params.patch.status && params.patch.status !== params.before.status
            ? 'task_status_changed'
            : 'task_updated';
        const body = changedBits.length === 1
            ? `Updated ${changedBits[0]}.`
            : `Updated ${changedBits.slice(0, 3).join(', ')}${changedBits.length > 3 ? ', and more' : ''}.`;
        for (const userId of watcherIds) {
            void this.notifications.create({
                userId,
                workspaceId: params.workspaceId,
                actorId: params.actorId,
                type: notificationType,
                title: `"${params.taskTitle}" was updated`,
                body,
                target: { entityType: 'task', entityId: params.taskId, url: params.taskUrl },
                emailContext: { taskTitle: params.taskTitle, workspaceName: params.workspaceName },
            });
        }
    }
    /**
     * §4.4 — notify a task's assignees + watchers (minus the actor) when a newly
     * added blocking dependency leaves it blocked. Best-effort: swallows errors so
     * a notification failure never breaks the dependency write.
     */
    async notifyTaskBlocked(blockedTaskId, blockerTaskId, actorId) {
        try {
            // Only notify when the blocker is genuinely open — i.e. this dependency
            // actually leaves the task blocked. A done/cancelled blocker doesn't block.
            const openBlockers = await this.getOpenBlockers(blockedTaskId);
            const blocker = openBlockers.find((b) => b.id === blockerTaskId);
            if (!blocker)
                return;
            const [blockedTask] = await this.db
                .select({ id: db_1.tasks.id, title: db_1.tasks.title, listId: db_1.tasks.listId })
                .from(db_1.tasks)
                .where((0, drizzle_orm_1.eq)(db_1.tasks.id, blockedTaskId))
                .limit(1);
            if (!blockedTask)
                return;
            const ctx = await this.resolveWorkspaceForList(blockedTask.listId);
            if (!ctx)
                return;
            const workspaceName = await this.resolveWorkspaceName(ctx.workspaceId);
            const taskUrl = this.buildTaskUrl(ctx.workspaceId, ctx.spaceId, ctx.projectId, blockedTask.listId, blockedTaskId);
            const [assigneeRows, watcherRows] = await Promise.all([
                this.db
                    .select({ userId: db_1.taskAssignees.userId })
                    .from(db_1.taskAssignees)
                    .where((0, drizzle_orm_1.eq)(db_1.taskAssignees.taskId, blockedTaskId)),
                this.db
                    .select({ userId: db_1.taskWatchers.userId })
                    .from(db_1.taskWatchers)
                    .where((0, drizzle_orm_1.eq)(db_1.taskWatchers.taskId, blockedTaskId)),
            ]);
            const recipientIds = [...new Set([...assigneeRows, ...watcherRows].map((r) => r.userId))].filter((id) => id !== actorId);
            if (recipientIds.length === 0)
                return;
            for (const userId of recipientIds) {
                void this.notifications.create({
                    userId,
                    workspaceId: ctx.workspaceId,
                    actorId,
                    type: 'task_blocked',
                    title: `"${blockedTask.title}" is blocked`,
                    body: `Blocked by "${blocker.title}".`,
                    target: { entityType: 'task', entityId: blockedTaskId, url: taskUrl },
                    emailContext: { taskTitle: blockedTask.title, workspaceName },
                });
            }
        }
        catch {
            // Best-effort — never fail the dependency write on a notification error.
        }
    }
    async indexTaskInSearch(taskId) {
        try {
            const ctx = await this.resolveTaskContext(taskId);
            if (!ctx)
                return;
            await this.search.indexTask({
                id: ctx.task.id,
                title: ctx.task.title,
                description: ctx.task.description,
                listId: ctx.task.listId,
                createdAt: ctx.task.createdAt,
                // Without this the index keeps the creation time forever, and an
                // edited task never moves under a "last updated" sort.
                updatedAt: ctx.task.updatedAt,
            }, ctx.space.workspaceId, ctx.space.id, ctx.project.id);
        }
        catch {
            // Search is best-effort; never fail a write because of it.
        }
    }
    async indexAttachmentInSearch(attachment, taskId) {
        try {
            const ctx = await this.resolveTaskContext(taskId);
            if (!ctx)
                return;
            await this.search.indexTaskAttachment({
                id: attachment.id,
                fileName: attachment.fileName,
                contentType: attachment.contentType,
                createdAt: attachment.createdAt,
            }, { id: ctx.task.id, listId: ctx.task.listId }, ctx.space.workspaceId, ctx.space.id, ctx.project.id);
        }
        catch {
            // Search is best-effort; never fail a write because of it.
        }
    }
    extractMentionIds(body) {
        const ids = new Set();
        const patterns = [
            /<@([0-9a-fA-F-]{36})>/g,
            /@\[([0-9a-fA-F-]{36})\]/g,
        ];
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(body)) !== null)
                ids.add(match[1]);
        }
        return [...ids];
    }
    // --- Helpers -------------------------------------------------------------
    async logActivity(params) {
        const [entry] = await this.db
            .insert(db_1.taskActivity)
            .values({
            taskId: params.taskId,
            actorId: params.actorId ?? null,
            action: params.action,
            meta: params.meta,
        })
            .returning();
        this.realtime.emitToTask(params.taskId, { type: 'activity.created', taskId: params.taskId, activity: entry });
        return entry;
    }
    /**
     * A task in the bin is not an editable task.
     *
     * Found by the third video1 pass, which deleted a task and then kept writing
     * to it: `PATCH /tasks/:id` answered 200 and `POST /tasks/:id/comments`
     * answered 201, on a row that no list, no search and no deep link would show
     * you. Deleting is a soft delete — `isArchived` — and every *read* path
     * filtered on it. The write paths never did.
     *
     * The exposure was never a UI one: nothing in the app can reach a binned
     * task, so this is a stale tab, a queued request, a script, an integration
     * holding an id from before the delete. That is exactly the population that
     * cannot see the bin, which is what makes silence the wrong answer — the
     * edit appears to succeed, and then the row is purged out from under it
     * thirty days later along with whatever was written.
     *
     * 409 rather than 404: the task is really there and the caller may well be
     * entitled to it. What is wrong is its state, and "restore it first" is a
     * thing they can actually do.
     */
    assertNotInBin(isArchived) {
        if (isArchived) {
            throw new common_1.ConflictException('This task is in the bin. Restore it before editing.');
        }
    }
    async getListIdOrThrow(taskId) {
        const [row] = await this.db.select({ listId: db_1.tasks.listId }).from(db_1.tasks).where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId));
        if (!row)
            throw new common_1.NotFoundException('Task not found');
        return row.listId;
    }
    /**
     * @param opts.allowArchived — for the two operations whose whole purpose is a
     *   task already in the bin. Everything else is refused; see assertNotInBin.
     */
    async assertTaskWriteAccess(taskId, actorId, opts = {}) {
        const [ctx] = await this.db
            .select({
            taskId: db_1.tasks.id,
            listId: db_1.tasks.listId,
            createdById: db_1.tasks.createdById,
            isArchived: db_1.tasks.isArchived,
            workspaceId: db_1.spaces.workspaceId,
        })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId))
            .limit(1);
        if (!ctx)
            throw new common_1.NotFoundException('Task not found');
        if (!opts.allowArchived)
            this.assertNotInBin(ctx.isArchived);
        const [membership] = await this.db
            .select({ role: db_1.workspaceMembers.role })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, ctx.workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, actorId)))
            .limit(1);
        if (!membership)
            throw new common_1.NotFoundException('Workspace not found');
        if (['workspace_admin', 'manager', 'super_admin'].includes(membership.role))
            return ctx;
        if (membership.role === 'guest')
            throw new common_1.ForbiddenException('Guests cannot edit tasks');
        if (ctx.createdById === actorId)
            return ctx;
        const [assignee] = await this.db
            .select({ userId: db_1.taskAssignees.userId })
            .from(db_1.taskAssignees)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskAssignees.taskId, taskId), (0, drizzle_orm_1.eq)(db_1.taskAssignees.userId, actorId)))
            .limit(1);
        if (assignee)
            return ctx;
        throw new common_1.ForbiddenException('Only assignees, creators, managers, and workspace admins can edit this task');
    }
    /**
     * Read-access gate for a task. Unlike assertTaskWriteAccess this does NOT
     * require the caller to be a creator/assignee: ANY workspace member who can
     * reach the task's container may view it (comment-/view-only roles and guests
     * included), matching how the GET routes are authorized by ResourceMemberGuard
     * (workspace membership + `checkContainerAccess`). It still blocks
     * cross-workspace / non-member callers and outsiders to a private space or
     * project. Used by read paths that hand back sensitive data (e.g. signed R2
     * attachment URLs) as a service-layer defense-in-depth behind the route guard.
     */
    async assertTaskReadAccess(taskId, actorId) {
        const [ctx] = await this.db
            .select({
            taskId: db_1.tasks.id,
            listId: db_1.tasks.listId,
            createdById: db_1.tasks.createdById,
            workspaceId: db_1.spaces.workspaceId,
            spaceId: db_1.spaces.id,
            spaceVisibility: db_1.spaces.visibility,
            projectId: db_1.projects.id,
            projectVisibility: db_1.projects.visibility,
        })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId))
            .limit(1);
        if (!ctx)
            throw new common_1.NotFoundException('Task not found');
        const [membership] = await this.db
            .select({ role: db_1.workspaceMembers.role })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, ctx.workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, actorId)))
            .limit(1);
        if (!membership)
            throw new common_1.NotFoundException('Workspace not found');
        // Managers/admins/super_admins bypass private-container membership.
        if (['workspace_admin', 'manager', 'super_admin'].includes(membership.role))
            return ctx;
        // A private space requires the actor to be a member of it.
        if (ctx.spaceVisibility === 'private') {
            const [sm] = await this.db
                .select({ userId: db_1.spaceMembers.userId })
                .from(db_1.spaceMembers)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaceMembers.spaceId, ctx.spaceId), (0, drizzle_orm_1.eq)(db_1.spaceMembers.userId, actorId)))
                .limit(1);
            if (!sm)
                throw new common_1.ForbiddenException('This space is private');
        }
        // An explicitly-private project requires project membership (or admin of the
        // owning space). A project that inherits (null) is covered by the space check.
        if (ctx.projectVisibility === 'private' && ctx.projectId) {
            const [pm] = await this.db
                .select({ userId: db_1.projectMembers.userId })
                .from(db_1.projectMembers)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.projectMembers.projectId, ctx.projectId), (0, drizzle_orm_1.eq)(db_1.projectMembers.userId, actorId)))
                .limit(1);
            if (!pm) {
                const [sadm] = await this.db
                    .select({ role: db_1.spaceMembers.role })
                    .from(db_1.spaceMembers)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaceMembers.spaceId, ctx.spaceId), (0, drizzle_orm_1.eq)(db_1.spaceMembers.userId, actorId)))
                    .limit(1);
                if (sadm?.role !== 'admin')
                    throw new common_1.ForbiddenException('This project is private');
            }
        }
        return ctx;
    }
    /**
     * §3.3 Delete Items — a workspace `manager` (not workspace_admin/super_admin)
     * may only archive/delete a task whose Space they belong to (space_members).
     * Admins & super_admins keep delete-any; plain members are already limited to
     * their own tasks by assertTaskWriteAccess. This is deliberately scoped to the
     * DELETE path (it does NOT loosen or touch assertTaskWriteAccess's other
     * callers) so a manager's non-delete writes stay unrestricted.
     */
    async assertManagerDeleteScope(taskId, actorId) {
        const [ctx] = await this.db
            .select({ spaceId: db_1.spaces.id, workspaceId: db_1.spaces.workspaceId })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId))
            .limit(1);
        if (!ctx)
            throw new common_1.NotFoundException('Task not found');
        const [membership] = await this.db
            .select({ role: db_1.workspaceMembers.role })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, ctx.workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, actorId)))
            .limit(1);
        // Only managers are further restricted here. workspace_admin / super_admin
        // keep delete-any; members/guests were already gated by the write-access
        // check the caller ran first.
        if (membership?.role !== 'manager')
            return;
        const [member] = await this.db
            .select({ userId: db_1.spaceMembers.userId })
            .from(db_1.spaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaceMembers.spaceId, ctx.spaceId), (0, drizzle_orm_1.eq)(db_1.spaceMembers.userId, actorId)))
            .limit(1);
        if (!member)
            throw new common_1.ForbiddenException('Managers can only delete tasks in their own spaces');
    }
    sanitizeFileName(input) {
        return input.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file';
    }
    /**
     * §4.5 — enforce the declared attachment size on the presign/create paths.
     * A valid, positive `sizeBytes` is now MANDATORY: reject when it is missing,
     * non-finite, ≤ 0, or over the hard cap. This turns the client-declared size
     * into a real gate instead of an advisory value that silently stored 0.
     *
     * NOTE: R2 presigned PUT URLs (see R2Service.presignPutObject) sign only the
     * object key + content-type — they cannot express a content-length-range
     * condition the way a presigned POST policy can. Byte-exact enforcement of the
     * *actual* uploaded bytes therefore requires a storage-side upload policy;
     * until that exists this declared-size gate is the mandatory guard.
     */
    assertAttachmentSize(sizeBytes) {
        if (sizeBytes == null || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
            throw new common_1.BadRequestException('A valid attachment sizeBytes is required');
        }
        if (sizeBytes > exports.MAX_ATTACHMENT_BYTES) {
            const mb = Math.round(exports.MAX_ATTACHMENT_BYTES / (1024 * 1024));
            throw new common_1.BadRequestException(`Attachment exceeds the ${mb} MB limit`);
        }
    }
    clampRecurrenceInterval(interval) {
        if (!interval || !Number.isFinite(interval))
            return 1;
        return Math.min(Math.max(Math.floor(interval), 1), 52);
    }
    shiftByRecurrenceRule(input, rule) {
        if (!input)
            return undefined;
        const source = new Date(input);
        const interval = this.clampRecurrenceInterval(rule.interval);
        if (rule.mode === 'daily') {
            const next = new Date(source);
            next.setDate(next.getDate() + interval);
            if (rule.skipWeekends) {
                while (next.getDay() === 0 || next.getDay() === 6)
                    next.setDate(next.getDate() + 1);
            }
            return next;
        }
        if (rule.mode === 'weekly') {
            const allowed = (rule.weekdays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
            const weekdays = allowed.length > 0 ? allowed : [source.getDay()];
            const next = new Date(source);
            for (let i = 0; i < 370; i++) {
                next.setDate(next.getDate() + 1);
                const diffDays = Math.floor((next.getTime() - source.getTime()) / (24 * 60 * 60 * 1000));
                const weekIndex = Math.floor(diffDays / 7);
                if ((weekIndex % interval) === 0 && weekdays.includes(next.getDay()))
                    return next;
            }
            return undefined;
        }
        // monthly
        const targetDay = Math.min(Math.max(Math.floor(rule.dayOfMonth ?? source.getDate()), 1), 31);
        const next = new Date(source);
        next.setDate(1);
        next.setMonth(next.getMonth() + interval);
        const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(targetDay, lastDay));
        return next;
    }
    // Public so the AI module can assemble enriched task-summary input (Plan §7.5).
    async getOpenBlockers(taskId) {
        const directBlockedBy = await this.db
            .select({ blockerTaskId: db_1.taskDependencies.relatedTaskId })
            .from(db_1.taskDependencies)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskDependencies.taskId, taskId), (0, drizzle_orm_1.eq)(db_1.taskDependencies.type, 'blocked_by')));
        const reverseBlocks = await this.db
            .select({ blockerTaskId: db_1.taskDependencies.taskId })
            .from(db_1.taskDependencies)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskDependencies.relatedTaskId, taskId), (0, drizzle_orm_1.eq)(db_1.taskDependencies.type, 'blocks')));
        const blockerIds = [...new Set([...directBlockedBy, ...reverseBlocks].map((r) => r.blockerTaskId))];
        if (blockerIds.length === 0)
            return [];
        const blockerTasks = await this.db
            .select({ id: db_1.tasks.id, status: db_1.tasks.status, title: db_1.tasks.title })
            .from(db_1.tasks)
            .where((0, drizzle_orm_1.inArray)(db_1.tasks.id, blockerIds));
        return blockerTasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
    }
    async hasBlockingPath(fromTaskId, toTaskId) {
        if (fromTaskId === toTaskId)
            return true;
        const visited = new Set();
        let frontier = [fromTaskId];
        while (frontier.length > 0) {
            const current = frontier.filter((id) => !visited.has(id));
            frontier = [];
            if (current.length === 0)
                break;
            for (const node of current)
                visited.add(node);
            const forwardBlocks = await this.db
                .select({ nextId: db_1.taskDependencies.relatedTaskId })
                .from(db_1.taskDependencies)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(db_1.taskDependencies.taskId, current), (0, drizzle_orm_1.eq)(db_1.taskDependencies.type, 'blocks')));
            const reverseBlockedBy = await this.db
                .select({ nextId: db_1.taskDependencies.taskId })
                .from(db_1.taskDependencies)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(db_1.taskDependencies.relatedTaskId, current), (0, drizzle_orm_1.eq)(db_1.taskDependencies.type, 'blocked_by')));
            const nextNodes = [...forwardBlocks, ...reverseBlockedBy].map((r) => r.nextId);
            if (nextNodes.includes(toTaskId))
                return true;
            frontier = nextNodes;
        }
        return false;
    }
    async createAttachmentUploadUrl(taskId, actorId, body) {
        const ctx = await this.assertTaskWriteAccess(taskId, actorId);
        if (!this.r2.configured)
            throw new common_1.BadRequestException('R2 storage is not configured');
        this.assertAttachmentSize(body.sizeBytes);
        const fileName = this.sanitizeFileName(body.fileName);
        const key = `workspaces/${ctx.workspaceId}/tasks/${taskId}/attachments/${Date.now()}-${fileName}`;
        const uploadUrl = await this.r2.presignPutObject(key, body.contentType || 'application/octet-stream', {
            uploadedby: actorId,
            taskid: taskId,
        });
        return { uploadUrl, storageKey: key };
    }
    // --- Linked docs (Plan §4 relationships) ---------------------------------
    /** Docs linked to a task, most-recent first. Requires task read access. */
    async listLinkedDocs(taskId, userId) {
        await this.assertTaskWriteAccess(taskId, userId);
        return this.db
            .select({
            id: db_1.taskDocLinks.id,
            docId: db_1.docs.id,
            title: db_1.docs.title,
            icon: db_1.docs.icon,
            isArchived: db_1.docs.isArchived,
            linkedAt: db_1.taskDocLinks.createdAt,
        })
            .from(db_1.taskDocLinks)
            .innerJoin(db_1.docs, (0, drizzle_orm_1.eq)(db_1.docs.id, db_1.taskDocLinks.docId))
            .where((0, drizzle_orm_1.eq)(db_1.taskDocLinks.taskId, taskId))
            .orderBy((0, drizzle_orm_1.desc)(db_1.taskDocLinks.createdAt));
    }
    /** Link a doc to a task. Both must live in the same workspace. */
    async linkDoc(taskId, docId, userId) {
        const ctx = await this.assertTaskWriteAccess(taskId, userId);
        const [doc] = await this.db.select({ workspaceId: db_1.docs.workspaceId }).from(db_1.docs).where((0, drizzle_orm_1.eq)(db_1.docs.id, docId)).limit(1);
        if (!doc)
            throw new common_1.NotFoundException('Doc not found');
        if (doc.workspaceId !== ctx.workspaceId)
            throw new common_1.BadRequestException('Doc belongs to a different workspace');
        const [row] = await this.db
            .insert(db_1.taskDocLinks)
            .values({ taskId, docId, createdById: userId })
            .onConflictDoNothing()
            .returning();
        // onConflictDoNothing returns nothing when the link already exists.
        return row ?? { id: null, taskId, docId, alreadyLinked: true };
    }
    /** Remove a task↔doc link. */
    async unlinkDoc(taskId, docId, userId) {
        await this.assertTaskWriteAccess(taskId, userId);
        await this.db
            .delete(db_1.taskDocLinks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskDocLinks.taskId, taskId), (0, drizzle_orm_1.eq)(db_1.taskDocLinks.docId, docId)));
        return { ok: true };
    }
    // --- External-service links (Plan §12.8 GitHub/GitLab, §12.2 Google Drive) -
    //
    // A link is created by pasting a URL. The URL is parsed (see
    // external-links.util) to detect provider + kind + external_id. When the
    // workspace has a matching integration connection with a stored token, the
    // live PR/issue state (or Drive file metadata) is fetched and persisted;
    // otherwise the link is kept with status null — graceful, never an error.
    /** External links attached to a task, most-recent first. Requires task access. */
    async listExternalLinks(taskId, userId) {
        await this.assertTaskWriteAccess(taskId, userId);
        return this.db
            .select({
            id: db_1.taskExternalLinks.id,
            provider: db_1.taskExternalLinks.provider,
            kind: db_1.taskExternalLinks.kind,
            url: db_1.taskExternalLinks.url,
            externalId: db_1.taskExternalLinks.externalId,
            title: db_1.taskExternalLinks.title,
            status: db_1.taskExternalLinks.status,
            metadata: db_1.taskExternalLinks.metadata,
            commentId: db_1.taskExternalLinks.commentId,
            createdAt: db_1.taskExternalLinks.createdAt,
        })
            .from(db_1.taskExternalLinks)
            .where((0, drizzle_orm_1.eq)(db_1.taskExternalLinks.taskId, taskId))
            .orderBy((0, drizzle_orm_1.desc)(db_1.taskExternalLinks.createdAt));
    }
    /**
     * §12.6 — external links attached to one specific comment on a task
     * (e.g. Dropbox files shared in a comment), most-recent first. Requires task
     * access. Task-level links (comment_id null) are excluded.
     */
    async listExternalLinksForComment(taskId, commentId, userId) {
        await this.assertTaskWriteAccess(taskId, userId);
        return this.db
            .select({
            id: db_1.taskExternalLinks.id,
            provider: db_1.taskExternalLinks.provider,
            kind: db_1.taskExternalLinks.kind,
            url: db_1.taskExternalLinks.url,
            externalId: db_1.taskExternalLinks.externalId,
            title: db_1.taskExternalLinks.title,
            status: db_1.taskExternalLinks.status,
            metadata: db_1.taskExternalLinks.metadata,
            commentId: db_1.taskExternalLinks.commentId,
            createdAt: db_1.taskExternalLinks.createdAt,
        })
            .from(db_1.taskExternalLinks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskExternalLinks.taskId, taskId), (0, drizzle_orm_1.eq)(db_1.taskExternalLinks.commentId, commentId)))
            .orderBy((0, drizzle_orm_1.desc)(db_1.taskExternalLinks.createdAt));
    }
    /** Link an external URL (GitHub/GitLab commit·PR·issue, Drive file, or plain link). */
    async addExternalLink(taskId, userId, input) {
        const ctx = await this.assertTaskWriteAccess(taskId, userId);
        const url = (input.url ?? '').trim();
        if (!(0, external_links_util_1.isHttpUrl)(url))
            throw new common_1.BadRequestException('A valid http(s) URL is required');
        // §12.6 — a link may be scoped to a specific comment (e.g. a Dropbox file
        // shared in a comment). It still belongs to the task; validate the comment
        // is on this task so a link can't be pinned onto another task's comment.
        const commentId = input.commentId ?? null;
        if (commentId) {
            const [comment] = await this.db
                .select({ taskId: db_1.taskComments.taskId })
                .from(db_1.taskComments)
                .where((0, drizzle_orm_1.eq)(db_1.taskComments.id, commentId))
                .limit(1);
            if (!comment || comment.taskId !== taskId) {
                throw new common_1.BadRequestException('Comment does not belong to this task');
            }
        }
        const parsed = (0, external_links_util_1.parseExternalLinkUrl)(url, input.provider);
        // Best-effort live enrichment; falls back to null status when the provider
        // isn't connected/configured (env-gated) or the fetch fails.
        const enriched = await this.fetchProviderState(parsed.provider, parsed.kind, parsed.ref, ctx.workspaceId);
        const metadata = { ref: parsed.ref };
        if (enriched?.metadata)
            Object.assign(metadata, enriched.metadata);
        const [row] = await this.db
            .insert(db_1.taskExternalLinks)
            .values({
            taskId,
            commentId,
            workspaceId: ctx.workspaceId,
            provider: parsed.provider,
            kind: parsed.kind,
            url,
            externalId: parsed.externalId,
            title: enriched?.title ?? parsed.title,
            status: enriched?.status ?? null,
            metadata,
            createdById: userId,
        })
            .returning();
        return row;
    }
    /** Re-fetch live state for one link (env-gated behind the provider connection). */
    async refreshExternalLink(taskId, linkId, userId) {
        const ctx = await this.assertTaskWriteAccess(taskId, userId);
        const [link] = await this.db
            .select()
            .from(db_1.taskExternalLinks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskExternalLinks.id, linkId), (0, drizzle_orm_1.eq)(db_1.taskExternalLinks.taskId, taskId)))
            .limit(1);
        if (!link)
            throw new common_1.NotFoundException('Link not found');
        const ref = link.metadata?.ref ?? {};
        const enriched = await this.fetchProviderState(link.provider, link.kind, ref, ctx.workspaceId);
        if (!enriched)
            return link; // Not configured / nothing to update — graceful.
        const metadata = { ...(link.metadata ?? {}), ref };
        if (enriched.metadata)
            Object.assign(metadata, enriched.metadata);
        const [updated] = await this.db
            .update(db_1.taskExternalLinks)
            .set({
            status: enriched.status ?? link.status,
            title: enriched.title ?? link.title,
            metadata,
        })
            .where((0, drizzle_orm_1.eq)(db_1.taskExternalLinks.id, linkId))
            .returning();
        return updated;
    }
    /** Remove a task↔external link. */
    async removeExternalLink(taskId, linkId, userId) {
        await this.assertTaskWriteAccess(taskId, userId);
        await this.db
            .delete(db_1.taskExternalLinks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskExternalLinks.id, linkId), (0, drizzle_orm_1.eq)(db_1.taskExternalLinks.taskId, taskId)));
        return { ok: true };
    }
    /**
     * Read-only reuse of `integration-connections`: the stored OAuth token for a
     * provider in a workspace, or null when the provider isn't connected. Kept
     * minimal (single token lookup) rather than pulling in the whole service.
     */
    async getProviderToken(workspaceId, connectionProvider) {
        const [conn] = await this.db
            .select({ status: db_1.workspaceIntegrationConnections.status, accessToken: db_1.workspaceIntegrationConnections.accessToken })
            .from(db_1.workspaceIntegrationConnections)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceIntegrationConnections.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceIntegrationConnections.provider, connectionProvider)))
            .limit(1);
        if (!conn || conn.status !== 'connected' || !conn.accessToken)
            return null;
        return conn.accessToken;
    }
    /**
     * Env-gated live provider fetch. Returns the fields to persist (status/title/
     * metadata) or null when the provider isn't connected, the kind is
     * un-fetchable, or the remote call fails — so linking always degrades to a
     * plain "linked" badge instead of erroring.
     */
    async fetchProviderState(provider, kind, ref, workspaceId) {
        try {
            if (provider === 'github' && (kind === 'pull_request' || kind === 'issue')) {
                const token = await this.getProviderToken(workspaceId, 'github');
                if (!token)
                    return null;
                return await this.fetchGithubState(kind, ref, token);
            }
            if (provider === 'gitlab' && (kind === 'pull_request' || kind === 'issue')) {
                const token = await this.getProviderToken(workspaceId, 'gitlab');
                if (!token)
                    return null;
                return await this.fetchGitlabState(kind, ref, token);
            }
            if (provider === 'google_drive' && kind === 'file') {
                const token = await this.getProviderToken(workspaceId, 'google-drive');
                if (!token)
                    return null;
                return await this.fetchDriveFile(ref, token);
            }
            if (provider === 'dropbox' && kind === 'file') {
                const token = await this.getProviderToken(workspaceId, 'dropbox');
                if (!token)
                    return null;
                return await this.fetchDropboxFile(ref, token);
            }
        }
        catch {
            // Network / auth / rate-limit failure — degrade gracefully.
            return null;
        }
        return null;
    }
    async fetchGithubState(kind, ref, token) {
        if (!ref.owner || !ref.repo || !ref.number)
            return null;
        const base = process.env.GITHUB_API_URL ?? 'https://api.github.com';
        const path = kind === 'pull_request' ? 'pulls' : 'issues';
        // Fixed/operator host (not user-derived), but routed through safeFetch for
        // defense-in-depth: blocks private/reserved IPs + DNS rebinding on the sink.
        const res = await (0, safe_fetch_1.safeFetch)(`${base}/repos/${ref.owner}/${ref.repo}/${path}/${ref.number}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
            timeoutMs: 15_000,
        });
        if (res.status < 200 || res.status >= 300)
            return null;
        const body = JSON.parse(res.text());
        const status = kind === 'pull_request'
            ? body.merged || body.merged_at
                ? 'merged'
                : body.state === 'closed'
                    ? 'closed'
                    : 'open'
            : body.state === 'closed'
                ? 'closed'
                : 'open';
        return { status, title: body.title ?? null, metadata: { state: body.state ?? null } };
    }
    /**
     * Hosts the GitLab refresh may send the workspace OAuth token to: gitlab.com
     * plus any operator-approved self-hosted hosts from GITLAB_ALLOWED_HOSTS
     * (comma-separated, default none). Read per-call so operators can change the
     * allowlist without a code change; lowercased for case-insensitive matching.
     */
    gitlabAllowedHosts() {
        const hosts = new Set(['gitlab.com']);
        for (const raw of (process.env.GITLAB_ALLOWED_HOSTS ?? '').split(',')) {
            const h = raw.trim().toLowerCase();
            if (h)
                hosts.add(h);
        }
        return hosts;
    }
    async fetchGitlabState(kind, ref, token) {
        if (!ref.projectPath || !ref.number)
            return null;
        // SSRF / token-exfiltration guard: `ref.host` is derived from the pasted URL,
        // so it must NEVER be used verbatim as the target of an authenticated request
        // (a member could paste https://gitlab.evil.com/... and receive the workspace
        // token). Only reach gitlab.com or an operator-approved host; anything else is
        // skipped WITHOUT sending the token. safeFetch additionally pins DNS and blocks
        // private/reserved IPs (incl. cloud metadata) on every redirect hop.
        const allowedHostnames = this.gitlabAllowedHosts();
        const host = (ref.host ?? 'gitlab.com').toLowerCase();
        if (!allowedHostnames.has(host))
            return null;
        const apiBase = host === 'gitlab.com'
            ? process.env.GITLAB_API_URL ?? 'https://gitlab.com/api/v4'
            : `https://${host}/api/v4`;
        const encoded = encodeURIComponent(ref.projectPath);
        const path = kind === 'pull_request' ? 'merge_requests' : 'issues';
        const res = await (0, safe_fetch_1.safeFetch)(`${apiBase}/projects/${encoded}/${path}/${ref.number}`, {
            headers: { Authorization: `Bearer ${token}` },
            allowedHostnames,
            timeoutMs: 15_000,
        });
        if (res.status < 200 || res.status >= 300)
            return null;
        const body = JSON.parse(res.text());
        // GitLab states: opened | closed | merged | locked.
        const status = body.state === 'merged'
            ? 'merged'
            : body.state === 'closed' || body.state === 'locked'
                ? 'closed'
                : 'open';
        return { status, title: body.title ?? null, metadata: { state: body.state ?? null } };
    }
    async fetchDriveFile(ref, token) {
        if (!ref.fileId)
            return null;
        const base = process.env.GOOGLE_DRIVE_API_URL ?? 'https://www.googleapis.com/drive/v3';
        // Fixed/operator host; routed through safeFetch for defense-in-depth.
        const res = await (0, safe_fetch_1.safeFetch)(`${base}/files/${ref.fileId}?fields=id,name,mimeType,thumbnailLink,webViewLink,iconLink`, {
            headers: { Authorization: `Bearer ${token}` },
            timeoutMs: 15_000,
        });
        if (res.status < 200 || res.status >= 300)
            return null;
        const body = JSON.parse(res.text());
        return {
            status: null, // Files have no open/merged/closed state.
            title: body.name ?? null,
            metadata: {
                mimeType: body.mimeType ?? null,
                thumbnailLink: body.thumbnailLink ?? null,
                iconLink: body.iconLink ?? null,
            },
        };
    }
    async fetchDropboxFile(ref, token) {
        if (!ref.sharedUrl)
            return null;
        const base = process.env.DROPBOX_API_URL ?? 'https://api.dropboxapi.com/2';
        // Fixed/operator host; routed through safeFetch for defense-in-depth.
        const res = await (0, safe_fetch_1.safeFetch)(`${base}/sharing/get_shared_link_metadata`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: ref.sharedUrl }),
            timeoutMs: 15_000,
        });
        if (res.status < 200 || res.status >= 300)
            return null;
        const body = JSON.parse(res.text());
        return {
            status: null, // Files have no open/merged/closed state.
            title: body.name ?? null,
            metadata: {
                dropboxType: body['.tag'] ?? null,
                size: body.size ?? null,
            },
        };
    }
    // --- Meetings (Plan §12.9 Zoom / Google Meet) ----------------------------
    //
    // One-click meeting creation from a task. When the provider is connected we
    // create a real meeting (Zoom `POST /users/me/meetings`; Google Meet via a
    // Google Calendar event with `conferenceData.createRequest` reusing the gcal
    // connection), seed its start time from the task's due date, and persist the
    // join URL as a `task_external_links` row (kind 'meeting'). Not connected →
    // a clean "connect {provider} first" 400.
    /** Create a Zoom or Google Meet meeting for a task and store the join link. */
    async createTaskMeeting(taskId, userId, provider) {
        const ctx = await this.assertTaskWriteAccess(taskId, userId);
        const [task] = await this.db
            .select({ title: db_1.tasks.title, dueDate: db_1.tasks.dueDate })
            .from(db_1.tasks)
            .where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId))
            .limit(1);
        if (!task)
            throw new common_1.NotFoundException('Task not found');
        // Google Meet reuses the workspace's Google Calendar connection; Zoom has
        // its own OAuth connection.
        const connectionProvider = provider === 'zoom' ? 'zoom' : 'gcal';
        const conn = await this.loadIntegrationConnection(ctx.workspaceId, connectionProvider);
        if (!conn) {
            const label = provider === 'zoom' ? 'Zoom' : 'Google Meet';
            throw new common_1.BadRequestException(`Connect ${label} first`);
        }
        const created = provider === 'zoom'
            ? await this.createZoomMeeting(conn, task.title, task.dueDate)
            : await this.createGoogleMeet(conn, task.title, task.dueDate);
        const [row] = await this.db
            .insert(db_1.taskExternalLinks)
            .values({
            taskId,
            workspaceId: ctx.workspaceId,
            provider,
            kind: 'meeting',
            url: created.joinUrl,
            externalId: created.meetingId,
            title: created.title ?? task.title,
            status: null,
            metadata: {
                meeting: { id: created.meetingId, startTime: created.startTime },
                ...(created.metadata ?? {}),
            },
            createdById: userId,
        })
            .returning();
        return row;
    }
    /** Attach a post-meeting recording link to an existing meeting link. */
    async attachMeetingRecording(taskId, linkId, userId, url) {
        await this.assertTaskWriteAccess(taskId, userId);
        const recordingUrl = (url ?? '').trim();
        if (!(0, external_links_util_1.isHttpUrl)(recordingUrl))
            throw new common_1.BadRequestException('A valid http(s) URL is required');
        const [link] = await this.db
            .select()
            .from(db_1.taskExternalLinks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskExternalLinks.id, linkId), (0, drizzle_orm_1.eq)(db_1.taskExternalLinks.taskId, taskId)))
            .limit(1);
        if (!link)
            throw new common_1.NotFoundException('Meeting link not found');
        if (link.kind !== 'meeting')
            throw new common_1.BadRequestException('This link is not a meeting');
        const metadata = { ...(link.metadata ?? {}), recordingUrl };
        const [updated] = await this.db
            .update(db_1.taskExternalLinks)
            .set({ metadata })
            .where((0, drizzle_orm_1.eq)(db_1.taskExternalLinks.id, linkId))
            .returning();
        return updated;
    }
    /**
     * Load a connected integration connection (with tokens) for a provider, or
     * null when the provider isn't connected / has no stored access token.
     */
    async loadIntegrationConnection(workspaceId, provider) {
        const [conn] = await this.db
            .select({
            id: db_1.workspaceIntegrationConnections.id,
            status: db_1.workspaceIntegrationConnections.status,
            accessToken: db_1.workspaceIntegrationConnections.accessToken,
            refreshToken: db_1.workspaceIntegrationConnections.refreshToken,
            tokenExpiresAt: db_1.workspaceIntegrationConnections.tokenExpiresAt,
        })
            .from(db_1.workspaceIntegrationConnections)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceIntegrationConnections.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceIntegrationConnections.provider, provider)))
            .limit(1);
        if (!conn || conn.status !== 'connected' || !conn.accessToken)
            return null;
        return {
            id: conn.id,
            accessToken: conn.accessToken,
            refreshToken: conn.refreshToken,
            tokenExpiresAt: conn.tokenExpiresAt,
        };
    }
    async createZoomMeeting(conn, title, dueDate) {
        const token = await this.ensureMeetingToken(conn, 'zoom');
        const base = process.env.ZOOM_API_URL ?? 'https://api.zoom.us/v2';
        const res = await fetch(`${base}/users/me/meetings`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                topic: title,
                // 2 = scheduled (with a start_time), 1 = instant.
                type: dueDate ? 2 : 1,
                ...(dueDate ? { start_time: dueDate.toISOString() } : {}),
            }),
            signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok)
            throw new common_1.BadRequestException(`Zoom meeting creation failed (${res.status})`);
        const body = (await res.json());
        if (!body.join_url)
            throw new common_1.BadRequestException('Zoom did not return a join URL');
        return {
            joinUrl: body.join_url,
            meetingId: body.id != null ? String(body.id) : null,
            title: body.topic ?? title,
            startTime: body.start_time ?? dueDate?.toISOString() ?? null,
        };
    }
    async createGoogleMeet(conn, title, dueDate) {
        const token = await this.ensureMeetingToken(conn, 'gcal');
        const start = dueDate ?? new Date(Date.now() + 60 * 60 * 1000);
        const end = new Date(start.getTime() + 30 * 60 * 1000);
        const base = process.env.GOOGLE_CALENDAR_API_URL ?? 'https://www.googleapis.com/calendar/v3';
        const res = await fetch(`${base}/calendars/primary/events?conferenceDataVersion=1`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                summary: title,
                start: { dateTime: start.toISOString() },
                end: { dateTime: end.toISOString() },
                conferenceData: {
                    createRequest: {
                        requestId: `rundesk-${(0, node_crypto_1.randomUUID)()}`,
                        conferenceSolutionKey: { type: 'hangoutsMeet' },
                    },
                },
            }),
            signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok)
            throw new common_1.BadRequestException(`Google Meet creation failed (${res.status})`);
        const body = (await res.json());
        const meetUrl = body.hangoutLink ??
            body.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ??
            null;
        if (!meetUrl)
            throw new common_1.BadRequestException('Google did not return a Meet link');
        return {
            joinUrl: meetUrl,
            meetingId: body.id ?? null,
            title,
            startTime: start.toISOString(),
            metadata: { eventUrl: body.htmlLink ?? null },
        };
    }
    /**
     * Return a usable access token for a meeting-provider connection, refreshing
     * via the refresh_token grant when expired/near-expiry (60s buffer). Zoom
     * authenticates the refresh via HTTP Basic; Google via body params. Failures
     * fall back to the stored token so a flaky refresh doesn't block creation.
     */
    async ensureMeetingToken(conn, provider) {
        const remaining = conn.tokenExpiresAt ? conn.tokenExpiresAt.getTime() - Date.now() : Infinity;
        if (remaining > 60_000 || !conn.refreshToken)
            return conn.accessToken;
        const cfg = provider === 'zoom'
            ? {
                tokenUrl: process.env.ZOOM_TOKEN_URL ?? 'https://zoom.us/oauth/token',
                clientId: process.env.ZOOM_CLIENT_ID ?? '',
                clientSecret: process.env.ZOOM_CLIENT_SECRET ?? '',
                basic: true,
            }
            : {
                tokenUrl: 'https://oauth2.googleapis.com/token',
                clientId: process.env.GOOGLE_CLIENT_ID ?? '',
                clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
                basic: false,
            };
        const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refreshToken });
        const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
        if (cfg.basic) {
            headers.Authorization = `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`;
        }
        else {
            body.set('client_id', cfg.clientId);
            body.set('client_secret', cfg.clientSecret);
        }
        const res = await fetch(cfg.tokenUrl, {
            method: 'POST',
            headers,
            body: body.toString(),
            signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok)
            return conn.accessToken;
        const tok = (await res.json());
        if (!tok.access_token)
            return conn.accessToken;
        const newExpiry = tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000) : null;
        await this.db
            .update(db_1.workspaceIntegrationConnections)
            .set({
            accessToken: tok.access_token,
            refreshToken: tok.refresh_token ?? conn.refreshToken,
            tokenExpiresAt: newExpiry,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(db_1.workspaceIntegrationConnections.id, conn.id));
        return tok.access_token;
    }
    // --- Task CRUD -----------------------------------------------------------
    /**
     * Resolve a status key against the list's `list_statuses` rows and return
     * the canonical key + category bucket. Falls back to the list's first
     * "open" status if no key is provided and to the very first status if
     * none are marked open. Throws BadRequest if the caller passed a key
     * that isn't defined for the list.
     */
    /**
     * The workspace's nominated default task type, if it has one. Returns null
     * when types are not in use, which is the state every existing workspace
     * starts in — so this stays a no-op until someone opts in.
     */
    /**
     * Is this type one the list's own workspace defines?
     *
     * The PATCH path has always checked (task-types.service.ts:169 —
     * `byId(workspaceId, typeId)`), but when taskTypeId was opened up on create
     * it was passed straight through, so a caller could type a task with an id
     * belonging to somebody else's workspace. Same question, asked the same way,
     * on both paths.
     */
    async taskTypeBelongsToList(listId, taskTypeId) {
        const [row] = await this.db
            .select({ id: db_1.taskTypes.id })
            .from(db_1.lists)
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .innerJoin(db_1.taskTypes, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskTypes.workspaceId, db_1.spaces.workspaceId), (0, drizzle_orm_1.eq)(db_1.taskTypes.id, taskTypeId)))
            .where((0, drizzle_orm_1.eq)(db_1.lists.id, listId))
            .limit(1);
        return !!row;
    }
    /**
     * §1.1 — does this type make its tasks milestones?
     *
     * tasks.isMilestone is what the timeline, list badges, subtask rows and the
     * client portal all render from, and the type is what a person now sets. This
     * is the one question that keeps the two from contradicting each other.
     */
    async typeIsMilestone(taskTypeId) {
        if (!taskTypeId)
            return false;
        const [row] = await this.db
            .select({ isMilestone: db_1.taskTypes.isMilestone })
            .from(db_1.taskTypes)
            .where((0, drizzle_orm_1.eq)(db_1.taskTypes.id, taskTypeId))
            .limit(1);
        return !!row?.isMilestone;
    }
    /** The milestone type of the workspace this list belongs to, if it has one. */
    async milestoneTypeForList(listId) {
        const [row] = await this.db
            .select({ id: db_1.taskTypes.id })
            .from(db_1.lists)
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .innerJoin(db_1.taskTypes, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskTypes.workspaceId, db_1.spaces.workspaceId), (0, drizzle_orm_1.eq)(db_1.taskTypes.isMilestone, true)))
            .where((0, drizzle_orm_1.eq)(db_1.lists.id, listId))
            .limit(1);
        return row?.id ?? null;
    }
    async defaultTaskTypeForList(listId) {
        const [row] = await this.db
            .select({ id: db_1.taskTypes.id })
            .from(db_1.lists)
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .innerJoin(db_1.taskTypes, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskTypes.workspaceId, db_1.spaces.workspaceId), (0, drizzle_orm_1.eq)(db_1.taskTypes.isDefault, true)))
            .where((0, drizzle_orm_1.eq)(db_1.lists.id, listId))
            .limit(1);
        return row?.id ?? null;
    }
    async resolveStatusForList(listId, requestedKey) {
        // Resolve against the list's effective status set, honouring its
        // status_scope (own list_statuses, or the project/space template).
        const rows = await (0, status_resolution_1.resolveEffectiveStatuses)(this.db, listId);
        if (rows.length === 0) {
            // Lists migrated from before custom-statuses always have seeded rows,
            // so falling back to the legacy enum value keeps newly-created lists
            // (whose statuses haven't been seeded yet) usable.
            return { key: requestedKey ?? 'todo', category: 'open' };
        }
        if (requestedKey) {
            const match = rows.find((r) => r.key === requestedKey);
            if (match)
                return { key: match.key, category: match.category };
            // Fallback: map common/legacy keys to a category and pick the list's first
            // status in that category, so callers passing 'done'/'todo' still work on
            // lists whose statuses were renamed (instead of a hard 400).
            const closedKeys = new Set(['done', 'complete', 'completed', 'closed', 'cancelled']);
            const inferred = closedKeys.has(requestedKey.toLowerCase()) ? 'closed' : 'open';
            const byCategory = rows.find((r) => r.category === inferred) ??
                (inferred === 'closed' ? rows[rows.length - 1] : rows[0]);
            if (byCategory)
                return { key: byCategory.key, category: byCategory.category };
            throw new common_1.BadRequestException(`Status "${requestedKey}" is not defined for this list. ` +
                `Available statuses: ${rows.map((r) => r.key).join(', ')}`);
        }
        const firstOpen = rows.find((r) => r.category === 'open');
        const fallback = firstOpen ?? rows[0];
        return { key: fallback.key, category: fallback.category };
    }
    /** Guests may view/comment but not create tasks (Plan §3.3). */
    async assertNotGuestInList(listId, actorId) {
        const ctx = await this.resolveWorkspaceForList(listId);
        if (!ctx)
            return;
        const [m] = await this.db
            .select({ role: db_1.workspaceMembers.role })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, ctx.workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, actorId)))
            .limit(1);
        if (m?.role === 'guest')
            throw new common_1.ForbiddenException('Guests cannot create tasks');
    }
    async createTask(data) {
        await this.assertNotGuestInList(data.listId, data.createdById);
        // Cap nesting at two levels (parent → subtask). A subtask cannot itself have
        // subtasks, so reject a parent that is already a subtask (Plan §4).
        if (data.parentTaskId) {
            const [parent] = await this.db
                .select({ parentTaskId: db_1.tasks.parentTaskId })
                .from(db_1.tasks)
                .where((0, drizzle_orm_1.eq)(db_1.tasks.id, data.parentTaskId))
                .limit(1);
            if (!parent)
                throw new common_1.NotFoundException('Parent task not found');
            if (parent.parentTaskId) {
                throw new common_1.BadRequestException('Subtasks can only be nested one level deep');
            }
        }
        const resolved = await this.resolveStatusForList(data.listId, data.status);
        // A workspace that has nominated a default type gets it applied here, so
        // every task created through any surface — quick-add, board, import — is
        // typed without each of them having to know types exist.
        if (data.taskTypeId && !(await this.taskTypeBelongsToList(data.listId, data.taskTypeId))) {
            throw new common_1.BadRequestException('That task type does not belong to this workspace');
        }
        const taskTypeId = data.taskTypeId ?? (await this.defaultTaskTypeForList(data.listId));
        // §1.1 — keep the two in step from the first write. Asking for a milestone
        // type makes the task render as one; asking for a milestone without naming
        // a type picks up the workspace's milestone type, so the type filter can
        // find it. Either way there is one answer, not two.
        let resolvedTypeId = taskTypeId;
        let isMilestone = data.isMilestone ?? false;
        if (await this.typeIsMilestone(resolvedTypeId)) {
            isMilestone = true;
        }
        else if (isMilestone && !data.taskTypeId) {
            resolvedTypeId = (await this.milestoneTypeForList(data.listId)) ?? resolvedTypeId;
        }
        const [task] = await this.db
            .insert(db_1.tasks)
            .values({
            listId: data.listId,
            parentTaskId: data.parentTaskId,
            taskTypeId: resolvedTypeId,
            createdById: data.createdById,
            title: data.title,
            description: data.description,
            priority: data.priority ?? 'normal',
            status: resolved.key,
            statusCategory: resolved.category,
            position: data.position ?? 0,
            startDate: data.startDate,
            dueDate: data.dueDate,
            timeEstimate: data.timeEstimate,
            isMilestone,
        })
            .returning();
        if (data.assigneeIds?.length) {
            await this.db.insert(db_1.taskAssignees).values(data.assigneeIds.map((userId) => ({ taskId: task.id, userId })));
        }
        if (data.labelIds?.length) {
            await this.db
                .insert(db_1.taskLabelAssignments)
                .values(data.labelIds.map((labelId) => ({ taskId: task.id, labelId })))
                .onConflictDoNothing();
        }
        // Creator is auto-subscribed as a watcher so they hear about replies/activity
        // — unless they turned auto-follow off (§A4.7).
        if (await this.notifications.autoFollowEnabled(data.createdById)) {
            await this.db.insert(db_1.taskWatchers).values({ taskId: task.id, userId: data.createdById }).onConflictDoNothing();
        }
        await this.logActivity({ taskId: task.id, actorId: data.createdById, action: 'created' });
        if (data.parentTaskId) {
            await this.logActivity({
                taskId: data.parentTaskId,
                actorId: data.createdById,
                action: 'subtask_added',
                meta: { subtaskId: task.id, title: task.title },
            });
            void this.notifySubtaskCreated(data.parentTaskId, task.id, task.title, data.createdById);
        }
        const hydrated = await this.getTask(task.id);
        this.realtime.emitToList(data.listId, { type: 'task.created', listId: data.listId, task: hydrated });
        void this.indexTaskInSearch(task.id);
        // Fire automations + webhooks (best effort)
        const ctx = await this.resolveWorkspaceForList(data.listId);
        if (ctx) {
            void this.fireTaskEvent('task.created', ctx.workspaceId, { task: hydrated }, {
                taskId: task.id,
                userId: data.createdById,
                projectId: ctx.projectId,
                listId: data.listId,
            });
        }
        // Push to connected calendars if the task has a due date.
        if (task.dueDate)
            this.fireCalendarPush(task.id);
        return hydrated;
    }
    /**
     * All tasks across the workspace that have a start or due date — used by
     * the Gantt / timeline view. Returns shape suitable for direct render.
     */
    async getTimelineForWorkspace(workspaceId, opts = {}) {
        const visFilter = await this.taskVisibilityFilterForWorkspace(workspaceId, opts.actor);
        const rows = await this.db
            .select({
            id: db_1.tasks.id,
            title: db_1.tasks.title,
            startDate: db_1.tasks.startDate,
            dueDate: db_1.tasks.dueDate,
            status: db_1.tasks.status,
            priority: db_1.tasks.priority,
            isMilestone: db_1.tasks.isMilestone,
            listId: db_1.tasks.listId,
            listName: db_1.lists.name,
            projectId: db_1.lists.projectId,
            projectName: db_1.projects.name,
            spaceId: db_1.projects.spaceId,
            spaceName: db_1.spaces.name,
        })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false), ...(opts.projectId ? [(0, drizzle_orm_1.eq)(db_1.lists.projectId, opts.projectId)] : []), visFilter))
            .orderBy((0, drizzle_orm_1.asc)(db_1.tasks.startDate), (0, drizzle_orm_1.asc)(db_1.tasks.dueDate));
        // Only return tasks with at least a due date — the rest can't be plotted.
        return rows.filter((r) => r.startDate || r.dueDate);
    }
    async getTasksForMember(workspaceId, userId) {
        return this.db
            .select({
            id: db_1.tasks.id,
            title: db_1.tasks.title,
            status: db_1.tasks.status,
            // §V2-S14 — the planner rail needs to leave finished work out of
            // "Assigned to me" and "Today & overdue". `status` is a per-list key
            // that a workspace can rename, so the client cannot tell closed from
            // open by reading it; the category can.
            statusCategory: db_1.tasks.statusCategory,
            priority: db_1.tasks.priority,
            dueDate: db_1.tasks.dueDate,
            updatedAt: db_1.tasks.updatedAt,
            listId: db_1.lists.id,
            listName: db_1.lists.name,
            projectId: db_1.projects.id,
            projectName: db_1.projects.name,
            spaceId: db_1.spaces.id,
            spaceName: db_1.spaces.name,
        })
            .from(db_1.taskAssignees)
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskAssignees.taskId))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskAssignees.userId, userId), (0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false)))
            .orderBy((0, drizzle_orm_1.desc)(db_1.tasks.updatedAt))
            .limit(100);
    }
    /**
     * Flat list of every task in a workspace with denormalised
     * space/project/list context. Used by the dashboard, timeline, and
     * any other view that previously had to fan out
     * spaces → projects → lists → tasks (N+1+N+M+L+T HTTP requests).
     *
     * Returns up to `limit` rows ordered by updatedAt desc. When
     * `includeAssignees` is true (default true), each row carries a
     * compact `assignees` array — fetched in one extra batched query
     * keyed on the returned task ids — so the client can filter
     * "tasks assigned to me" without another round trip.
     */
    /**
     * Filter denormalised workspace-task rows down to those the actor may see,
     * enforcing private-container membership. Mirrors `checkContainerAccess`'s rule
     * but batched (two membership queries, not one per row): a manager-tier actor
     * (or super_admin) sees everything; a private space requires space membership;
     * an explicitly-private project requires project membership or admin of the
     * owning space. Rows must carry spaceId/spaceVisibility/projectId/projectVisibility.
     */
    async filterTasksByContainerAccess(rows, workspaceId, actor) {
        if (rows.length === 0)
            return rows;
        // Platform super_admins bypass the guard without a workspace_members row.
        if (actor.role === 'super_admin')
            return rows;
        const [wm] = await this.db
            .select({ role: db_1.workspaceMembers.role })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, actor.id)))
            .limit(1);
        if (!wm)
            return []; // not a member — surface nothing (fail closed; the route guard already blocks)
        if (['workspace_admin', 'manager', 'super_admin'].includes(wm.role))
            return rows;
        const spaceRows = await this.db
            .select({ spaceId: db_1.spaceMembers.spaceId, role: db_1.spaceMembers.role })
            .from(db_1.spaceMembers)
            .where((0, drizzle_orm_1.eq)(db_1.spaceMembers.userId, actor.id));
        const projectRows = await this.db
            .select({ projectId: db_1.projectMembers.projectId })
            .from(db_1.projectMembers)
            .where((0, drizzle_orm_1.eq)(db_1.projectMembers.userId, actor.id));
        const spaceRoleById = new Map(spaceRows.map((s) => [s.spaceId, s.role]));
        const memberProjects = new Set(projectRows.map((p) => p.projectId));
        return rows.filter((r) => {
            // §2 per-item privacy: a private task is hidden from a regular member who
            // isn't its creator. (Managers/super_admins already returned above; the
            // creator/assignee still reach it via the list + by-id paths.)
            if (r.visibility === 'private' && r.createdById !== actor.id)
                return false;
            // Private space → must be a space member.
            if (r.spaceVisibility === 'private' && !spaceRoleById.has(r.spaceId))
                return false;
            // Explicitly-private project → project member, or admin of the owning space.
            if (r.projectVisibility === 'private') {
                if (memberProjects.has(r.projectId))
                    return true;
                return spaceRoleById.get(r.spaceId) === 'admin';
            }
            return true;
        });
    }
    async getTasksForWorkspace(workspaceId, limit = 500, opts = {}) {
        const { includeAssignees = true, actorId, actorRole, assigneeId } = opts;
        const safeLimit = Math.min(Math.max(limit, 1), 1000);
        const rawRows = await this.db
            .select({
            id: db_1.tasks.id,
            title: db_1.tasks.title,
            status: db_1.tasks.status,
            statusCategory: db_1.tasks.statusCategory,
            priority: db_1.tasks.priority,
            isMilestone: db_1.tasks.isMilestone,
            listId: db_1.lists.id,
            listName: db_1.lists.name,
            projectId: db_1.projects.id,
            projectName: db_1.projects.name,
            spaceId: db_1.spaces.id,
            spaceName: db_1.spaces.name,
            startDate: db_1.tasks.startDate,
            dueDate: db_1.tasks.dueDate,
            completedAt: db_1.tasks.completedAt,
            createdAt: db_1.tasks.createdAt,
            updatedAt: db_1.tasks.updatedAt,
            // Selected only to scope private containers + private items; stripped
            // from the response.
            spaceVisibility: db_1.spaces.visibility,
            projectVisibility: db_1.projects.visibility,
            visibility: db_1.tasks.visibility,
            createdById: db_1.tasks.createdById,
        })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false), assigneeId
            ? (0, drizzle_orm_1.sql) `exists (select 1 from ${db_1.taskAssignees} where ${db_1.taskAssignees.taskId} = ${db_1.tasks.id} and ${db_1.taskAssignees.userId} = ${assigneeId})`
            : undefined))
            .orderBy((0, drizzle_orm_1.desc)(db_1.tasks.updatedAt))
            /*
             * Over-fetched when the caller is scoped, because the container filter
             * below runs AFTER this limit and only removes rows. Asking for exactly
             * `safeLimit` therefore returned fewer than asked for whenever any of the
             * top rows sat in a private space — the same shape as the search bug
             * where hits were dropped after Meilisearch had already applied its own
             * limit. Bounded at the same 1000 ceiling the parameter is clamped to.
             */
            .limit(actorId ? Math.min(safeLimit * 2, 1000) : safeLimit);
        // The workspace listing is guarded only by workspace membership, so without
        // this it would leak tasks in private spaces/projects the caller can't reach.
        // Scope to accessible containers when the caller is known; unknown-actor
        // (internal) callers stay unfiltered to preserve existing behavior.
        const scopedRows = actorId
            ? (await this.filterTasksByContainerAccess(rawRows, workspaceId, { id: actorId, role: actorRole })).slice(0, safeLimit)
            : rawRows;
        // Drop the visibility helper columns so the response shape is unchanged.
        const rows = scopedRows.map(({ spaceVisibility: _sv, projectVisibility: _pv, visibility: _v, createdById: _c, ...rest }) => rest);
        const empty = [];
        if (!includeAssignees || rows.length === 0) {
            return rows.map((r) => ({ ...r, assignees: empty }));
        }
        const assigneeRows = await this.db
            .select({
            taskId: db_1.taskAssignees.taskId,
            userId: db_1.taskAssignees.userId,
            displayName: db_1.users.displayName,
            avatarUrl: db_1.users.avatarUrl,
        })
            .from(db_1.taskAssignees)
            .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.taskAssignees.userId))
            .where((0, drizzle_orm_1.inArray)(db_1.taskAssignees.taskId, rows.map((r) => r.id)));
        const byTask = new Map();
        for (const a of assigneeRows) {
            const list = byTask.get(a.taskId) ?? [];
            list.push({ userId: a.userId, displayName: a.displayName, avatarUrl: a.avatarUrl });
            byTask.set(a.taskId, list);
        }
        return rows.map((r) => ({ ...r, assignees: byTask.get(r.id) ?? empty }));
    }
    /** §2 per-item task-visibility WHERE fragment for reads scoped to one list.
     *  undefined = no restriction (manager, or internal/system call). */
    async taskVisibilityFilterForList(listId, actor) {
        if (!actor)
            return undefined;
        const [ctx] = await this.db
            .select({ workspaceId: db_1.spaces.workspaceId })
            .from(db_1.lists)
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.eq)(db_1.lists.id, listId))
            .limit(1);
        if (!ctx)
            return undefined;
        const isManager = await (0, item_visibility_1.resolveIsManager)(this.db, ctx.workspaceId, actor.id, actor.role);
        return (0, item_visibility_1.taskVisibilityFilter)(this.db, actor.id, isManager);
    }
    /** §2 per-item task-visibility WHERE fragment for workspace-wide task reads. */
    async taskVisibilityFilterForWorkspace(workspaceId, actor) {
        if (!actor)
            return undefined;
        const isManager = await (0, item_visibility_1.resolveIsManager)(this.db, workspaceId, actor.id, actor.role);
        return (0, item_visibility_1.taskVisibilityFilter)(this.db, actor.id, isManager);
    }
    async getTasksByList(listId, opts = {}, actor) {
        const { includeSubtasks = false, includeArchived = false } = opts;
        // §2 per-item privacy: hide private tasks the actor may not see. Resolve the
        // owning workspace to determine manager status, then filter in SQL.
        const visFilter = await this.taskVisibilityFilterForList(listId, actor);
        const rows = await this.db.query.tasks.findMany({
            where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.tasks.listId, listId), includeSubtasks ? undefined : (0, drizzle_orm_1.isNull)(db_1.tasks.parentTaskId), undefined, visFilter),
            orderBy: [(0, drizzle_orm_1.asc)(db_1.tasks.position), (0, drizzle_orm_1.asc)(db_1.tasks.createdAt)],
            with: {
                assignees: { with: { user: public_user_1.PUBLIC_USER_WITH } },
                subtasks: { where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false), visFilter) },
                // §1.1 — carried so a row can show what kind of task it is. Without it
                // the type was something you could set and filter by but never see
                // without opening the task.
                taskType: true,
            },
        });
        // Attach labels (drizzle's with doesn't follow the join-table->label shape cleanly)
        const taskIds = rows.map((r) => r.id);
        const labelRows = taskIds.length
            ? await this.db
                .select({
                taskId: db_1.taskLabelAssignments.taskId,
                label: db_1.labels,
            })
                .from(db_1.taskLabelAssignments)
                .innerJoin(db_1.labels, (0, drizzle_orm_1.eq)(db_1.labels.id, db_1.taskLabelAssignments.labelId))
                .where((0, drizzle_orm_1.inArray)(db_1.taskLabelAssignments.taskId, taskIds))
            : [];
        const byTask = new Map();
        for (const lr of labelRows) {
            const arr = byTask.get(lr.taskId) ?? [];
            arr.push(lr.label);
            byTask.set(lr.taskId, arr);
        }
        const dependencyRows = taskIds.length
            ? await this.db
                .select({
                taskId: db_1.taskDependencies.taskId,
                relatedTaskId: db_1.taskDependencies.relatedTaskId,
                type: db_1.taskDependencies.type,
                relatedStatus: db_1.tasks.status,
                relatedArchived: db_1.tasks.isArchived,
            })
                .from(db_1.taskDependencies)
                .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskDependencies.relatedTaskId))
                .where((0, drizzle_orm_1.inArray)(db_1.taskDependencies.taskId, taskIds))
            : [];
        const reverseDependencyRows = taskIds.length
            ? await this.db
                .select({
                taskId: db_1.taskDependencies.relatedTaskId,
                relatedTaskId: db_1.taskDependencies.taskId,
                type: db_1.taskDependencies.type,
                relatedStatus: db_1.tasks.status,
                relatedArchived: db_1.tasks.isArchived,
            })
                .from(db_1.taskDependencies)
                .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskDependencies.taskId))
                .where((0, drizzle_orm_1.inArray)(db_1.taskDependencies.relatedTaskId, taskIds))
            : [];
        const openBlockerCount = new Map();
        const blocksOpenCount = new Map();
        const isOpenRelated = (status, archived) => !archived && status !== 'done' && status !== 'cancelled';
        for (const dep of dependencyRows) {
            if (!isOpenRelated(dep.relatedStatus, dep.relatedArchived))
                continue;
            if (dep.type === 'blocked_by') {
                openBlockerCount.set(dep.taskId, (openBlockerCount.get(dep.taskId) ?? 0) + 1);
            }
            if (dep.type === 'blocks') {
                blocksOpenCount.set(dep.taskId, (blocksOpenCount.get(dep.taskId) ?? 0) + 1);
            }
        }
        for (const dep of reverseDependencyRows) {
            if (!isOpenRelated(dep.relatedStatus, dep.relatedArchived))
                continue;
            if (dep.type === 'blocks') {
                openBlockerCount.set(dep.taskId, (openBlockerCount.get(dep.taskId) ?? 0) + 1);
            }
            if (dep.type === 'blocked_by') {
                blocksOpenCount.set(dep.taskId, (blocksOpenCount.get(dep.taskId) ?? 0) + 1);
            }
        }
        // Per-task "blocked by" edges (which in-list tasks must finish first),
        // for the Gantt view's dependency arrows + critical path (Plan §5).
        const idSet = new Set(taskIds);
        const blockedBy = new Map();
        const addEdge = (taskId, blockerId) => {
            if (!idSet.has(blockerId) || blockerId === taskId)
                return;
            const set = blockedBy.get(taskId) ?? new Set();
            set.add(blockerId);
            blockedBy.set(taskId, set);
        };
        for (const dep of dependencyRows) {
            if (dep.type === 'blocked_by')
                addEdge(dep.taskId, dep.relatedTaskId);
        }
        for (const dep of reverseDependencyRows) {
            if (dep.type === 'blocks')
                addEdge(dep.taskId, dep.relatedTaskId);
        }
        return rows.map((r) => ({
            ...r,
            labels: byTask.get(r.id) ?? [],
            openBlockerCount: openBlockerCount.get(r.id) ?? 0,
            blocksOpenCount: blocksOpenCount.get(r.id) ?? 0,
            blockedBy: [...(blockedBy.get(r.id) ?? [])],
        }));
    }
    // Direct children (subtasks) of a task, for the task detail Subtasks tab.
    // Each subtask is a full task row plus its own assignees so the panel can
    // edit assignee/due-date inline, independent of the parent (Plan §4).
    async listSubtasks(taskId, actor) {
        const [parent] = await this.db
            .select({ listId: db_1.tasks.listId })
            .from(db_1.tasks)
            .where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId))
            .limit(1);
        // §2 per-item privacy: hide private subtasks the actor may not see.
        const visFilter = parent ? await this.taskVisibilityFilterForList(parent.listId, actor) : undefined;
        const rows = await this.db
            .select()
            .from(db_1.tasks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.tasks.parentTaskId, taskId), (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false), visFilter))
            .orderBy((0, drizzle_orm_1.asc)(db_1.tasks.position));
        if (rows.length === 0)
            return [];
        const ids = rows.map((r) => r.id);
        const assigneeRows = await this.db
            .select({ taskId: db_1.taskAssignees.taskId, userId: db_1.users.id, displayName: db_1.users.displayName, email: db_1.users.email })
            .from(db_1.taskAssignees)
            .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.taskAssignees.userId))
            .where((0, drizzle_orm_1.inArray)(db_1.taskAssignees.taskId, ids));
        const byTask = new Map();
        for (const a of assigneeRows) {
            const list = byTask.get(a.taskId) ?? [];
            list.push({ userId: a.userId, displayName: a.displayName, email: a.email });
            byTask.set(a.taskId, list);
        }
        return rows.map((r) => ({ ...r, assignees: byTask.get(r.id) ?? [] }));
    }
    /**
     * §V2-07 — download the list you are looking at.
     *
     * `[10:53]`–`[11:09]` "Customize pe aap click karoge — ab yeh dekh rahe ho:
     * EXPORT VIEW … aur aap is ko download kar lo … woh aap ko COLUMN mein list
     * de dega, har cheez." Frame `10:57` shows the panel: a file format, a "What
     * to export" choice of Visible columns / Task Names only / All columns, and
     * Download.
     *
     * What existed was `GET /export/csv/tasks`: the WHOLE WORKSPACE, seven fixed
     * columns, behind `WorkspaceAdminGuard`. A member standing on a list could
     * not download it at all, and an admin who did got every task in every list
     * regardless of the view, its filters, or its sort.
     *
     * Built on `getTasksByList` rather than its own query, deliberately: the
     * export is then the same read the list itself performs, including the
     * per-item visibility filter. A separate query would be free to drift, and
     * the way it would drift is by exporting rows the person cannot see on
     * screen.
     *
     * `includeArchived` and `includeClosed` are here for the same reason. The
     * toolbar has an "Archived" filter and a "Closed" toggle (`[11:32]`, `[11:37]`),
     * and an export that ignored them would hand back a different set of rows
     * than the screen it was launched from — which is the one thing this endpoint
     * exists not to do.
     */
    async exportListView(listId, actor, opts = {}) {
        const all = await this.getTasksByList(listId, { includeSubtasks: opts.includeSubtasks ?? false, includeArchived: opts.includeArchived ?? false }, actor);
        /*
         * "Closed" is the status CATEGORY, not the archive flag — a task can be
         * complete without being archived, and the list hides the two separately.
         * `includeClosed` defaults to true so a plain `?columns=all` with no other
         * parameters still exports the whole list: the caller has to ask to lose
         * rows, never the other way round.
         */
        const rows = opts.includeClosed === false
            ? all.filter((t) => t.statusCategory !== 'closed')
            : all;
        const [list] = await this.db.select({ name: db_1.lists.name }).from(db_1.lists).where((0, drizzle_orm_1.eq)(db_1.lists.id, listId)).limit(1);
        const dateFormat = (0, datetime_1.asDateFormat)(opts.dateFormat);
        const timeFormat = (0, datetime_1.asTimeFormat)(opts.timeFormat);
        const date = (v) => (0, datetime_1.formatDate)(v, dateFormat, timeFormat);
        const COLUMNS = [
            { key: 'title', header: 'Name', read: (t) => t.title },
            { key: 'status', header: 'Status', read: (t) => t.status },
            { key: 'assignees', header: 'Assignees', read: (t) => (t.assignees ?? []).map((a) => a.user?.displayName ?? a.user?.email).filter(Boolean).join(', ') },
            { key: 'priority', header: 'Priority', read: (t) => t.priority },
            { key: 'startDate', header: 'Start date', read: (t) => date(t.startDate) },
            { key: 'dueDate', header: 'Due date', read: (t) => date(t.dueDate) },
            { key: 'timeEstimate', header: 'Time estimate', read: (t) => t.timeEstimate },
            { key: 'labels', header: 'Tags', read: (t) => (t.labels ?? []).map((l) => l.name).filter(Boolean).join(', ') },
            { key: 'description', header: 'Description', read: (t) => t.description },
            { key: 'createdAt', header: 'Created', read: (t) => date(t.createdAt) },
            { key: 'id', header: 'ID', read: (t) => t.id },
        ];
        const mode = opts.columns ?? 'visible';
        const chosen = mode === 'names'
            ? COLUMNS.filter((c) => c.key === 'title')
            : mode === 'all'
                ? COLUMNS
                : // "Visible columns" is the view's own set when the caller names one,
                    // and the list's default shape when it does not.
                    opts.fields?.length
                        ? COLUMNS.filter((c) => opts.fields.includes(c.key))
                        : COLUMNS.filter((c) => ['title', 'status', 'assignees', 'priority', 'dueDate'].includes(c.key));
        // A `fields` list naming nothing we know would export an empty row per
        // task, which reads as "the list is empty" rather than "you asked for
        // columns that do not exist".
        const columns = chosen.length > 0 ? chosen : COLUMNS.filter((c) => c.key === 'title');
        const name = list?.name ?? 'list';
        const format = opts.format === 'xlsx' ? 'xlsx' : 'csv';
        /*
         * §V2-13 `[11:06]` — "agar yeh download karega to same layout mein jo hai
         * na, woh aap ko COLUMN mein list de dega". The board download is the board
         * flattened: the column a card is sitting in comes first, the rows arrive
         * grouped by column in the board's own left-to-right order, and only then
         * do the ordinary task columns follow.
         *
         * Sorted by the status's POSITION, not alphabetically and not by whatever
         * order the rows came back in — a board read out of order is a different
         * board, and "Complete" ahead of "In progress" is the kind of wrong that
         * still photographs correctly.
         */
        if (opts.view === 'board') {
            const statuses = await (0, status_resolution_1.resolveEffectiveStatuses)(this.db, listId);
            const byKey = new Map(statuses.map((s) => [s.key, s]));
            const rank = (t) => byKey.get(t.status)?.position ?? Number.MAX_SAFE_INTEGER;
            const label = (t) => byKey.get(t.status)?.name ?? String(t.status ?? '');
            const ordered = [...rows].sort((a, b) => rank(a) - rank(b));
            const boardHeaders = ['Board column', ...columns.map((c) => c.header)];
            const boardCells = ordered.map((task) => [
                label(task),
                ...columns.map((c) => c.read(task)),
            ]);
            return {
                name,
                count: ordered.length,
                format,
                extension: format === 'xlsx' ? 'xlsx' : 'csv',
                contentType: format === 'xlsx'
                    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                    : 'text/csv; charset=utf-8',
                body: format === 'xlsx' ? (0, xlsx_1.toXlsx)(name, boardHeaders, boardCells) : (0, csv_1.toCsv)(boardHeaders, boardCells),
            };
        }
        const headers = columns.map((c) => c.header);
        const cells = rows.map((task) => columns.map((c) => c.read(task)));
        return {
            name,
            count: rows.length,
            format,
            extension: format === 'xlsx' ? 'xlsx' : 'csv',
            contentType: format === 'xlsx'
                ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                : 'text/csv; charset=utf-8',
            body: format === 'xlsx' ? (0, xlsx_1.toXlsx)(name, headers, cells) : (0, csv_1.toCsv)(headers, cells),
        };
    }
    /**
     * §V2-13, frame `09:26` — TEAM VIEW's rollup, computed on the SERVER.
     *
     *   `[09:26]` "Is ke baad TEAM VIEW — yeh cheez ke liye humein of course BUY
     *   karna parega."
     *
     * This exists so the paywall is a paywall. Team View used to be arithmetic
     * the browser did over rows it already had, which means every possible gate
     * on it was a gate on a `<div>` — switch the flag off in devtools and the
     * feature is back. A blocked workspace now gets a 403 from here and there is
     * nothing on the client to un-hide.
     *
     * A task with several assignees is on EACH of their plates, so the rows
     * deliberately do not sum to the list: the question a workload board answers
     * is "what is on this person's plate", and shared work is on both.
     */
    async getTeamRollup(listId, actor, opts = {}) {
        const tasksInList = await this.getTasksByList(listId, { includeSubtasks: false, includeArchived: opts.includeArchived ?? false }, actor);
        const unassigned = opts.unassignedLabel || 'Nobody yet';
        const by = new Map();
        for (const task of tasksInList) {
            const owners = (task.assignees ?? []).length
                ? task.assignees.map((a) => ({
                    id: a.userId,
                    name: a.user?.displayName || a.user?.email || unassigned,
                }))
                : [{ id: '__none__', name: unassigned }];
            for (const owner of owners) {
                const row = by.get(owner.id) ?? { name: owner.name, tasks: [] };
                row.tasks.push({ id: task.id, title: task.title, statusCategory: task.statusCategory });
                by.set(owner.id, row);
            }
        }
        return [...by.entries()]
            .map(([id, row]) => {
            const done = row.tasks.filter((x) => x.statusCategory === 'closed').length;
            return {
                id,
                name: row.name,
                done,
                total: row.tasks.length,
                // Rounded once, here, so a bar and its caption cannot disagree.
                pct: row.tasks.length ? Math.round((done / row.tasks.length) * 100) : 0,
                tasks: row.tasks.map((x) => ({ id: x.id, title: x.title })),
            };
        })
            // Busiest first, but nobody-in-particular last whatever its size: it is a
            // gap to close, not a colleague to compare against.
            .sort((a, b) => (a.id === '__none__' ? 1 : b.id === '__none__' ? -1 : b.total - a.total));
    }
    async getTask(taskId) {
        const row = await this.db.query.tasks.findFirst({
            where: (0, drizzle_orm_1.eq)(db_1.tasks.id, taskId),
            with: {
                assignees: { with: { user: public_user_1.PUBLIC_USER_WITH } },
                subtasks: { where: (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false), orderBy: (0, drizzle_orm_1.asc)(db_1.tasks.position) },
                creator: public_user_1.PUBLIC_USER_WITH,
            },
        });
        if (!row)
            return null;
        const [labelRows, watcherRows, checklistRows, dependencyRows, attachmentRows] = await Promise.all([
            this.db
                .select({ label: db_1.labels })
                .from(db_1.taskLabelAssignments)
                .innerJoin(db_1.labels, (0, drizzle_orm_1.eq)(db_1.labels.id, db_1.taskLabelAssignments.labelId))
                .where((0, drizzle_orm_1.eq)(db_1.taskLabelAssignments.taskId, taskId)),
            this.db
                .select({ watcher: db_1.taskWatchers, user: public_user_1.PUBLIC_USER_COLUMNS })
                .from(db_1.taskWatchers)
                .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.taskWatchers.userId))
                .where((0, drizzle_orm_1.eq)(db_1.taskWatchers.taskId, taskId)),
            this.db.query.taskChecklists.findMany({
                where: (0, drizzle_orm_1.eq)(db_1.taskChecklists.taskId, taskId),
                orderBy: (0, drizzle_orm_1.asc)(db_1.taskChecklists.position),
                with: { items: { orderBy: (0, drizzle_orm_1.asc)(db_1.taskChecklistItems.position) } },
            }),
            this.db
                .select({
                dep: db_1.taskDependencies,
                related: db_1.tasks,
            })
                .from(db_1.taskDependencies)
                .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskDependencies.relatedTaskId))
                .where((0, drizzle_orm_1.eq)(db_1.taskDependencies.taskId, taskId)),
            this.db.select().from(db_1.taskAttachments).where((0, drizzle_orm_1.eq)(db_1.taskAttachments.taskId, taskId)),
        ]);
        // "Subtask of <parent>" needs a name to show, and getTask only carries the id.
        const [parent] = row.parentTaskId
            ? await this.db
                .select({ id: db_1.tasks.id, title: db_1.tasks.title })
                .from(db_1.tasks)
                .where((0, drizzle_orm_1.eq)(db_1.tasks.id, row.parentTaskId))
                .limit(1)
            : [];
        // The type's label and icon, not just its id — the header renders it inline
        // and should not need a second round trip to know what it says.
        const [taskType] = row.taskTypeId
            ? await this.db
                .select({ id: db_1.taskTypes.id, name: db_1.taskTypes.name, icon: db_1.taskTypes.icon, color: db_1.taskTypes.color })
                .from(db_1.taskTypes)
                .where((0, drizzle_orm_1.eq)(db_1.taskTypes.id, row.taskTypeId))
                .limit(1)
            : [];
        return {
            ...row,
            /*
             * §V2-09 — one field the banner can actually render, resolved here so
             * every caller does not have to know the difference.
             *
             * A stored image is a KEY and needs presigning; a linked one is already a
             * URL and must be passed through untouched. Task attachments conflate the
             * two — a hyperlink is written into `storage_key` and read back through
             * `getObjectUrl`, which produces `${CDN}/https://…` — and this is the
             * shape that avoids repeating it. Null when the cover is a colour, or
             * when there is none.
             */
            coverUrl: row.coverStorageKey
                ? this.r2.configured
                    ? await this.r2.getObjectUrl(row.coverStorageKey)
                    : null
                : row.coverImageUrl ?? null,
            parent: parent ?? null,
            taskType: taskType ?? null,
            defaultBillable: await this.projectDefaultBillable(taskId),
            labels: labelRows.map((l) => l.label),
            watchers: watcherRows.map((w) => ({ ...w.watcher, user: w.user })),
            checklists: checklistRows,
            dependencies: dependencyRows,
            attachments: attachmentRows,
        };
    }
    async listAttachments(taskId, actorId) {
        // Returns working signed R2 download URLs — gate on task read access so a
        // caller can't enumerate another workspace's / private container's files by
        // guessing task ids (IDOR).
        await this.assertTaskReadAccess(taskId, actorId);
        const rows = await this.db.select().from(db_1.taskAttachments).where((0, drizzle_orm_1.eq)(db_1.taskAttachments.taskId, taskId));
        return Promise.all(rows.map(async (row) => ({
            id: row.id,
            fileName: row.fileName,
            fileSize: row.sizeBytes,
            mimeType: row.contentType,
            uploadedBy: row.uploadedById,
            createdAt: row.createdAt,
            storageKey: row.storageKey,
            url: this.r2.configured ? await this.r2.getObjectUrl(row.storageKey) : row.storageKey,
        })));
    }
    async addAttachment(taskId, actorId, data) {
        const ctx = await this.assertTaskWriteAccess(taskId, actorId);
        // Only an uploaded file carries a mandatory declared byte size. An external
        // hyperlink attachment (url present, no storageKey) has no size to validate,
        // so requiring one here wrongly 400'd every "attach by link".
        if (data.storageKey != null || data.url == null) {
            this.assertAttachmentSize(data.sizeBytes);
        }
        // Cross-tenant object-reference guard. A client-supplied `storageKey` must
        // sit under THIS task's own R2 upload prefix (exactly what
        // createAttachmentUploadUrl signs) — otherwise a caller could register an
        // attachment pointing at another workspace's object and get a signed URL for
        // it. The `url` path stays open for genuine external hyperlinks but must be a
        // real http(s) URL, so it can't smuggle a raw storage key past this check.
        const prefix = `workspaces/${ctx.workspaceId}/tasks/${taskId}/attachments/`;
        if (data.storageKey != null) {
            if (!data.storageKey.startsWith(prefix)) {
                throw new common_1.BadRequestException('storageKey must reference this task’s own upload prefix');
            }
        }
        else if (data.url != null && !(0, external_links_util_1.isHttpUrl)(data.url)) {
            throw new common_1.BadRequestException('A file attachment requires a storageKey from the presign step');
        }
        const [task] = await this.db.select().from(db_1.tasks).where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId)).limit(1);
        if (!task)
            throw new common_1.NotFoundException('Task not found');
        const storageKey = data.storageKey ?? data.url;
        if (!storageKey)
            throw new common_1.BadRequestException('storageKey is required');
        const [row] = await this.db
            .insert(db_1.taskAttachments)
            .values({
            taskId,
            uploadedById: actorId,
            fileName: data.fileName,
            contentType: data.contentType ?? 'application/octet-stream',
            sizeBytes: data.sizeBytes ?? 0,
            storageKey,
        })
            .returning();
        await this.logActivity({
            taskId,
            actorId,
            action: 'attachment_added',
            meta: { attachmentId: row.id, fileName: row.fileName },
        });
        // Make the uploaded file searchable under the `file` entity type (Plan §11.1).
        void this.indexAttachmentInSearch(row, taskId);
        return {
            id: row.id,
            fileName: row.fileName,
            fileSize: row.sizeBytes,
            mimeType: row.contentType,
            uploadedBy: row.uploadedById,
            createdAt: row.createdAt,
            storageKey: row.storageKey,
            url: this.r2.configured ? await this.r2.getObjectUrl(row.storageKey) : row.storageKey,
        };
    }
    async removeAttachment(taskId, attachmentId, actorId) {
        await this.assertTaskWriteAccess(taskId, actorId);
        const [attachment] = await this.db
            .select({
            id: db_1.taskAttachments.id,
            uploadedById: db_1.taskAttachments.uploadedById,
            storageKey: db_1.taskAttachments.storageKey,
        })
            .from(db_1.taskAttachments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskAttachments.id, attachmentId), (0, drizzle_orm_1.eq)(db_1.taskAttachments.taskId, taskId)))
            .limit(1);
        if (!attachment)
            throw new common_1.NotFoundException('Attachment not found');
        // §4.5 — deletion is restricted to the uploader OR a workspace moderator
        // (mirrors deleteComment). A plain task-writer must not be able to remove
        // another member's attachment.
        if (attachment.uploadedById !== actorId &&
            !(await this.isTaskWorkspaceModerator(taskId, actorId))) {
            throw new common_1.ForbiddenException('Only the uploader or a workspace admin can delete this attachment');
        }
        await this.db
            .delete(db_1.taskAttachments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskAttachments.id, attachmentId), (0, drizzle_orm_1.eq)(db_1.taskAttachments.taskId, taskId)));
        if (this.r2.configured) {
            try {
                await this.r2.deleteObject(attachment.storageKey);
            }
            catch {
                // best-effort cleanup
            }
        }
        await this.logActivity({
            taskId,
            actorId,
            action: 'attachment_removed',
            meta: { attachmentId },
        });
        return { ok: true };
    }
    async updateTask(taskId, actorId, patch) {
        await this.assertTaskWriteAccess(taskId, actorId);
        /*
         * §V2-09 — the cover fields are spread into the update unchecked, so they
         * are checked here.
         *
         * `coverImageUrl` is the picker's Link tab: an image somewhere else on the
         * web, stored as given and rendered as given. Anything that is not an
         * http(s) URL would either render as a broken image or, worse, run — a
         * `javascript:` cover is a stored XSS on every viewer of the task.
         */
        if (patch.coverImageUrl != null && !/^https?:\/\//i.test(patch.coverImageUrl)) {
            throw new common_1.BadRequestException('A cover link must be an http(s) image URL');
        }
        // Reposition is a percentage for `object-position`; outside 0–100 it would
        // silently push the image out of its own banner.
        if (patch.coverOffsetY != null && (!Number.isFinite(patch.coverOffsetY) || patch.coverOffsetY < 0 || patch.coverOffsetY > 100)) {
            throw new common_1.BadRequestException('Cover position must be between 0 and 100');
        }
        const [before] = await this.db.select().from(db_1.tasks).where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId));
        if (!before)
            throw new common_1.NotFoundException('Task not found');
        // Re-parenting: null promotes a subtask to a task of its own. Anything else
        // has to keep the one-level rule that createTask enforces, and must not
        // make the task its own ancestor.
        if (patch.parentTaskId !== undefined && patch.parentTaskId !== null) {
            if (patch.parentTaskId === taskId) {
                throw new common_1.BadRequestException('A task cannot be its own parent');
            }
            const [parent] = await this.db
                .select({ id: db_1.tasks.id, parentTaskId: db_1.tasks.parentTaskId })
                .from(db_1.tasks)
                .where((0, drizzle_orm_1.eq)(db_1.tasks.id, patch.parentTaskId))
                .limit(1);
            if (!parent)
                throw new common_1.NotFoundException('Parent task not found');
            if (parent.parentTaskId) {
                throw new common_1.BadRequestException('Subtasks can only be nested one level deep');
            }
            // Moving a task that already has children under a parent would create a
            // second level, so refuse it rather than silently orphaning them.
            const [child] = await this.db
                .select({ id: db_1.tasks.id })
                .from(db_1.tasks)
                .where((0, drizzle_orm_1.eq)(db_1.tasks.parentTaskId, taskId))
                .limit(1);
            if (child) {
                throw new common_1.BadRequestException('A task with subtasks cannot become a subtask itself');
            }
        }
        // Resolve the requested status to its canonical key + category bucket
        // so we can drive completion / blocker semantics off `category` rather
        // than hard-coded enum values.
        let nextCategory;
        if (patch.status !== undefined) {
            const resolved = await this.resolveStatusForList(before.listId, patch.status);
            patch.status = resolved.key;
            nextCategory = resolved.category;
            if (nextCategory !== 'open') {
                const blockers = await this.getOpenBlockers(taskId);
                if (blockers.length > 0) {
                    throw new common_1.BadRequestException(`Task is blocked by open dependencies: ${blockers.map((b) => `${b.title} (${b.id})`).join(', ')}`);
                }
            }
        }
        const set = { ...patch, updatedAt: new Date() };
        if (nextCategory) {
            set.statusCategory = nextCategory;
            const wasClosed = before.statusCategory === 'closed';
            if (nextCategory === 'closed' && !wasClosed)
                set.completedAt = new Date();
            if (nextCategory !== 'closed' && wasClosed)
                set.completedAt = null;
        }
        // §1.1 — the third way these two can be changed. The task sheet has a
        // diamond toggle that PATCHes isMilestone directly, and the type picker
        // sits next to it: without this, using one leaves the other stale and the
        // Milestone type filter cannot find a task the app is drawing as a
        // milestone. Only fills in a *missing* type — a task deliberately typed as
        // something else keeps that type and just carries the marker.
        // (This path cannot set the type itself — that is PATCH /tasks/:id/task-type
        //  — so there is no caller intent to preserve here, only consistency.)
        if (set.isMilestone === true && !before.taskTypeId) {
            const milestoneType = await this.milestoneTypeForList(before.listId);
            if (milestoneType)
                set.taskTypeId = milestoneType;
        }
        if (set.isMilestone === false && before.taskTypeId) {
            if (await this.typeIsMilestone(before.taskTypeId))
                set.taskTypeId = null;
        }
        /*
         * §V2-08 `[15:27]` — description history, recorded BEFORE the row changes.
         *
         * It has to happen here, between reading `before` and writing `set`,
         * because what history keeps is the text that is about to be lost. A
         * moment later it is unrecoverable.
         */
        if ('description' in patch && patch.description !== before.description) {
            await this.recordDescriptionRevision(taskId, actorId, before.description ?? null);
        }
        const [after] = await this.db.update(db_1.tasks).set(set).where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId)).returning();
        // Auto-materialise the next occurrence when a recurring task is completed,
        // handing the recurrence forward to it. Guarded so any hiccup never blocks
        // the status change itself. No-op for the (vast majority) non-recurring tasks.
        if (nextCategory === 'closed' &&
            before.statusCategory !== 'closed' &&
            before.recurrence) {
            try {
                const rec = before.recurrence;
                const next = await this.createNextRecurringOccurrence(taskId, actorId, rec.cadenceDays ?? null, rec.rule ?? null);
                await this.db.update(db_1.tasks).set({ recurrence: before.recurrence }).where((0, drizzle_orm_1.eq)(db_1.tasks.id, next.nextTaskId));
                await this.db.update(db_1.tasks).set({ recurrence: null }).where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId));
            }
            catch {
                // Recurrence is best-effort; the completion still stands.
            }
        }
        // Emit activity log entries for the interesting transitions.
        if (patch.status && patch.status !== before.status) {
            await this.logActivity({
                taskId,
                actorId,
                action: 'status_changed',
                meta: { from: before.status, to: patch.status },
            });
        }
        if (patch.priority && patch.priority !== before.priority) {
            await this.logActivity({
                taskId,
                actorId,
                action: 'priority_changed',
                meta: { from: before.priority, to: patch.priority },
            });
        }
        if ('dueDate' in patch && (patch.dueDate?.getTime() ?? null) !== (before.dueDate?.getTime() ?? null)) {
            await this.logActivity({
                taskId,
                actorId,
                action: 'due_date_changed',
                meta: { from: before.dueDate, to: patch.dueDate ?? null },
            });
        }
        if ((patch.title && patch.title !== before.title) ||
            ('description' in patch && patch.description !== before.description) ||
            'timeEstimate' in patch) {
            await this.logActivity({ taskId, actorId, action: 'updated', meta: { fields: Object.keys(patch) } });
        }
        this.realtime.emitToList(after.listId, {
            type: 'task.updated',
            listId: after.listId,
            taskId,
            patch: set,
        });
        this.realtime.emitToTask(taskId, {
            type: 'task.updated',
            listId: after.listId,
            taskId,
            patch: set,
        });
        if ('title' in patch || 'description' in patch)
            void this.indexTaskInSearch(taskId);
        // Fire automation/webhook events
        const ctx = await this.resolveWorkspaceForList(after.listId);
        if (ctx) {
            const hydrated = await this.getTask(taskId);
            if (!hydrated)
                throw new common_1.NotFoundException('Task not found');
            if (patch.status && patch.status !== before.status) {
                void this.fireTaskEvent('task.status_changed', ctx.workspaceId, {
                    task: hydrated,
                    from: before.status,
                    to: patch.status,
                }, {
                    taskId,
                    userId: actorId,
                    projectId: ctx.projectId,
                    listId: after.listId,
                    changedField: 'status',
                    oldValue: before.status,
                    newValue: patch.status,
                });
            }
            const workspaceName = await this.resolveWorkspaceName(ctx.workspaceId);
            const taskUrl = this.buildTaskUrl(ctx.workspaceId, ctx.spaceId, ctx.projectId, after.listId, taskId);
            void this.notifyTaskUpdate({
                taskId,
                actorId,
                workspaceId: ctx.workspaceId,
                workspaceName,
                taskTitle: hydrated.title,
                taskUrl,
                patch,
                before: {
                    status: before.status,
                    priority: before.priority,
                    title: before.title,
                    dueDate: before.dueDate,
                    description: before.description,
                },
            });
            void this.fireTaskEvent('task.updated', ctx.workspaceId, { task: hydrated, patch }, {
                taskId,
                userId: actorId,
                projectId: ctx.projectId,
                listId: after.listId,
            });
            // Sync to connected calendars when any field that drives an event
            // surface (date / archive / title / description) changed.
            const calendarRelevant = 'dueDate' in patch ||
                'startDate' in patch ||
                'isArchived' in patch ||
                'title' in patch ||
                'description' in patch;
            if (calendarRelevant)
                this.fireCalendarPush(taskId);
            return hydrated;
        }
        return this.getTask(taskId);
    }
    async bulkUpdateTasks(taskIds, actorId, patch) {
        const uniqueTaskIds = [...new Set(taskIds)].filter(Boolean);
        if (uniqueTaskIds.length === 0) {
            throw new common_1.BadRequestException('taskIds are required');
        }
        if (uniqueTaskIds.length > 200) {
            throw new common_1.BadRequestException('Bulk updates are limited to 200 tasks at a time');
        }
        if (Object.keys(patch).length === 0) {
            throw new common_1.BadRequestException('patch is required');
        }
        const fieldPatch = {};
        if ('priority' in patch)
            fieldPatch.priority = patch.priority;
        if ('status' in patch)
            fieldPatch.status = patch.status;
        if ('startDate' in patch)
            fieldPatch.startDate = patch.startDate;
        if ('dueDate' in patch)
            fieldPatch.dueDate = patch.dueDate;
        if ('timeEstimate' in patch)
            fieldPatch.timeEstimate = patch.timeEstimate;
        if ('isArchived' in patch)
            fieldPatch.isArchived = patch.isArchived;
        const assigneeIdsAdd = [...new Set(patch.assigneeIdsAdd ?? [])].filter(Boolean);
        const assigneeIdsRemove = [...new Set(patch.assigneeIdsRemove ?? [])].filter(Boolean);
        const labelIdsAdd = [...new Set(patch.labelIdsAdd ?? [])].filter(Boolean);
        const labelIdsRemove = [...new Set(patch.labelIdsRemove ?? [])].filter(Boolean);
        const dependenciesAdd = patch.dependenciesAdd ?? [];
        const dependenciesRemove = patch.dependenciesRemove ?? [];
        const hasRelationshipOps = assigneeIdsAdd.length > 0 ||
            assigneeIdsRemove.length > 0 ||
            labelIdsAdd.length > 0 ||
            labelIdsRemove.length > 0 ||
            dependenciesAdd.length > 0 ||
            dependenciesRemove.length > 0;
        // Optional cross-list move (Plan §5.1 bulk "Move to list"). Validate the
        // target list exists and capture its workspace up front so we can reject
        // moves that would cross a workspace boundary, and append moved tasks after
        // whatever's already in the destination list.
        const moveListId = typeof patch.listId === 'string' && patch.listId ? patch.listId : undefined;
        let moveTargetWorkspaceId = null;
        let movePosition = 0;
        if (moveListId) {
            const target = await this.resolveWorkspaceForList(moveListId);
            if (!target)
                throw new common_1.NotFoundException('Target list not found');
            moveTargetWorkspaceId = target.workspaceId;
            const [maxRow] = await this.db
                .select({ maxPos: (0, drizzle_orm_1.sql) `coalesce(max(${db_1.tasks.position}), -1)` })
                .from(db_1.tasks)
                .where((0, drizzle_orm_1.eq)(db_1.tasks.listId, moveListId));
            movePosition = (maxRow?.maxPos ?? -1) + 1;
        }
        if (Object.keys(fieldPatch).length === 0 && !hasRelationshipOps && !moveListId) {
            throw new common_1.BadRequestException('patch did not include any supported bulk operation');
        }
        const updated = [];
        const failed = [];
        for (const taskId of uniqueTaskIds) {
            try {
                let next = null;
                if (Object.keys(fieldPatch).length > 0) {
                    next = await this.updateTask(taskId, actorId, fieldPatch);
                }
                else {
                    await this.assertTaskWriteAccess(taskId, actorId);
                }
                for (const userId of assigneeIdsAdd) {
                    await this.addAssignee(taskId, userId, actorId);
                }
                for (const userId of assigneeIdsRemove) {
                    await this.removeAssignee(taskId, userId, actorId);
                }
                for (const labelId of labelIdsAdd) {
                    await this.addLabel(taskId, labelId, actorId);
                }
                for (const labelId of labelIdsRemove) {
                    await this.removeLabel(taskId, labelId, actorId);
                }
                for (const dep of dependenciesAdd) {
                    await this.addDependency(taskId, dep.relatedTaskId, dep.type, actorId);
                }
                for (const dep of dependenciesRemove) {
                    const [existing] = await this.db
                        .select({ id: db_1.taskDependencies.id })
                        .from(db_1.taskDependencies)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskDependencies.taskId, taskId), (0, drizzle_orm_1.eq)(db_1.taskDependencies.relatedTaskId, dep.relatedTaskId), (0, drizzle_orm_1.eq)(db_1.taskDependencies.type, dep.type)))
                        .limit(1);
                    if (existing) {
                        await this.removeDependency(existing.id, actorId);
                    }
                }
                if (moveListId) {
                    const moveCtx = await this.assertTaskWriteAccess(taskId, actorId);
                    if (moveTargetWorkspaceId && moveCtx.workspaceId !== moveTargetWorkspaceId) {
                        throw new common_1.BadRequestException('Cannot move a task to a list in a different workspace');
                    }
                    // moveTask logs a 'moved' activity + emits realtime events, so the
                    // bulk move stays audit-aware exactly like the single-task move.
                    if (moveCtx.listId !== moveListId) {
                        next = await this.moveTask(taskId, actorId, moveListId, movePosition++);
                    }
                }
                if (!next || hasRelationshipOps) {
                    next = await this.getTask(taskId);
                }
                updated.push(next);
            }
            catch (err) {
                failed.push({
                    taskId,
                    reason: err instanceof Error ? err.message : 'unknown error',
                });
            }
        }
        return {
            requested: uniqueTaskIds.length,
            updatedCount: updated.length,
            failedCount: failed.length,
            updated,
            failed,
        };
    }
    /**
     * Persist (or clear) a task's recurrence config. Once set, completing the
     * task auto-creates the next occurrence (see updateTask). Pass null to stop
     * the task recurring.
     */
    async setRecurrence(taskId, actorId, config) {
        await this.assertTaskWriteAccess(taskId, actorId);
        const task = await this.getTask(taskId);
        if (!task)
            throw new common_1.NotFoundException('Task not found');
        let value = null;
        if (config) {
            if (config.rule) {
                if (!['daily', 'weekly', 'monthly'].includes(config.rule.mode)) {
                    throw new common_1.BadRequestException('Recurrence rule mode must be daily, weekly, or monthly');
                }
                value = { rule: config.rule };
            }
            else if (config.cadenceDays != null) {
                const n = config.cadenceDays;
                if (!Number.isFinite(n) || n <= 0 || n > 365) {
                    throw new common_1.BadRequestException('cadenceDays must be between 1 and 365');
                }
                value = { cadenceDays: n };
            }
            else {
                throw new common_1.BadRequestException('Provide cadenceDays or rule, or null to clear recurrence');
            }
        }
        const [row] = await this.db
            .update(db_1.tasks)
            .set({ recurrence: value, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId))
            .returning();
        return row;
    }
    async createNextRecurringOccurrence(taskId, actorId, cadenceDays, recurrenceRule = null, preserveAssignees = true) {
        if (!recurrenceRule && (!Number.isFinite(cadenceDays) || (cadenceDays ?? 0) <= 0 || (cadenceDays ?? 0) > 365)) {
            throw new common_1.BadRequestException('cadenceDays must be between 1 and 365 when recurrenceRule is not provided');
        }
        await this.assertTaskWriteAccess(taskId, actorId);
        const source = await this.getTask(taskId);
        if (!source)
            throw new common_1.NotFoundException('Task not found');
        const shift = (input) => recurrenceRule
            ? this.shiftByRecurrenceRule(input, recurrenceRule)
            : (() => {
                if (!input || !cadenceDays)
                    return undefined;
                const date = new Date(input);
                date.setDate(date.getDate() + cadenceDays);
                return date;
            })();
        let assigneeIds;
        if (preserveAssignees) {
            assigneeIds = (source.assignees ?? []).map((assignee) => assignee.userId);
        }
        const created = await this.createTask({
            listId: source.listId,
            title: source.title,
            description: source.description ?? undefined,
            priority: source.priority,
            // If the source was already closed, fall back to the list's default
            // open status; otherwise preserve. resolveStatusForList runs again
            // inside createTask so the value is validated/normalised.
            status: source.statusCategory === 'closed'
                ? undefined
                : source.status,
            startDate: shift(source.startDate),
            dueDate: shift(source.dueDate),
            timeEstimate: source.timeEstimate ?? undefined,
            createdById: actorId,
            assigneeIds,
            parentTaskId: source.parentTaskId ?? undefined,
        });
        if (!created)
            throw new common_1.NotFoundException('Failed to create recurring task');
        await this.logActivity({
            taskId,
            actorId,
            action: 'updated',
            meta: {
                recurringNextTaskId: created.id,
                cadenceDays: cadenceDays ?? null,
                recurrenceRule,
            },
        });
        return {
            sourceTaskId: taskId,
            nextTaskId: created.id,
            cadenceDays: cadenceDays ?? null,
            recurrenceRule,
            task: created,
        };
    }
    /**
     * ARCHIVE. The name is `deleteTask` and the route is `DELETE /tasks/:id`
     * because that is what they have always been; what the method does is archive
     * — `isArchived`, `archivedAt`, activity `archived`, listed under
     * `GET /workspaces/:id/archived-tasks`, restored by `POST /tasks/:id/restore`,
     * and kept for good. The frame's other row, Delete, is `binTask` below.
     */
    async deleteTask(taskId, actorId, ipAddress) {
        // allowArchived: deleting something already binned is a no-op, not a 409.
        await this.assertTaskWriteAccess(taskId, actorId, { allowArchived: true });
        // Managers can only delete within their own spaces (§3.3). Layered after the
        // general write-access check so admins/members keep their existing rights.
        await this.assertManagerDeleteScope(taskId, actorId);
        const [before] = await this.db.select().from(db_1.tasks).where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId));
        if (!before)
            throw new common_1.NotFoundException('Task not found');
        /*
         * Archiving a task that is already in the bin would stamp `archivedAt` on
         * top of `deletedAt` and the row would then be listed under BOTH Archived
         * tasks and Trash — one deletion showing up as two. The bin is the stronger
         * state; leave it alone.
         */
        if (before.deletedAt)
            return { ok: true };
        await this.db
            .update(db_1.tasks)
            .set({ isArchived: true, archivedAt: new Date(), archivedById: actorId ?? null, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId));
        await this.logActivity({ taskId, actorId, action: 'archived' });
        this.realtime.emitToList(before.listId, { type: 'task.deleted', listId: before.listId, taskId });
        // Fire delete event
        const ctx = await this.resolveWorkspaceForList(before.listId);
        if (ctx) {
            // §13.3 — audit the container deletion (task archival) with actor + IP.
            await this.security.logAuditEvent({
                workspaceId: ctx.workspaceId,
                actorId,
                action: 'task.deleted',
                resourceType: 'task',
                resourceId: taskId,
                description: `Archived task "${before.title}"`,
                ipAddress,
            });
            void this.fireTaskEvent('task.deleted', ctx.workspaceId, { taskId, listId: before.listId }, {
                taskId,
                userId: actorId,
                projectId: ctx.projectId,
                listId: before.listId,
            });
        }
        // Remove from every connected calendar — fire-and-forget.
        void this.calendarSync.deleteEverywhere(taskId).catch(() => undefined);
        // …and out of the search index, for the same reason: a binned task is not
        // something anyone should find by searching, and leaving it there made the
        // index fill up with work that had been thrown away.
        void this.search.removeTask(taskId).catch(() => undefined);
        return { ok: true };
    }
    /**
     * §V2-08 frame `15:32` — **DELETE**, the red row under Archive.
     *
     * Not `deleteTask` with a different label. `deleteTask` archives: the task
     * keeps living under Settings → Archived tasks, for good, and nothing ever
     * removes it. This puts the task in the workspace **Trash**, the same surface
     * that already holds deleted spaces, folders, projects, lists and docs, where
     * it can be restored for `TRASH_RETENTION_DAYS` and is then hard-deleted by
     * the same nightly purge — or at once with "Delete forever".
     *
     * The two states are told apart by `deletedAt` and nothing else: the Trash
     * selects tasks on `deletedAt IS NOT NULL`, so archiving can never put a task
     * there and can never get one purged.
     *
     * `isArchived` goes true for both, deliberately. Every read path in the
     * product — lists, search, reports, planner, AI, calendar sync — hides a task
     * on that one flag, so a delete that left it false would take the task out of
     * nothing. What stays empty here is `archivedAt`/`archivedById`: those belong
     * to the other action, and the Trash's "Deleted by" column reads
     * `deletedById`, so filling both would make one deletion look like two.
     */
    async binTask(taskId, actorId, ipAddress) {
        // allowArchived: an archived task can still be deleted — that is the whole
        // point of two states — and re-deleting a binned one is a no-op, not a 409.
        await this.assertTaskWriteAccess(taskId, actorId, { allowArchived: true });
        // Managers can only delete within their own spaces (§3.3), exactly as for
        // archiving; a weaker check here would be a way around that one.
        await this.assertManagerDeleteScope(taskId, actorId);
        const [before] = await this.db.select().from(db_1.tasks).where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId));
        if (!before)
            throw new common_1.NotFoundException('Task not found');
        // Idempotent: a second delete must not re-stamp the clock and hand the task
        // another thirty days in the bin.
        if (before.deletedAt) {
            return { ok: true, deletedAt: before.deletedAt.toISOString(), retentionDays: trash_service_1.TRASH_RETENTION_DAYS };
        }
        const now = new Date();
        await this.db
            .update(db_1.tasks)
            .set({ isArchived: true, deletedAt: now, deletedById: actorId ?? null, updatedAt: now })
            .where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId));
        await this.logActivity({ taskId, actorId, action: 'deleted' });
        this.realtime.emitToList(before.listId, { type: 'task.deleted', listId: before.listId, taskId });
        const ctx = await this.resolveWorkspaceForList(before.listId);
        if (ctx) {
            // §13.3 — audited apart from `task.deleted` (which archiving raises), so
            // the audit log can tell a reversible archive from a binning that has a
            // clock on it.
            await this.security.logAuditEvent({
                workspaceId: ctx.workspaceId,
                actorId,
                action: 'task.trashed',
                resourceType: 'task',
                resourceId: taskId,
                description: `Moved task "${before.title}" to the trash`,
                ipAddress,
            });
            void this.fireTaskEvent('task.deleted', ctx.workspaceId, { taskId, listId: before.listId }, {
                taskId,
                userId: actorId,
                projectId: ctx.projectId,
                listId: before.listId,
            });
        }
        // Same clean-up as archiving: off every connected calendar and out of the
        // search index. A task in the bin is not something anyone should find.
        void this.calendarSync.deleteEverywhere(taskId).catch(() => undefined);
        void this.search.removeTask(taskId).catch(() => undefined);
        return { ok: true, deletedAt: now.toISOString(), retentionDays: trash_service_1.TRASH_RETENTION_DAYS };
    }
    /** Restore an archived (soft-deleted) task (Plan §13.4). */
    async restoreTask(taskId, actorId) {
        // allowArchived: this is the one operation that exists for binned tasks.
        await this.assertTaskWriteAccess(taskId, actorId, { allowArchived: true });
        // §3.3 — restore is the inverse of delete, so a manager must be scoped to
        // their own spaces here too; otherwise they could un-archive a task outside
        // their space that they were correctly blocked from deleting.
        await this.assertManagerDeleteScope(taskId, actorId);
        const [before] = await this.db.select().from(db_1.tasks).where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId));
        if (!before)
            throw new common_1.NotFoundException('Task not found');
        /*
         * This un-archives. A task in the Trash is not archived — it is deleted,
         * with a purge date — and un-archiving it here would put it back in every
         * list while the Trash still offered to delete it forever: live and binned
         * at once. Restoring from the Trash is a different door, and it is the one
         * that clears `deletedAt`.
         */
        if (before.deletedAt) {
            throw new common_1.ConflictException('This task is in the trash. Restore it from Trash instead.');
        }
        if (!before.isArchived)
            return before;
        const [row] = await this.db
            .update(db_1.tasks)
            .set({ isArchived: false, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId))
            .returning();
        await this.logActivity({ taskId, actorId, action: 'restored' });
        this.realtime.emitToList(before.listId, {
            type: 'task.updated',
            listId: before.listId,
            taskId,
            patch: { isArchived: false },
        });
        // Binning took it out of the index, so restoring has to put it back —
        // otherwise a restored task would look fine everywhere except search,
        // where it would be permanently unfindable.
        void this.indexTaskInSearch(taskId);
        return row;
    }
    async moveTask(taskId, actorId, targetListId, position) {
        await this.assertTaskWriteAccess(taskId, actorId);
        const [before] = await this.db.select().from(db_1.tasks).where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId));
        if (!before)
            throw new common_1.NotFoundException('Task not found');
        await this.db
            .update(db_1.tasks)
            .set({ listId: targetListId, position, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId));
        await this.logActivity({
            taskId,
            actorId,
            action: 'moved',
            meta: { fromListId: before.listId, toListId: targetListId, position },
        });
        this.realtime.emitToList(before.listId, { type: 'task.moved', listId: before.listId, taskId, toListId: targetListId });
        this.realtime.emitToList(targetListId, { type: 'task.moved', listId: targetListId, taskId, toListId: targetListId });
        return this.getTask(taskId);
    }
    // --- Assignees -----------------------------------------------------------
    async addAssignee(taskId, userId, actorId) {
        await this.assertTaskWriteAccess(taskId, actorId);
        await this.db.insert(db_1.taskAssignees).values({ taskId, userId }).onConflictDoNothing();
        if (await this.notifications.autoFollowEnabled(userId)) {
            await this.db.insert(db_1.taskWatchers).values({ taskId, userId }).onConflictDoNothing();
        }
        await this.logActivity({ taskId, actorId, action: 'assigned', meta: { userId } });
        const [taskRow] = await this.db.select().from(db_1.tasks).where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId));
        if (taskRow) {
            const ctx = await this.resolveWorkspaceForList(taskRow.listId);
            if (ctx) {
                void this.fireTaskEvent('task.assigned', ctx.workspaceId, { taskId, assigneeId: userId }, {
                    taskId,
                    userId: actorId,
                    projectId: ctx.projectId,
                    listId: taskRow.listId,
                    newValue: userId,
                });
                // The automations UI exposes this as the "Task assignee changes" trigger.
                // Fire it directly (not via fireTaskEvent) to avoid a duplicate webhook.
                void this.automations
                    .fire('task.assignee_changed', {
                    workspaceId: ctx.workspaceId,
                    taskId,
                    userId: actorId,
                    projectId: ctx.projectId,
                    listId: taskRow.listId,
                    newValue: userId,
                })
                    .catch(() => { });
                // Don't notify someone they assigned themselves
                if (userId !== actorId) {
                    const workspaceName = await this.resolveWorkspaceName(ctx.workspaceId);
                    void this.notifications.create({
                        userId,
                        workspaceId: ctx.workspaceId,
                        actorId,
                        type: 'task_assigned',
                        title: `You were assigned "${taskRow.title}"`,
                        target: { entityType: 'task', entityId: taskId, url: this.buildTaskUrl(ctx.workspaceId, ctx.spaceId, ctx.projectId, taskRow.listId, taskId) },
                        emailContext: { taskTitle: taskRow.title, workspaceName },
                    });
                }
                // §G10-6 — and everybody watching hears who it moved to.
                void this.notifyWatchersOfAssigneeChange({ taskId, actorId, subjectId: userId, added: true });
            }
        }
        return this.getTask(taskId);
    }
    /**
     * §G10-6 [12:21] — watchers learn WHO a task moved to, or off.
     *
     * `notifyTaskUpdate` covers status, priority, due date, title and
     * description, and never had an assignee branch — so the single most
     * consequential change on a task, the one that decides whose problem it is,
     * was the one nobody watching was told about. Being assigned notified you;
     * being removed notified you; everybody else found out by noticing.
     *
     * Deliberately NOT folded into `notifyTaskUpdate`: that reads a `before`
     * snapshot of scalar columns, and assignees are rows in another table. Wiring
     * them through it would mean loading assignees on every patch that touches a
     * title.
     *
     * The assignee and the actor are both excluded — each already has a
     * notification of their own, and two for one event reads as a bug.
     */
    async notifyWatchersOfAssigneeChange(params) {
        try {
            const watcherRows = await this.db
                .select({ userId: db_1.taskWatchers.userId })
                .from(db_1.taskWatchers)
                .where((0, drizzle_orm_1.eq)(db_1.taskWatchers.taskId, params.taskId));
            const watcherIds = [...new Set(watcherRows.map((w) => w.userId))].filter((id) => id !== params.actorId && id !== params.subjectId);
            if (watcherIds.length === 0)
                return;
            const [taskRow] = await this.db
                .select({ id: db_1.tasks.id, title: db_1.tasks.title, listId: db_1.tasks.listId })
                .from(db_1.tasks)
                .where((0, drizzle_orm_1.eq)(db_1.tasks.id, params.taskId))
                .limit(1);
            if (!taskRow)
                return;
            const ctx = await this.resolveWorkspaceForList(taskRow.listId);
            if (!ctx)
                return;
            const [subject] = await this.db
                .select({ displayName: db_1.users.displayName })
                .from(db_1.users)
                .where((0, drizzle_orm_1.eq)(db_1.users.id, params.subjectId))
                .limit(1);
            const who = subject?.displayName ?? 'someone';
            const workspaceName = await this.resolveWorkspaceName(ctx.workspaceId);
            const url = this.buildTaskUrl(ctx.workspaceId, ctx.spaceId, ctx.projectId, taskRow.listId, taskRow.id);
            for (const userId of watcherIds) {
                void this.notifications.create({
                    userId,
                    workspaceId: ctx.workspaceId,
                    actorId: params.actorId,
                    type: 'task_updated',
                    title: `"${taskRow.title}" was updated`,
                    body: params.added ? `Assigned to ${who}.` : `${who} was removed.`,
                    target: { entityType: 'task', entityId: taskRow.id, url },
                    emailContext: { taskTitle: taskRow.title, workspaceName },
                });
            }
        }
        catch {
            // Best-effort, like every other fan-out here: a failed notification must
            // never undo the assignment that caused it.
        }
    }
    async removeAssignee(taskId, userId, actorId) {
        await this.assertTaskWriteAccess(taskId, actorId);
        await this.db.delete(db_1.taskAssignees).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskAssignees.taskId, taskId), (0, drizzle_orm_1.eq)(db_1.taskAssignees.userId, userId)));
        await this.logActivity({ taskId, actorId, action: 'unassigned', meta: { userId } });
        // §2.2 — "kisi ne mera hi task kisi aur ko de diya aur mujhe REMOVE kar
        // diya to mujhe woh cheez show ho." Being taken off a task is otherwise
        // something you find out by noticing it is gone.
        if (userId !== actorId) {
            const [taskRow] = await this.db.select().from(db_1.tasks).where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId));
            const ctx = taskRow ? await this.resolveWorkspaceForList(taskRow.listId) : null;
            if (taskRow && ctx) {
                await this.notifications
                    .create({
                    userId,
                    workspaceId: ctx.workspaceId,
                    actorId,
                    type: 'task_unassigned',
                    title: taskRow.title,
                    target: { entityType: 'task', entityId: taskId },
                })
                    .catch(() => undefined);
            }
        }
        // §G10-6 — outside the `userId !== actorId` guard above: taking YOURSELF
        // off a task is still news to whoever is watching it.
        void this.notifyWatchersOfAssigneeChange({ taskId, actorId, subjectId: userId, added: false });
        return this.getTask(taskId);
    }
    // --- Labels --------------------------------------------------------------
    async addLabel(taskId, labelId, actorId) {
        await this.assertTaskWriteAccess(taskId, actorId);
        await this.db.insert(db_1.taskLabelAssignments).values({ taskId, labelId }).onConflictDoNothing();
        await this.logActivity({ taskId, actorId, action: 'label_added', meta: { labelId } });
        return this.getTask(taskId);
    }
    async removeLabel(taskId, labelId, actorId) {
        await this.assertTaskWriteAccess(taskId, actorId);
        await this.db
            .delete(db_1.taskLabelAssignments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskLabelAssignments.taskId, taskId), (0, drizzle_orm_1.eq)(db_1.taskLabelAssignments.labelId, labelId)));
        await this.logActivity({ taskId, actorId, action: 'label_removed', meta: { labelId } });
        return this.getTask(taskId);
    }
    // --- Watchers ------------------------------------------------------------
    async addWatcher(taskId, userId, actorId) {
        await this.db.insert(db_1.taskWatchers).values({ taskId, userId }).onConflictDoNothing();
        this.realtime.emitToTask(taskId, { type: 'watchers.updated', taskId });
        // §2.2 — "FOLLOWER CHANGE — yaani ke agar mere hi task pe koi follower add
        // ho." Told to the people already on the task: it is their task whose
        // roster changed.
        await this.notifyFollowerChanged(taskId, userId, actorId).catch(() => undefined);
        return this.getTask(taskId);
    }
    /** §2.2 — tell a task's assignees that its follower list moved. */
    async notifyFollowerChanged(taskId, subjectId, actorId) {
        const [taskRow] = await this.db.select().from(db_1.tasks).where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId));
        if (!taskRow)
            return;
        const ctx = await this.resolveWorkspaceForList(taskRow.listId);
        if (!ctx)
            return;
        const assignees = await this.db
            .select({ userId: db_1.taskAssignees.userId })
            .from(db_1.taskAssignees)
            .where((0, drizzle_orm_1.eq)(db_1.taskAssignees.taskId, taskId));
        // Not the person who did it, and not the person it was about — neither
        // needs telling what they already know.
        const recipients = new Set(assignees.map((a) => a.userId));
        recipients.delete(subjectId);
        if (actorId)
            recipients.delete(actorId);
        for (const recipient of recipients) {
            await this.notifications
                .create({
                userId: recipient,
                workspaceId: ctx.workspaceId,
                actorId: actorId ?? null,
                type: 'task_follower_changed',
                title: taskRow.title,
                target: { entityType: 'task', entityId: taskId },
            })
                .catch(() => undefined);
        }
    }
    async removeWatcher(taskId, userId, actorId) {
        await this.db.delete(db_1.taskWatchers).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskWatchers.taskId, taskId), (0, drizzle_orm_1.eq)(db_1.taskWatchers.userId, userId)));
        this.realtime.emitToTask(taskId, { type: 'watchers.updated', taskId });
        // The type is task_follower_changed, not task_follower_added: a follower
        // leaving is the same change to the same roster, and she named the event
        // "FOLLOWER CHANGE".
        await this.notifyFollowerChanged(taskId, userId, actorId).catch(() => undefined);
        return this.getTask(taskId);
    }
    // --- Comments ------------------------------------------------------------
    /**
     * §V2-05, frame `04:00` — who can be @-mentioned on this task, and who would
     * be notified about something they cannot open.
     *
     * The workspace's members, each carrying `hasAccess`. The rule is evaluated by
     * `canReachTask`, which mirrors `ResourceMemberGuard` step for step; the
     * memberships it needs are fetched here once as sets rather than once per
     * candidate, so a fifty-person workspace costs a handful of queries and not a
     * hundred.
     *
     * `hasAccess` is only ever FALSE for a real reason, never as a default: a
     * picker that greys people out when it is merely unsure teaches everyone to
     * ignore the warning, which loses the one case it was built for.
     */
    async listMentionCandidates(taskId) {
        const [row] = await this.db
            .select({
            listId: db_1.tasks.listId,
            taskVisibility: db_1.tasks.visibility,
            taskCreatedById: db_1.tasks.createdById,
            listVisibility: db_1.lists.visibility,
            listCreatedById: db_1.lists.createdById,
            projectId: db_1.projects.id,
            projectVisibility: db_1.projects.visibility,
            spaceId: db_1.spaces.id,
            spaceVisibility: db_1.spaces.visibility,
            workspaceId: db_1.spaces.workspaceId,
        })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .leftJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .leftJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException('Task not found');
        const members = row.workspaceId
            ? await this.db
                .select({
                userId: db_1.workspaceMembers.userId,
                role: db_1.workspaceMembers.role,
                email: db_1.users.email,
                displayName: db_1.users.displayName,
                avatarUrl: db_1.users.avatarUrl,
            })
                .from(db_1.workspaceMembers)
                .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.workspaceMembers.userId))
                .where((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, row.workspaceId))
            : [];
        /*
         * Only fetched when they can change the answer. A workspace whose spaces
         * are public — which is most of them — pays for one assignee query and
         * nothing else.
         */
        const assigneeRows = await this.db
            .select({ userId: db_1.taskAssignees.userId })
            .from(db_1.taskAssignees)
            .where((0, drizzle_orm_1.eq)(db_1.taskAssignees.taskId, taskId));
        const spaceRows = row.spaceId && (row.spaceVisibility === 'private' || row.projectVisibility === 'private')
            ? await this.db
                .select({ userId: db_1.spaceMembers.userId, role: db_1.spaceMembers.role })
                .from(db_1.spaceMembers)
                .where((0, drizzle_orm_1.eq)(db_1.spaceMembers.spaceId, row.spaceId))
            : [];
        const projectRows = row.projectId && row.projectVisibility === 'private'
            ? await this.db
                .select({ userId: db_1.projectMembers.userId })
                .from(db_1.projectMembers)
                .where((0, drizzle_orm_1.eq)(db_1.projectMembers.projectId, row.projectId))
            : [];
        const ctx = {
            spaceVisibility: row.spaceVisibility,
            projectId: row.projectId,
            projectVisibility: row.projectVisibility,
            listVisibility: row.listVisibility,
            listCreatedById: row.listCreatedById,
            taskVisibility: row.taskVisibility,
            taskCreatedById: row.taskCreatedById,
            spaceMemberIds: new Set(spaceRows.map((s) => s.userId)),
            spaceAdminIds: new Set(spaceRows.filter((s) => s.role === 'admin').map((s) => s.userId)),
            projectMemberIds: new Set(projectRows.map((p) => p.userId)),
            assigneeIds: new Set(assigneeRows.map((a) => a.userId)),
        };
        return members.map((m) => ({
            userId: m.userId,
            email: m.email,
            displayName: m.displayName,
            avatarUrl: m.avatarUrl,
            role: m.role,
            hasAccess: (0, mention_access_1.canReachTask)(ctx, { userId: m.userId, workspaceRole: m.role }),
        }));
    }
    /**
     * §V2-08 — merge this task into another one.
     *
     * The task named by `taskId` is the one being merged AWAY; `targetTaskId`
     * survives. See `task-merge.ts` for which tables move and which deliberately
     * do not.
     *
     * NOT WRAPPED IN A TRANSACTION, and that is a compromise worth naming. The
     * moves are `UPDATE ... SET task_id` statements against a dozen tables; a
     * failure part-way leaves work split across two tasks, both of which are
     * still readable and neither of which has lost anything, because nothing is
     * deleted here. The source is binned LAST, so a failure before that leaves a
     * merge that can simply be run again. If this file ever gains a delete, it
     * gains a transaction on the same commit.
     *
     * Every move is counted and returned. A merge that reports what it moved is a
     * merge somebody can check; `{ ok: true }` is a merge you have to take on
     * faith, and this is the operation where faith is least warranted.
     */
    async mergeTask(taskId, targetTaskId, actorId) {
        const [source] = await this.db
            .select({ id: db_1.tasks.id, listId: db_1.tasks.listId, parentTaskId: db_1.tasks.parentTaskId, title: db_1.tasks.title, description: db_1.tasks.description, isArchived: db_1.tasks.isArchived })
            .from(db_1.tasks)
            .where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId))
            .limit(1);
        const [target] = await this.db
            .select({ id: db_1.tasks.id, listId: db_1.tasks.listId, parentTaskId: db_1.tasks.parentTaskId, title: db_1.tasks.title, description: db_1.tasks.description, isArchived: db_1.tasks.isArchived })
            .from(db_1.tasks)
            .where((0, drizzle_orm_1.eq)(db_1.tasks.id, targetTaskId))
            .limit(1);
        const sourceChildren = source
            ? await this.db.select({ id: db_1.tasks.id }).from(db_1.tasks).where((0, drizzle_orm_1.eq)(db_1.tasks.parentTaskId, taskId))
            : [];
        const targetChildren = target
            ? await this.db.select({ id: db_1.tasks.id }).from(db_1.tasks).where((0, drizzle_orm_1.eq)(db_1.tasks.parentTaskId, targetTaskId))
            : [];
        const refusal = (0, task_merge_1.mergeRefusal)(source ?? null, target ?? null, sourceChildren.length > 0, new Set(targetChildren.map((c) => c.id)));
        if (refusal === 'source-missing' || refusal === 'target-missing') {
            throw new common_1.NotFoundException(task_merge_1.MERGE_REFUSAL_MESSAGE[refusal]);
        }
        if (refusal)
            throw new common_1.BadRequestException(task_merge_1.MERGE_REFUSAL_MESSAGE[refusal]);
        // Both tasks must be somewhere this person may write. Checked for the
        // target too: merging is a write to it, and a task you cannot edit is not a
        // task you may pour another one into.
        await this.assertTaskWriteAccess(taskId, actorId);
        await this.assertTaskWriteAccess(targetTaskId, actorId);
        const moved = (0, task_merge_1.emptyMergeTally)();
        const count = (rows) => (Array.isArray(rows) ? rows.length : 0);
        /*
         * The plain moves: one owner, no uniqueness to collide with.
         */
        moved.comments = count(await this.db.update(db_1.taskComments).set({ taskId: targetTaskId }).where((0, drizzle_orm_1.eq)(db_1.taskComments.taskId, taskId)).returning({ id: db_1.taskComments.id }));
        moved.attachments = count(await this.db.update(db_1.taskAttachments).set({ taskId: targetTaskId }).where((0, drizzle_orm_1.eq)(db_1.taskAttachments.taskId, taskId)).returning({ id: db_1.taskAttachments.id }));
        moved.checklists = count(await this.db.update(db_1.taskChecklists).set({ taskId: targetTaskId }).where((0, drizzle_orm_1.eq)(db_1.taskChecklists.taskId, taskId)).returning({ id: db_1.taskChecklists.id }));
        moved.timeEntries = count(await this.db.update(db_1.timeEntries).set({ taskId: targetTaskId }).where((0, drizzle_orm_1.eq)(db_1.timeEntries.taskId, taskId)).returning({ id: db_1.timeEntries.id }));
        moved.externalLinks = count(await this.db.update(db_1.taskExternalLinks).set({ taskId: targetTaskId }).where((0, drizzle_orm_1.eq)(db_1.taskExternalLinks.taskId, taskId)).returning({ id: db_1.taskExternalLinks.id }));
        moved.reminders = count(await this.db.update(db_1.reminders).set({ taskId: targetTaskId }).where((0, drizzle_orm_1.eq)(db_1.reminders.taskId, taskId)).returning({ id: db_1.reminders.id }));
        moved.timeBlocks = count(await this.db.update(db_1.taskTimeBlocks).set({ taskId: targetTaskId }).where((0, drizzle_orm_1.eq)(db_1.taskTimeBlocks.taskId, taskId)).returning({ id: db_1.taskTimeBlocks.id }));
        // The source's own subtasks become the survivor's.
        moved.subtasks = count(await this.db.update(db_1.tasks).set({ parentTaskId: targetTaskId }).where((0, drizzle_orm_1.eq)(db_1.tasks.parentTaskId, taskId)).returning({ id: db_1.tasks.id }));
        /*
         * The moves that can collide. Every one of these tables is unique on
         * (task, other thing), so a straight UPDATE throws the moment both tasks
         * share an assignee, a label or a watcher — which duplicates being merged
         * almost always do. Each row is moved on its own and a collision is
         * DROPPED, because the target already has what the row was carrying.
         */
        moved.assignees = await this.moveOrDrop(db_1.taskAssignees, taskId, targetTaskId, (r) => (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskAssignees.taskId, targetTaskId), (0, drizzle_orm_1.eq)(db_1.taskAssignees.userId, r.userId)), { taskId: db_1.taskAssignees.taskId, id: db_1.taskAssignees.id, userId: db_1.taskAssignees.userId });
        moved.watchers = await this.moveOrDrop(db_1.taskWatchers, taskId, targetTaskId, (r) => (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskWatchers.taskId, targetTaskId), (0, drizzle_orm_1.eq)(db_1.taskWatchers.userId, r.userId)), { taskId: db_1.taskWatchers.taskId, id: db_1.taskWatchers.id, userId: db_1.taskWatchers.userId });
        moved.labels = await this.moveOrDrop(db_1.taskLabelAssignments, taskId, targetTaskId, (r) => (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskLabelAssignments.taskId, targetTaskId), (0, drizzle_orm_1.eq)(db_1.taskLabelAssignments.labelId, r.labelId)), { taskId: db_1.taskLabelAssignments.taskId, id: db_1.taskLabelAssignments.id, labelId: db_1.taskLabelAssignments.labelId });
        moved.docLinks = await this.moveOrDrop(db_1.taskDocLinks, taskId, targetTaskId, (r) => (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskDocLinks.taskId, targetTaskId), (0, drizzle_orm_1.eq)(db_1.taskDocLinks.docId, r.docId)), { taskId: db_1.taskDocLinks.taskId, id: db_1.taskDocLinks.id, docId: db_1.taskDocLinks.docId });
        moved.sprints = await this.moveOrDrop(db_1.sprintTasks, taskId, targetTaskId, (r) => (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.sprintTasks.taskId, targetTaskId), (0, drizzle_orm_1.eq)(db_1.sprintTasks.sprintId, r.sprintId)), { taskId: db_1.sprintTasks.taskId, id: db_1.sprintTasks.id, sprintId: db_1.sprintTasks.sprintId });
        /*
         * Custom fields collide on (task, field), and here a collision means the
         * two tasks disagree about the same field. The TARGET's value is kept: it
         * describes the task that continues, and silently overwriting it with the
         * binned task's answer would change data nobody asked to change.
         */
        moved.customFields = await this.moveOrDrop(db_1.customFieldValues, taskId, targetTaskId, (r) => (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.customFieldValues.taskId, targetTaskId), (0, drizzle_orm_1.eq)(db_1.customFieldValues.fieldId, r.fieldId)), { taskId: db_1.customFieldValues.taskId, id: db_1.customFieldValues.id, fieldId: db_1.customFieldValues.fieldId });
        /*
         * Dependencies point both ways and can turn into self-links. "A blocks B",
         * merged into B, would become "B blocks B" — which every dependency reader
         * in the product would then treat as a task blocking itself.
         */
        moved.dependencies = await this.moveDependencies(taskId, targetTaskId);
        /*
         * The description. Appended rather than replaced, and written through
         * `updateTask` so the change lands in the target's description history and
         * can be undone from there like any other edit.
         */
        const nextDescription = (0, task_merge_1.mergedDescription)(target.description, source.description, source.title);
        if (nextDescription !== null) {
            await this.updateTask(targetTaskId, actorId, { description: nextDescription });
        }
        // Binned LAST: everything above is re-runnable, and this is the step that
        // makes the merge visible.
        await this.db.update(db_1.tasks).set({ isArchived: true, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId));
        await this.logActivity({ taskId: targetTaskId, actorId, action: 'merged_in', meta: { from: taskId, fromTitle: source.title, moved } });
        await this.logActivity({ taskId, actorId, action: 'merged_away', meta: { into: targetTaskId, intoTitle: target.title } });
        this.realtime.emitToTask(targetTaskId, { type: 'task.updated', listId: target.listId, taskId: targetTaskId, patch: {} });
        this.realtime.emitToList(source.listId, { type: 'task.updated', listId: source.listId, taskId, patch: { isArchived: true } });
        return { ok: true, targetTaskId, moved };
    }
    /**
     * Move rows one at a time, dropping any the target already has.
     *
     * Every join table here is unique on (task, something), so a bulk UPDATE
     * throws as soon as the two tasks share a label or an assignee — which is
     * the normal case for duplicates, not an edge case. Dropping rather than
     * failing is right because the row carried nothing the target lacks.
     */
    async moveOrDrop(table, fromTaskId, toTaskId, 
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    existing, 
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    columns) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const t = table;
        const rows = await this.db.select(columns).from(t).where((0, drizzle_orm_1.eq)(t.taskId, fromTaskId));
        let movedCount = 0;
        for (const row of rows) {
            const [clash] = await this.db.select({ id: t.id }).from(t).where(existing(row)).limit(1);
            if (clash)
                continue;
            await this.db.update(t).set({ taskId: toTaskId }).where((0, drizzle_orm_1.eq)(t.id, row.id));
            movedCount += 1;
        }
        return movedCount;
    }
    /**
     * Dependencies, in both directions, without creating self-links.
     *
     * A dependency row names two tasks, and the merged task can be on either
     * side. Rewriting it blindly turns "A blocks B" into "B blocks B" when B is
     * the survivor. Those rows are dropped: a task cannot block itself, and a
     * reader that finds one has to invent a meaning for it.
     */
    async moveDependencies(fromTaskId, toTaskId) {
        const rows = await this.db
            .select()
            .from(db_1.taskDependencies)
            .where((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(db_1.taskDependencies.taskId, fromTaskId), (0, drizzle_orm_1.eq)(db_1.taskDependencies.relatedTaskId, fromTaskId)));
        let movedCount = 0;
        for (const row of rows) {
            const nextTask = row.taskId === fromTaskId ? toTaskId : row.taskId;
            const nextRelated = row.relatedTaskId === fromTaskId ? toTaskId : row.relatedTaskId;
            if (nextTask === nextRelated)
                continue;
            const [clash] = await this.db
                .select({ id: db_1.taskDependencies.id })
                .from(db_1.taskDependencies)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskDependencies.taskId, nextTask), (0, drizzle_orm_1.eq)(db_1.taskDependencies.relatedTaskId, nextRelated), (0, drizzle_orm_1.eq)(db_1.taskDependencies.type, row.type)))
                .limit(1);
            if (clash)
                continue;
            await this.db
                .update(db_1.taskDependencies)
                .set({ taskId: nextTask, relatedTaskId: nextRelated })
                .where((0, drizzle_orm_1.eq)(db_1.taskDependencies.id, row.id));
            movedCount += 1;
        }
        return movedCount;
    }
    /**
     * §V2-08 — keep what the description said until now.
     *
     * COALESCED, so a person tidying a paragraph does not leave eight rows. If
     * the same editor already replaced this description inside the window, the
     * row they wrote is the OLDER text and therefore the better one — so this
     * does nothing rather than overwriting it. `doc_revisions` overwrites in the
     * same situation, which is right for it: it stores the NEW text, where newer
     * is better. Here newer is worse.
     */
    async recordDescriptionRevision(taskId, editorId, previous) {
        const [latest] = await this.db
            .select({ id: db_1.taskDescriptionRevisions.id, editorId: db_1.taskDescriptionRevisions.editorId, replacedAt: db_1.taskDescriptionRevisions.replacedAt })
            .from(db_1.taskDescriptionRevisions)
            .where((0, drizzle_orm_1.eq)(db_1.taskDescriptionRevisions.taskId, taskId))
            .orderBy((0, drizzle_orm_1.desc)(db_1.taskDescriptionRevisions.replacedAt))
            .limit(1);
        const withinWindow = latest?.replacedAt
            ? Date.now() - new Date(latest.replacedAt).getTime() < DESCRIPTION_REVISION_WINDOW_MS
            : false;
        if (latest && latest.editorId === editorId && withinWindow)
            return;
        await this.db.insert(db_1.taskDescriptionRevisions).values({ taskId, editorId, description: previous });
    }
    /**
     * What this description used to say, newest first.
     *
     * The task's CURRENT description is deliberately not in here — it is on the
     * task, and listing it as a revision would offer somebody a "restore" that
     * changes nothing.
     */
    async listDescriptionRevisions(taskId) {
        return this.db.query.taskDescriptionRevisions.findMany({
            where: (0, drizzle_orm_1.eq)(db_1.taskDescriptionRevisions.taskId, taskId),
            orderBy: (0, drizzle_orm_1.desc)(db_1.taskDescriptionRevisions.replacedAt),
            limit: 100,
            with: { editor: public_user_1.PUBLIC_USER_WITH },
        });
    }
    /**
     * Put an old description back.
     *
     * Routed through `updateTask` rather than writing the column directly, so
     * restoring is itself an edit: it records what the description said before
     * the restore, fires the same activity and realtime events, and can be undone
     * by restoring again. A restore that bypassed all that would be the one
     * description change in the product with no history — in the history feature.
     */
    async restoreDescriptionRevision(taskId, revisionId, actorId) {
        const [revision] = await this.db
            .select()
            .from(db_1.taskDescriptionRevisions)
            .where((0, drizzle_orm_1.eq)(db_1.taskDescriptionRevisions.id, revisionId))
            .limit(1);
        if (!revision || revision.taskId !== taskId)
            throw new common_1.NotFoundException('Revision not found');
        return this.updateTask(taskId, actorId, { description: revision.description });
    }
    /**
     * `viewerId` is only for the per-person bits of a comment — right now that is
     * §V2-S06's `savedByMe`. It is optional so the handful of internal callers
     * that just want the bodies keep working; a missing viewer means "nobody has
     * saved anything", never "everything is saved".
     */
    async listComments(taskId, viewerId) {
        const rows = await this.db.query.taskComments.findMany({
            where: (0, drizzle_orm_1.eq)(db_1.taskComments.taskId, taskId),
            orderBy: (0, drizzle_orm_1.asc)(db_1.taskComments.createdAt),
            with: { author: public_user_1.PUBLIC_USER_WITH, reactions: true, assignee: public_user_1.PUBLIC_USER_WITH, resolver: public_user_1.PUBLIC_USER_WITH },
        });
        // Hydrate per-comment attachments (Plan §4). Kept as a separate query to
        // avoid a schema import cycle between comments and attachments.
        const commentIds = rows.map((r) => r.id);
        if (commentIds.length === 0)
            return rows;
        const files = await this.db
            .select()
            .from(db_1.taskAttachments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskAttachments.taskId, taskId), (0, drizzle_orm_1.inArray)(db_1.taskAttachments.commentId, commentIds)));
        const byComment = new Map();
        for (const f of files) {
            const list = byComment.get(f.commentId) ?? [];
            list.push({
                id: f.id,
                fileName: f.fileName,
                fileSize: f.sizeBytes,
                mimeType: f.contentType,
                url: this.r2.configured ? await this.r2.getObjectUrl(f.storageKey) : f.storageKey,
            });
            byComment.set(f.commentId, list);
        }
        /*
         * §V2-S06 frame `05:55` — which of these I have saved, so the bookmark
         * renders filled on arrival rather than only after I press it. Without this
         * the button would forget every reload, which is the same as not storing it.
         */
        const savedIds = new Set();
        if (viewerId) {
            const saves = await this.db
                .select({ commentId: db_1.taskCommentSaves.commentId })
                .from(db_1.taskCommentSaves)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskCommentSaves.userId, viewerId), (0, drizzle_orm_1.inArray)(db_1.taskCommentSaves.commentId, commentIds)));
            for (const s of saves)
                savedIds.add(s.commentId);
        }
        return rows.map((r) => ({
            ...r,
            attachments: byComment.get(r.id) ?? [],
            savedByMe: savedIds.has(r.id),
        }));
    }
    /**
     * §V2-S06 frame `05:55` — "reply/thread, assign, save — same like messages".
     *
     * A private bookmark on somebody else's sentence. Deliberately NOT gated on
     * `assertTaskWriteAccess` the way resolve and assign are: saving is a reading
     * act, and a viewer who can open the task can put one of its comments aside.
     * `assertTaskReadAccess` is the gate, and it is the same one the task itself
     * uses — one implementation, not a second copy of the visibility rules.
     *
     * THE COMMENT IS CHECKED AGAINST THE TASK IN THE PATH. A comment id is not a
     * capability: without this, `/tasks/<a task I can read>/comments/<a comment
     * on a task I cannot>/save` would sail past the route guard.
     */
    async setCommentSaved(taskId, commentId, userId, saved) {
        await this.assertTaskReadAccess(taskId, userId);
        const [comment] = await this.db
            .select({ id: db_1.taskComments.id, taskId: db_1.taskComments.taskId })
            .from(db_1.taskComments)
            .where((0, drizzle_orm_1.eq)(db_1.taskComments.id, commentId))
            .limit(1);
        if (!comment || comment.taskId !== taskId)
            throw new common_1.NotFoundException('Comment not found');
        if (saved) {
            // The unique index makes this the toggle: saving twice is one bookmark.
            await this.db
                .insert(db_1.taskCommentSaves)
                .values({ commentId, userId })
                .onConflictDoNothing({ target: [db_1.taskCommentSaves.commentId, db_1.taskCommentSaves.userId] });
            return { commentId, saved: true };
        }
        await this.db
            .delete(db_1.taskCommentSaves)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskCommentSaves.commentId, commentId), (0, drizzle_orm_1.eq)(db_1.taskCommentSaves.userId, userId)));
        return { commentId, saved: false };
    }
    /**
     * The saved comments the Inbox's Later tab lists, newest save first.
     *
     * Where they surface is not a free choice: §2.2 already put saved chat
     * messages in Later ("Later mein SAVED messages show hote hain"), and
     * ClickUp's own answer for a saved comment is the same tab. So this is the
     * second section of a bucket that already exists rather than a new panel.
     *
     * ACCESS IS RE-CHECKED, not assumed from the save. You saved a comment you
     * could read; being removed from a private Space afterwards must drop it out
     * of your Later tab, not keep serving you its body. `assertTaskReadAccess` is
     * reused per distinct task — a handful of queries for a list of this size,
     * and no second copy of the rules to drift.
     *
     * Archived tasks are left out: a row that opens the bin is a dead end.
     */
    async listSavedComments(workspaceId, userId) {
        const rows = await this.db
            .select({
            id: db_1.taskComments.id,
            body: db_1.taskComments.body,
            mentions: db_1.taskComments.mentions,
            createdAt: db_1.taskComments.createdAt,
            savedAt: db_1.taskCommentSaves.createdAt,
            taskId: db_1.tasks.id,
            taskTitle: db_1.tasks.title,
            listId: db_1.tasks.listId,
            projectId: db_1.lists.projectId,
            spaceId: db_1.spaces.id,
            authorId: db_1.taskComments.authorId,
            authorName: db_1.users.displayName,
            authorAvatarUrl: db_1.users.avatarUrl,
        })
            .from(db_1.taskCommentSaves)
            .innerJoin(db_1.taskComments, (0, drizzle_orm_1.eq)(db_1.taskComments.id, db_1.taskCommentSaves.commentId))
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskComments.taskId))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.taskComments.authorId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskCommentSaves.userId, userId), (0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false)))
            .orderBy((0, drizzle_orm_1.desc)(db_1.taskCommentSaves.createdAt));
        if (rows.length === 0)
            return [];
        const taskIds = [...new Set(rows.map((r) => r.taskId))];
        const readable = new Set();
        await Promise.all(taskIds.map(async (id) => {
            const ok = await this.assertTaskReadAccess(id, userId).then(() => true, () => false);
            if (ok)
                readable.add(id);
        }));
        return rows
            .filter((r) => readable.has(r.taskId))
            .map((r) => ({
            ...r,
            // `&comment=` is what makes the row land on the sentence rather than on
            // the task and good luck. The list route reads it, opens the Comments
            // tab and highlights that one.
            url: `${this.buildTaskUrl(workspaceId, r.spaceId, r.projectId, r.listId, r.taskId)}&comment=${r.id}`,
        }));
    }
    async createComment(taskId, authorId, body, parentCommentId, mentions, attachmentIds) {
        // No assertTaskWriteAccess here by design — commenting is open to any
        // member who can see the task — so the bin check has to be made directly.
        const [target] = await this.db
            .select({ isArchived: db_1.tasks.isArchived })
            .from(db_1.tasks)
            .where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId))
            .limit(1);
        if (!target)
            throw new common_1.NotFoundException('Task not found');
        this.assertNotInBin(target.isArchived);
        /*
         * §V2-05 — a comment with no words is allowed IF it carries a file.
         *
         * Frame `04:45` is a voice note posted on its own, and `05:35` a recorded
         * clip posted on its own. Keeping the old "body cannot be empty" rule would
         * have left the composer's mic able to record something it could never
         * post — a control named after a thing it cannot do.
         *
         * The attachments are RESOLVED here rather than trusted, and resolved
         * against this task: an empty body is only accepted once at least one of
         * the given ids is a real row on this task. Otherwise any caller could post
         * an empty comment by naming ids that link nothing, and the emptiness check
         * would be decoration.
         */
        const requestedIds = attachmentIds ?? [];
        const linkable = requestedIds.length > 0
            ? await this.db
                .select({ id: db_1.taskAttachments.id, fileName: db_1.taskAttachments.fileName, contentType: db_1.taskAttachments.contentType })
                .from(db_1.taskAttachments)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskAttachments.taskId, taskId), (0, drizzle_orm_1.inArray)(db_1.taskAttachments.id, requestedIds)))
            : [];
        if (!body.trim() && linkable.length === 0) {
            throw new common_1.BadRequestException('A comment needs words or a file');
        }
        const extracted = this.extractMentionIds(body).map((userId) => ({ userId, offset: 0, length: 0 }));
        const finalMentions = mentions && mentions.length > 0 ? mentions : extracted;
        const [comment] = await this.db
            .insert(db_1.taskComments)
            .values({ taskId, authorId, body, parentCommentId, mentions: finalMentions.length > 0 ? finalMentions : null })
            .returning();
        // Link the resolved attachments to this comment. Only rows belonging to the
        // same task are linked, so a caller can't attach files from elsewhere.
        if (linkable.length > 0) {
            await this.db
                .update(db_1.taskAttachments)
                .set({ commentId: comment.id })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskAttachments.taskId, taskId), (0, drizzle_orm_1.inArray)(db_1.taskAttachments.id, linkable.map((a) => a.id))));
        }
        // Auto-subscribe the author as a watcher (§A4.7 — opt-out).
        if (await this.notifications.autoFollowEnabled(authorId)) {
            await this.db.insert(db_1.taskWatchers).values({ taskId, userId: authorId }).onConflictDoNothing();
        }
        await this.logActivity({ taskId, actorId: authorId, action: 'commented', meta: { commentId: comment.id } });
        const hydrated = await this.db.query.taskComments.findFirst({
            where: (0, drizzle_orm_1.eq)(db_1.taskComments.id, comment.id),
            with: { author: public_user_1.PUBLIC_USER_WITH, reactions: true, assignee: public_user_1.PUBLIC_USER_WITH, resolver: public_user_1.PUBLIC_USER_WITH },
        });
        this.realtime.emitToTask(taskId, { type: 'comment.created', taskId, comment: hydrated });
        // Fire comment + mention notifications (best-effort). A wordless voice note
        // gets described by what it is rather than emailed as a blank quote.
        void this.notifyComment(taskId, authorId, body.trim() ? body : (0, comment_summary_1.describeAttachments)(linkable), finalMentions);
        // Fire the "Comment is added to task" automation trigger (best-effort).
        void (async () => {
            try {
                const [taskRow] = await this.db.select().from(db_1.tasks).where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId)).limit(1);
                if (!taskRow)
                    return;
                const ctx = await this.resolveWorkspaceForList(taskRow.listId);
                if (!ctx)
                    return;
                await this.automations.fire('task.comment_added', {
                    workspaceId: ctx.workspaceId,
                    taskId,
                    userId: authorId,
                    projectId: ctx.projectId,
                    listId: taskRow.listId,
                });
                // Outgoing webhook (Plan §12): comment.created now actually dispatches.
                await this.webhooks.fire(ctx.workspaceId, 'comment.created', {
                    comment: { id: comment.id, taskId, authorId, body: body.slice(0, 2000) },
                    projectId: ctx.projectId,
                });
            }
            catch {
                /* best-effort */
            }
        })();
        return hydrated;
    }
    async notifyComment(taskId, authorId, body, mentions) {
        try {
            const [taskRow] = await this.db.select().from(db_1.tasks).where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId)).limit(1);
            if (!taskRow)
                return;
            const ctx = await this.resolveWorkspaceForList(taskRow.listId);
            if (!ctx)
                return;
            const workspaceName = await this.resolveWorkspaceName(ctx.workspaceId);
            const taskUrl = this.buildTaskUrl(ctx.workspaceId, ctx.spaceId, ctx.projectId, taskRow.listId, taskId);
            // Trim to 200 chars for the email snippet
            const commentSnippet = body.replace(/<[^>]+>/g, '').slice(0, 200);
            // Notify watchers (excluding the commenter)
            const watcherRows = await this.db
                .select({ userId: db_1.taskWatchers.userId })
                .from(db_1.taskWatchers)
                .where((0, drizzle_orm_1.eq)(db_1.taskWatchers.taskId, taskId));
            const mentionedIds = new Set(mentions.map((m) => m.userId));
            for (const { userId } of watcherRows) {
                if (userId === authorId)
                    continue;
                if (mentionedIds.has(userId)) {
                    // Mentioned → higher-priority mention notification
                    void this.notifications.create({
                        userId,
                        workspaceId: ctx.workspaceId,
                        actorId: authorId,
                        type: 'task_mentioned',
                        title: `You were mentioned in "${taskRow.title}"`,
                        target: { entityType: 'task', entityId: taskId, url: taskUrl },
                        emailContext: { taskTitle: taskRow.title, workspaceName },
                    });
                }
                else {
                    void this.notifications.create({
                        userId,
                        workspaceId: ctx.workspaceId,
                        actorId: authorId,
                        type: 'task_commented',
                        title: `New comment on "${taskRow.title}"`,
                        target: { entityType: 'task', entityId: taskId, url: taskUrl },
                        emailContext: { taskTitle: taskRow.title, workspaceName, commentSnippet },
                    });
                }
            }
            // Also notify non-watcher mentioned users (they may not be watching yet)
            for (const { userId } of mentions) {
                if (userId === authorId)
                    continue;
                const alreadyNotified = watcherRows.some((w) => w.userId === userId);
                if (!alreadyNotified) {
                    void this.notifications.create({
                        userId,
                        workspaceId: ctx.workspaceId,
                        actorId: authorId,
                        type: 'task_mentioned',
                        title: `You were mentioned in "${taskRow.title}"`,
                        target: { entityType: 'task', entityId: taskId, url: taskUrl },
                        emailContext: { taskTitle: taskRow.title, workspaceName },
                    });
                }
            }
        }
        catch {
            // Best-effort — swallow errors
        }
    }
    async updateComment(commentId, authorId, body) {
        const [existing] = await this.db.select().from(db_1.taskComments).where((0, drizzle_orm_1.eq)(db_1.taskComments.id, commentId));
        if (!existing)
            throw new common_1.NotFoundException('Comment not found');
        if (existing.authorId !== authorId)
            throw new common_1.BadRequestException('Cannot edit another user\'s comment');
        const [updated] = await this.db
            .update(db_1.taskComments)
            .set({ body, editedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.taskComments.id, commentId))
            .returning();
        this.realtime.emitToTask(existing.taskId, {
            type: 'comment.updated',
            taskId: existing.taskId,
            commentId,
            patch: { body, editedAt: updated.editedAt },
        });
        return updated;
    }
    async assignComment(commentId, actorId, userId) {
        const [existing] = await this.db.select().from(db_1.taskComments).where((0, drizzle_orm_1.eq)(db_1.taskComments.id, commentId));
        if (!existing)
            throw new common_1.NotFoundException('Comment not found');
        const [taskRow] = await this.db.select().from(db_1.tasks).where((0, drizzle_orm_1.eq)(db_1.tasks.id, existing.taskId)).limit(1);
        if (!taskRow)
            throw new common_1.NotFoundException('Task not found');
        await this.assertTaskWriteAccess(taskRow.id, actorId);
        const [updated] = await this.db
            .update(db_1.taskComments)
            .set({ assignedToUserId: userId, editedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.taskComments.id, commentId))
            .returning();
        this.realtime.emitToTask(existing.taskId, {
            type: 'comment.updated',
            taskId: existing.taskId,
            commentId,
            patch: { assignedToUserId: updated.assignedToUserId, editedAt: updated.editedAt },
        });
        if (userId && userId !== actorId) {
            const ctx = await this.resolveWorkspaceForList(taskRow.listId);
            if (ctx) {
                const workspaceName = await this.resolveWorkspaceName(ctx.workspaceId);
                void this.notifications.create({
                    userId,
                    workspaceId: ctx.workspaceId,
                    actorId,
                    // G10-10 [12:21–12:24] — its own kind. As `task_assigned` this was
                    // indistinguishable in the Inbox from being given a task, and could
                    // not be toggled apart from one in the Primary customiser.
                    type: 'comment_assigned',
                    title: `You were assigned a comment in "${taskRow.title}"`,
                    target: {
                        entityType: 'task',
                        entityId: taskRow.id,
                        url: this.buildTaskUrl(ctx.workspaceId, ctx.spaceId, ctx.projectId, taskRow.listId, taskRow.id),
                    },
                    emailContext: { taskTitle: taskRow.title, workspaceName },
                });
            }
        }
        return updated;
    }
    async resolveComment(commentId, actorId, resolved) {
        const [existing] = await this.db.select().from(db_1.taskComments).where((0, drizzle_orm_1.eq)(db_1.taskComments.id, commentId));
        if (!existing)
            throw new common_1.NotFoundException('Comment not found');
        const [taskRow] = await this.db.select().from(db_1.tasks).where((0, drizzle_orm_1.eq)(db_1.tasks.id, existing.taskId)).limit(1);
        if (!taskRow)
            throw new common_1.NotFoundException('Task not found');
        await this.assertTaskWriteAccess(taskRow.id, actorId);
        const [updated] = await this.db
            .update(db_1.taskComments)
            .set({
            resolvedAt: resolved ? new Date() : null,
            resolvedByUserId: resolved ? actorId : null,
            editedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(db_1.taskComments.id, commentId))
            .returning();
        this.realtime.emitToTask(existing.taskId, {
            type: 'comment.updated',
            taskId: existing.taskId,
            commentId,
            patch: {
                resolvedAt: updated.resolvedAt,
                resolvedByUserId: updated.resolvedByUserId,
                editedAt: updated.editedAt,
            },
        });
        if (resolved) {
            void this.notifyCommentResolved(taskRow, existing, actorId);
        }
        return updated;
    }
    async notifyCommentResolved(taskRow, comment, actorId) {
        try {
            const ctx = await this.resolveWorkspaceForList(taskRow.listId);
            if (!ctx)
                return;
            const workspaceName = await this.resolveWorkspaceName(ctx.workspaceId);
            const taskUrl = this.buildTaskUrl(ctx.workspaceId, ctx.spaceId, ctx.projectId, taskRow.listId, taskRow.id);
            const snippet = comment.body.replace(/<[^>]+>/g, '').slice(0, 200);
            const recipientIds = new Set();
            if (comment.authorId && comment.authorId !== actorId)
                recipientIds.add(comment.authorId);
            if (comment.assignedToUserId && comment.assignedToUserId !== actorId) {
                recipientIds.add(comment.assignedToUserId);
            }
            for (const userId of recipientIds) {
                void this.notifications.create({
                    userId,
                    workspaceId: ctx.workspaceId,
                    actorId,
                    // G10-10 — routine by comparison, and now separately mutable: as
                    // `task_commented` it looked exactly like a new comment arriving.
                    type: 'comment_resolved',
                    title: `Your comment was resolved on "${taskRow.title}"`,
                    body: snippet,
                    target: { entityType: 'task', entityId: taskRow.id, url: taskUrl },
                    emailContext: {
                        taskTitle: taskRow.title,
                        workspaceName,
                        commentSnippet: snippet,
                        commentVariant: 'resolved',
                    },
                });
            }
        }
        catch {
            // Best-effort — never block resolve
        }
    }
    async deleteComment(commentId, actorId) {
        const [existing] = await this.db.select().from(db_1.taskComments).where((0, drizzle_orm_1.eq)(db_1.taskComments.id, commentId));
        if (!existing)
            throw new common_1.NotFoundException('Comment not found');
        // The author can always delete their own comment; workspace admins/managers
        // may delete anyone's (Plan §4 — moderation).
        if (existing.authorId !== actorId && !(await this.isTaskWorkspaceModerator(existing.taskId, actorId))) {
            throw new common_1.ForbiddenException("Only the author or a workspace admin can delete this comment");
        }
        await this.db.delete(db_1.taskComments).where((0, drizzle_orm_1.eq)(db_1.taskComments.id, commentId));
        this.realtime.emitToTask(existing.taskId, { type: 'comment.deleted', taskId: existing.taskId, commentId });
        return { ok: true };
    }
    /** True if the actor is a workspace_admin / manager / super_admin over the task's workspace. */
    async isTaskWorkspaceModerator(taskId, actorId) {
        const [row] = await this.db
            .select({ role: db_1.workspaceMembers.role })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .innerJoin(db_1.workspaceMembers, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, db_1.spaces.workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, actorId)))
            .where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId))
            .limit(1);
        return row?.role === 'workspace_admin' || row?.role === 'manager' || row?.role === 'super_admin';
    }
    async toggleReaction(commentId, userId, emoji) {
        const [existing] = await this.db
            .select()
            .from(db_1.taskCommentReactions)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskCommentReactions.commentId, commentId), (0, drizzle_orm_1.eq)(db_1.taskCommentReactions.userId, userId), (0, drizzle_orm_1.eq)(db_1.taskCommentReactions.emoji, emoji)));
        if (existing) {
            await this.db.delete(db_1.taskCommentReactions).where((0, drizzle_orm_1.eq)(db_1.taskCommentReactions.id, existing.id));
            return { removed: true };
        }
        const [created] = await this.db
            .insert(db_1.taskCommentReactions)
            .values({ commentId, userId, emoji })
            .returning();
        /*
         * §G10-7 [12:21] — reactions are one of the kinds she goes through in the
         * Primary customiser, and she turns them off for herself. A kind that is
         * never emitted cannot be turned off, and more to the point: reacting to a
         * chat message told its author, and reacting to a task comment told nobody.
         * The same gesture, in two places, with two different meanings.
         *
         * Best-effort and un-awaited, exactly as the chat side is: a notification
         * that fails must not undo the reaction the person just made.
         */
        const [comment] = await this.db
            .select({ id: db_1.taskComments.id, taskId: db_1.taskComments.taskId, authorId: db_1.taskComments.authorId, body: db_1.taskComments.body })
            .from(db_1.taskComments)
            .where((0, drizzle_orm_1.eq)(db_1.taskComments.id, commentId))
            .limit(1);
        // Reacting to your own comment tells you nothing.
        if (comment?.authorId && comment.authorId !== userId) {
            const [taskRow] = await this.db
                .select({ id: db_1.tasks.id, title: db_1.tasks.title, listId: db_1.tasks.listId })
                .from(db_1.tasks)
                .where((0, drizzle_orm_1.eq)(db_1.tasks.id, comment.taskId))
                .limit(1);
            const ctx = taskRow ? await this.resolveWorkspaceForList(taskRow.listId) : null;
            if (taskRow && ctx) {
                void this.notifications
                    .create({
                    userId: comment.authorId,
                    workspaceId: ctx.workspaceId,
                    actorId: userId,
                    type: 'message_reaction',
                    title: emoji,
                    body: comment.body ?? undefined,
                    target: {
                        entityType: 'task',
                        entityId: taskRow.id,
                        url: this.buildTaskUrl(ctx.workspaceId, ctx.spaceId, ctx.projectId, taskRow.listId, taskRow.id),
                    },
                })
                    .catch(() => undefined);
            }
        }
        return { added: true, reaction: created };
    }
    // --- Checklists ----------------------------------------------------------
    async createChecklist(taskId, title, actorId) {
        const [existing] = await this.db
            .select({ maxPos: (0, drizzle_orm_1.sql) `coalesce(max(${db_1.taskChecklists.position}), -1)` })
            .from(db_1.taskChecklists)
            .where((0, drizzle_orm_1.eq)(db_1.taskChecklists.taskId, taskId));
        const [checklist] = await this.db
            .insert(db_1.taskChecklists)
            .values({ taskId, title, position: (existing?.maxPos ?? -1) + 1 })
            .returning();
        await this.logActivity({ taskId, actorId, action: 'updated', meta: { fields: ['checklists'] } });
        this.realtime.emitToTask(taskId, { type: 'checklist.updated', taskId });
        return { ...checklist, items: [] };
    }
    async updateChecklist(checklistId, patch) {
        if (patch.position !== undefined && (typeof patch.position !== 'number' || !Number.isInteger(patch.position))) {
            throw new common_1.BadRequestException('Checklist position must be an integer');
        }
        const set = { updatedAt: new Date() };
        if (patch.title !== undefined)
            set.title = patch.title;
        if (patch.position !== undefined)
            set.position = patch.position;
        const [updated] = await this.db
            .update(db_1.taskChecklists)
            .set(set)
            .where((0, drizzle_orm_1.eq)(db_1.taskChecklists.id, checklistId))
            .returning();
        if (!updated)
            throw new common_1.NotFoundException('Checklist not found');
        this.realtime.emitToTask(updated.taskId, { type: 'checklist.updated', taskId: updated.taskId });
        return updated;
    }
    async deleteChecklist(checklistId) {
        const [existing] = await this.db.select().from(db_1.taskChecklists).where((0, drizzle_orm_1.eq)(db_1.taskChecklists.id, checklistId));
        if (!existing)
            throw new common_1.NotFoundException('Checklist not found');
        await this.db.delete(db_1.taskChecklists).where((0, drizzle_orm_1.eq)(db_1.taskChecklists.id, checklistId));
        this.realtime.emitToTask(existing.taskId, { type: 'checklist.updated', taskId: existing.taskId });
        return { ok: true };
    }
    async addChecklistItem(checklistId, content, assigneeId, dueDate, actorId) {
        const [parent] = await this.db.select().from(db_1.taskChecklists).where((0, drizzle_orm_1.eq)(db_1.taskChecklists.id, checklistId));
        if (!parent)
            throw new common_1.NotFoundException('Checklist not found');
        const [existing] = await this.db
            .select({ maxPos: (0, drizzle_orm_1.sql) `coalesce(max(${db_1.taskChecklistItems.position}), -1)` })
            .from(db_1.taskChecklistItems)
            .where((0, drizzle_orm_1.eq)(db_1.taskChecklistItems.checklistId, checklistId));
        const [item] = await this.db
            .insert(db_1.taskChecklistItems)
            .values({
            checklistId,
            content,
            assigneeId: assigneeId ?? null,
            dueDate: dueDate ?? null,
            position: (existing?.maxPos ?? -1) + 1,
        })
            .returning();
        // Frame `02:47`: the feed names both the item and the list it went into.
        // With more than one named checklist per task that is not decoration —
        // "added an item" tells you nothing about which list grew.
        await this.logActivity({
            taskId: parent.taskId,
            actorId,
            action: 'checklist_item_added',
            meta: { itemId: item.id, content: item.content, checklist: parent.title },
        });
        this.realtime.emitToTask(parent.taskId, { type: 'checklist.updated', taskId: parent.taskId });
        return item;
    }
    async updateChecklistItem(itemId, actorId, patch) {
        const [existing] = await this.db.select().from(db_1.taskChecklistItems).where((0, drizzle_orm_1.eq)(db_1.taskChecklistItems.id, itemId));
        if (!existing)
            throw new common_1.NotFoundException('Checklist item not found');
        const set = { ...patch, updatedAt: new Date() };
        if (patch.isDone === true && !existing.isDone)
            set.completedAt = new Date();
        if (patch.isDone === false && existing.isDone)
            set.completedAt = null;
        const [updated] = await this.db
            .update(db_1.taskChecklistItems)
            .set(set)
            .where((0, drizzle_orm_1.eq)(db_1.taskChecklistItems.id, itemId))
            .returning();
        const [parent] = await this.db.select().from(db_1.taskChecklists).where((0, drizzle_orm_1.eq)(db_1.taskChecklists.id, existing.checklistId));
        if (parent) {
            if (typeof patch.isDone === 'boolean' && patch.isDone !== existing.isDone) {
                await this.logActivity({
                    taskId: parent.taskId,
                    actorId,
                    action: 'checklist_item_toggled',
                    meta: { itemId, content: updated.content, isDone: updated.isDone, checklist: parent.title },
                });
            }
            this.realtime.emitToTask(parent.taskId, { type: 'checklist.updated', taskId: parent.taskId });
        }
        return updated;
    }
    async deleteChecklistItem(itemId) {
        const [existing] = await this.db.select().from(db_1.taskChecklistItems).where((0, drizzle_orm_1.eq)(db_1.taskChecklistItems.id, itemId));
        if (!existing)
            throw new common_1.NotFoundException('Checklist item not found');
        await this.db.delete(db_1.taskChecklistItems).where((0, drizzle_orm_1.eq)(db_1.taskChecklistItems.id, itemId));
        const [parent] = await this.db.select().from(db_1.taskChecklists).where((0, drizzle_orm_1.eq)(db_1.taskChecklists.id, existing.checklistId));
        if (parent)
            this.realtime.emitToTask(parent.taskId, { type: 'checklist.updated', taskId: parent.taskId });
        return { ok: true };
    }
    // --- Dependencies --------------------------------------------------------
    async getDependencyGraph(taskId, depth = 2) {
        const normalizedDepth = Math.min(Math.max(Math.floor(depth || 1), 1), 6);
        const visited = new Set([taskId]);
        const edges = new Map();
        let frontier = [taskId];
        for (let i = 0; i < normalizedDepth && frontier.length > 0; i++) {
            const outgoing = await this.db
                .select({ taskId: db_1.taskDependencies.taskId, relatedTaskId: db_1.taskDependencies.relatedTaskId, type: db_1.taskDependencies.type })
                .from(db_1.taskDependencies)
                .where((0, drizzle_orm_1.inArray)(db_1.taskDependencies.taskId, frontier));
            const incoming = await this.db
                .select({ taskId: db_1.taskDependencies.taskId, relatedTaskId: db_1.taskDependencies.relatedTaskId, type: db_1.taskDependencies.type })
                .from(db_1.taskDependencies)
                .where((0, drizzle_orm_1.inArray)(db_1.taskDependencies.relatedTaskId, frontier));
            const combined = [...outgoing, ...incoming];
            const nextFrontier = [];
            for (const edge of combined) {
                edges.set(`${edge.taskId}:${edge.relatedTaskId}:${edge.type}`, edge);
                if (!visited.has(edge.taskId)) {
                    visited.add(edge.taskId);
                    nextFrontier.push(edge.taskId);
                }
                if (!visited.has(edge.relatedTaskId)) {
                    visited.add(edge.relatedTaskId);
                    nextFrontier.push(edge.relatedTaskId);
                }
            }
            frontier = nextFrontier;
        }
        const nodeIds = [...visited];
        const rows = await this.db
            .select({
            id: db_1.tasks.id,
            title: db_1.tasks.title,
            status: db_1.tasks.status,
            priority: db_1.tasks.priority,
            dueDate: db_1.tasks.dueDate,
            isArchived: db_1.tasks.isArchived,
        })
            .from(db_1.tasks)
            .where((0, drizzle_orm_1.inArray)(db_1.tasks.id, nodeIds));
        const byId = new Map(rows.map((r) => [r.id, r]));
        const isOpen = (id) => {
            const node = byId.get(id);
            if (!node)
                return false;
            return !node.isArchived && node.status !== 'done' && node.status !== 'cancelled';
        };
        const blocksAdj = new Map(); // blocker -> blocked
        const blockedByAdj = new Map(); // blocked -> blocker
        for (const edge of edges.values()) {
            const pair = edge.type === 'blocks'
                ? { blocker: edge.taskId, blocked: edge.relatedTaskId }
                : edge.type === 'blocked_by'
                    ? { blocker: edge.relatedTaskId, blocked: edge.taskId }
                    : null;
            if (!pair)
                continue;
            blocksAdj.set(pair.blocker, [...(blocksAdj.get(pair.blocker) ?? []), pair.blocked]);
            blockedByAdj.set(pair.blocked, [...(blockedByAdj.get(pair.blocked) ?? []), pair.blocker]);
        }
        const rootBlockedByOpen = (blockedByAdj.get(taskId) ?? []).filter(isOpen).length;
        const rootBlocksOpen = (blocksAdj.get(taskId) ?? []).filter(isOpen).length;
        const dfsDepth = (startId, adj, seen) => {
            if (seen.has(startId))
                return 0;
            seen.add(startId);
            let best = 0;
            for (const nextId of adj.get(startId) ?? []) {
                if (!isOpen(nextId))
                    continue;
                best = Math.max(best, 1 + dfsDepth(nextId, adj, new Set(seen)));
            }
            return best;
        };
        return {
            rootTaskId: taskId,
            depth: normalizedDepth,
            metrics: {
                nodeCount: rows.length,
                edgeCount: edges.size,
                blockedByOpenCount: rootBlockedByOpen,
                blocksOpenCount: rootBlocksOpen,
                longestBlockedByChainDepth: dfsDepth(taskId, blockedByAdj, new Set()),
                longestBlocksChainDepth: dfsDepth(taskId, blocksAdj, new Set()),
            },
            nodes: rows,
            edges: [...edges.values()],
        };
    }
    async addDependency(taskId, relatedTaskId, type, actorId) {
        if (taskId === relatedTaskId)
            throw new common_1.BadRequestException('A task cannot depend on itself');
        if (type === 'blocks' || type === 'blocked_by') {
            const blocker = type === 'blocks' ? taskId : relatedTaskId;
            const blocked = type === 'blocks' ? relatedTaskId : taskId;
            const cycle = await this.hasBlockingPath(blocked, blocker);
            if (cycle)
                throw new common_1.BadRequestException('Dependency would create a blocking cycle');
        }
        const [created] = await this.db
            .insert(db_1.taskDependencies)
            .values({ taskId, relatedTaskId, type, createdById: actorId })
            .onConflictDoNothing()
            .returning();
        await this.logActivity({ taskId, actorId, action: 'dependency_added', meta: { relatedTaskId, type } });
        // §4.4 — a new blocking edge may leave a task blocked; notify its
        // assignees + watchers. Only for a freshly-created blocking dependency.
        if (created && (type === 'blocks' || type === 'blocked_by')) {
            const blocked = type === 'blocks' ? relatedTaskId : taskId;
            void this.notifyTaskBlocked(blocked, /* blocker */ type === 'blocks' ? taskId : relatedTaskId, actorId);
        }
        return created;
    }
    async removeDependency(depId, actorId) {
        const [existing] = await this.db.select().from(db_1.taskDependencies).where((0, drizzle_orm_1.eq)(db_1.taskDependencies.id, depId));
        if (!existing)
            throw new common_1.NotFoundException('Dependency not found');
        await this.db.delete(db_1.taskDependencies).where((0, drizzle_orm_1.eq)(db_1.taskDependencies.id, depId));
        await this.logActivity({
            taskId: existing.taskId,
            actorId,
            action: 'dependency_removed',
            meta: { relatedTaskId: existing.relatedTaskId, type: existing.type },
        });
        return { ok: true };
    }
    // --- Activity ------------------------------------------------------------
    async listActivity(taskId, limit = 100) {
        return this.db.query.taskActivity.findMany({
            where: (0, drizzle_orm_1.eq)(db_1.taskActivity.taskId, taskId),
            orderBy: (0, drizzle_orm_1.desc)(db_1.taskActivity.createdAt),
            limit,
            with: { actor: true },
        });
    }
    /** Aggregated activity across every task in a project (Plan §4 timeline). */
    async listProjectActivity(projectId, limit = 100, actor) {
        // §2 per-item privacy: don't surface activity for private tasks the actor
        // can't see (the feed carries task titles).
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
                visFilter = (0, item_visibility_1.taskVisibilityFilter)(this.db, actor.id, isManager);
            }
        }
        const rows = await this.db
            .select({
            id: db_1.taskActivity.id,
            action: db_1.taskActivity.action,
            meta: db_1.taskActivity.meta,
            createdAt: db_1.taskActivity.createdAt,
            taskId: db_1.taskActivity.taskId,
            taskTitle: db_1.tasks.title,
            actorId: db_1.users.id,
            actorName: db_1.users.displayName,
            actorEmail: db_1.users.email,
        })
            .from(db_1.taskActivity)
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskActivity.taskId))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.taskActivity.actorId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.lists.projectId, projectId), visFilter))
            .orderBy((0, drizzle_orm_1.desc)(db_1.taskActivity.createdAt))
            .limit(limit);
        return rows.map((r) => ({
            id: r.id,
            action: r.action,
            meta: r.meta,
            createdAt: r.createdAt,
            taskId: r.taskId,
            taskTitle: r.taskTitle,
            actor: r.actorId ? { id: r.actorId, displayName: r.actorName, email: r.actorEmail } : null,
        }));
    }
    // --- Time entries --------------------------------------------------------
    /**
     * Resolve the billable default for a task's project (§8.3 "set billable
     * default per project"). New timer/manual entries inherit this when the
     * caller doesn't set `isBillable` explicitly.
     */
    async projectDefaultBillable(taskId) {
        const [row] = await this.db
            .select({ def: db_1.projects.defaultBillable })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId))
            .limit(1);
        return row?.def ?? false;
    }
    async startTimer(taskId, userId, description, isBillable) {
        // If there's an already-running timer for this user, stop it first.
        const [running] = await this.db
            .select()
            .from(db_1.timeEntries)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.timeEntries.userId, userId), (0, drizzle_orm_1.isNull)(db_1.timeEntries.endedAt)));
        if (running) {
            await this.stopTimer(running.id, userId);
        }
        const [entry] = await this.db
            .insert(db_1.timeEntries)
            .values({
            taskId,
            userId,
            startedAt: new Date(),
            description,
            isBillable: isBillable ?? (await this.projectDefaultBillable(taskId)),
        })
            .returning();
        return entry;
    }
    async stopTimer(entryId, userId) {
        const [existing] = await this.db.select().from(db_1.timeEntries).where((0, drizzle_orm_1.eq)(db_1.timeEntries.id, entryId));
        if (!existing)
            throw new common_1.NotFoundException('Time entry not found');
        if (existing.userId !== userId)
            throw new common_1.BadRequestException('Cannot stop another user\'s timer');
        if (existing.endedAt)
            return existing;
        const endedAt = new Date();
        const durationSec = Math.max(0, Math.floor((endedAt.getTime() - new Date(existing.startedAt).getTime()) / 1000));
        const [updated] = await this.db
            .update(db_1.timeEntries)
            .set({ endedAt, durationSec, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.timeEntries.id, entryId))
            .returning();
        this.fireTimeLogged(updated);
        return updated;
    }
    async addManualTimeEntry(data) {
        const durationSec = Math.max(0, Math.floor((data.endedAt.getTime() - data.startedAt.getTime()) / 1000));
        const [entry] = await this.db
            .insert(db_1.timeEntries)
            .values({
            ...data,
            durationSec,
            isBillable: data.isBillable ?? (await this.projectDefaultBillable(data.taskId)),
        })
            .returning();
        this.fireTimeLogged(entry);
        return entry;
    }
    /** Fire the outgoing 'time.logged' webhook (Plan §12), best-effort. */
    fireTimeLogged(entry) {
        void (async () => {
            try {
                const ctx = await this.resolveTaskContext(entry.taskId);
                if (!ctx)
                    return;
                await this.webhooks.fire(ctx.space.workspaceId, 'time.logged', {
                    timeEntry: {
                        id: entry.id,
                        taskId: entry.taskId,
                        userId: entry.userId,
                        durationSec: entry.durationSec ?? 0,
                        isBillable: entry.isBillable,
                    },
                    task: { id: ctx.task.id, title: ctx.task.title },
                    projectId: ctx.project.id,
                });
            }
            catch {
                // best-effort
            }
        })();
    }
    async listTimeEntries(taskId) {
        return this.db.query.timeEntries.findMany({
            where: (0, drizzle_orm_1.eq)(db_1.timeEntries.taskId, taskId),
            orderBy: (0, drizzle_orm_1.desc)(db_1.timeEntries.startedAt),
            with: { user: public_user_1.PUBLIC_USER_WITH },
        });
    }
    async getActiveTimer(userId) {
        const [active] = await this.db
            .select({
            id: db_1.timeEntries.id,
            taskId: db_1.timeEntries.taskId,
            userId: db_1.timeEntries.userId,
            description: db_1.timeEntries.description,
            startedAt: db_1.timeEntries.startedAt,
            isBillable: db_1.timeEntries.isBillable,
            taskTitle: db_1.tasks.title,
            workspaceId: db_1.spaces.workspaceId,
            spaceId: db_1.spaces.id,
            projectId: db_1.projects.id,
            listId: db_1.lists.id,
        })
            .from(db_1.timeEntries)
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.timeEntries.taskId))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.timeEntries.userId, userId), (0, drizzle_orm_1.isNull)(db_1.timeEntries.endedAt)))
            .orderBy((0, drizzle_orm_1.desc)(db_1.timeEntries.startedAt))
            .limit(1);
        return active ?? null;
    }
    // --- Helpers for front end / search --------------------------------------
    async resolveTaskContext(taskId) {
        const row = await this.db
            .select({
            task: db_1.tasks,
            list: db_1.lists,
            project: db_1.projects,
            space: db_1.spaces,
        })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId));
        return row[0] ?? null;
    }
    async getTaskNavigation(taskId) {
        const ctx = await this.resolveTaskContext(taskId);
        if (!ctx)
            throw new common_1.NotFoundException('Task not found');
        return {
            workspaceId: ctx.space.workspaceId,
            spaceId: ctx.space.id,
            projectId: ctx.project.id,
            listId: ctx.list.id,
            taskId: ctx.task.id,
            url: this.buildTaskUrl(ctx.space.workspaceId, ctx.space.id, ctx.project.id, ctx.list.id, ctx.task.id),
        };
    }
};
exports.TasksService = TasksService;
exports.TasksService = TasksService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, realtime_gateway_1.RealtimeGateway,
        search_service_1.SearchService,
        automations_service_1.AutomationsService,
        webhooks_service_1.WebhooksService,
        slack_service_1.SlackService,
        notifications_service_1.NotificationsService,
        r2_service_1.R2Service,
        calendar_sync_service_1.CalendarSyncService,
        security_service_1.SecurityService])
], TasksService);
//# sourceMappingURL=tasks.service.js.map