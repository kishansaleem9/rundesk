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
exports.AutomationsService = void 0;
exports.renderTemplate = renderTemplate;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const realtime_gateway_1 = require("../realtime/realtime.gateway");
/**
 * Replace `{{task.title}}`-style placeholders in an automation message with
 * values from the trigger context. Dotted keys are supported; unknown
 * placeholders are left intact (matches the web i18n interpolator). Pure so the
 * post_to_channel rendering can be unit-tested without a database.
 */
function renderTemplate(template, vars) {
    return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key) => key in vars ? vars[key] : `{{${key}}}`);
}
let AutomationsService = class AutomationsService {
    constructor(db, 
    // RealtimeModule is @Global, so the gateway injects without importing chat.
    realtime) {
        this.db = db;
        this.realtime = realtime;
    }
    // ─── Time-based triggers ───────────────────────────────────────────────────
    // Fires the "Task becomes overdue" / "Task due date passes" automation
    // triggers once a day. These have no event source elsewhere (they're not
    // user actions), so the engine drives them itself.
    async runOverdueTriggers() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const rows = await this.db
            .select({
            taskId: db_1.tasks.id,
            workspaceId: db_1.spaces.workspaceId,
            projectId: db_1.projects.id,
            listId: db_1.lists.id,
        })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false), (0, drizzle_orm_1.lte)(db_1.tasks.dueDate, today), (0, drizzle_orm_1.sql) `${db_1.tasks.statusCategory} <> 'closed'`));
        for (const r of rows) {
            const ctx = { workspaceId: r.workspaceId, taskId: r.taskId, projectId: r.projectId, listId: r.listId };
            await this.fire('task.overdue', ctx).catch(() => { });
            await this.fire('task.due_passed', ctx).catch(() => { });
        }
    }
    // ─── CRUD ─────────────────────────────────────────────────────────────────
    async list(workspaceId) {
        return this.db
            .select()
            .from(db_1.automations)
            .where((0, drizzle_orm_1.eq)(db_1.automations.workspaceId, workspaceId))
            .orderBy((0, drizzle_orm_1.desc)(db_1.automations.createdAt));
    }
    async assertOwnership(workspaceId, automationId) {
        const [row] = await this.db
            .select()
            .from(db_1.automations)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.automations.id, automationId), (0, drizzle_orm_1.eq)(db_1.automations.workspaceId, workspaceId)))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException('Automation not found');
        return row;
    }
    async getOne(workspaceId, id) {
        return this.assertOwnership(workspaceId, id);
    }
    /**
     * Reject/normalise a trigger + actions payload. Persisting a non-object
     * trigger or a non-array `actions` (both reachable via the untyped controller
     * body) stores data the reader can't render — it crashed the automations page
     * via `actions.map is not a function`. Validate at the write boundary so the
     * column invariant (trigger is an object, actions is an array of typed steps)
     * always holds.
     */
    normaliseTrigger(trigger) {
        if (!trigger || typeof trigger !== 'object' || Array.isArray(trigger)) {
            throw new common_1.BadRequestException('Automation trigger must be an object with a "type"');
        }
        const t = trigger;
        if (typeof t.type !== 'string' || !t.type.trim()) {
            throw new common_1.BadRequestException('Automation trigger requires a string "type"');
        }
        return { type: t.type, filters: t.filters ?? undefined };
    }
    normaliseActions(actions) {
        if (!Array.isArray(actions)) {
            throw new common_1.BadRequestException('Automation "actions" must be an array');
        }
        return actions.map((a, i) => {
            if (!a || typeof a !== 'object' || Array.isArray(a) || typeof a.type !== 'string') {
                throw new common_1.BadRequestException(`Automation action #${i + 1} must be an object with a string "type"`);
            }
            const act = a;
            return { type: act.type, params: act.params ?? {} };
        });
    }
    async create(workspaceId, userId, dto) {
        const trigger = this.normaliseTrigger(dto.trigger);
        const actions = this.normaliseActions(dto.actions);
        const [row] = await this.db
            .insert(db_1.automations)
            .values({ workspaceId, createdById: userId, name: dto.name, trigger, actions })
            .returning();
        return row;
    }
    async update(workspaceId, id, patch) {
        await this.assertOwnership(workspaceId, id);
        // Only touch trigger/actions when the caller sends them, but validate the
        // shape when present so an update can't reintroduce a non-array actions.
        const set = { updatedAt: new Date() };
        if (patch.name !== undefined)
            set.name = patch.name;
        if (patch.isEnabled !== undefined)
            set.isEnabled = patch.isEnabled;
        if (patch.trigger !== undefined)
            set.trigger = this.normaliseTrigger(patch.trigger);
        if (patch.actions !== undefined)
            set.actions = this.normaliseActions(patch.actions);
        const [row] = await this.db
            .update(db_1.automations)
            .set(set)
            .where((0, drizzle_orm_1.eq)(db_1.automations.id, id))
            .returning();
        if (!row)
            throw new common_1.NotFoundException('Automation not found');
        return row;
    }
    async remove(workspaceId, id) {
        await this.assertOwnership(workspaceId, id);
        await this.db.delete(db_1.automations).where((0, drizzle_orm_1.eq)(db_1.automations.id, id));
        return { ok: true };
    }
    async listRuns(workspaceId, automationId) {
        await this.assertOwnership(workspaceId, automationId);
        return this.db
            .select()
            .from(db_1.automationRuns)
            .where((0, drizzle_orm_1.eq)(db_1.automationRuns.automationId, automationId))
            .orderBy((0, drizzle_orm_1.desc)(db_1.automationRuns.triggeredAt))
            .limit(100);
    }
    // ─── Trigger evaluation ───────────────────────────────────────────────────
    //
    // Called by other services when domain events occur.
    // Example call: automationsService.fire('task.status_changed', ctx)
    async fire(triggerType, ctx) {
        // Load all enabled automations for this workspace matching trigger type
        const rules = await this.db
            .select()
            .from(db_1.automations)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.automations.workspaceId, ctx.workspaceId), (0, drizzle_orm_1.eq)(db_1.automations.isEnabled, true)));
        const matching = rules.filter((r) => {
            const t = r.trigger;
            if (t.type !== triggerType)
                return false;
            // Apply filter constraints
            if (t.filters?.projectId && ctx.projectId && t.filters.projectId !== ctx.projectId)
                return false;
            if (t.filters?.listId && ctx.listId && t.filters.listId !== ctx.listId)
                return false;
            if (t.filters?.changedField && ctx.changedField && t.filters.changedField !== ctx.changedField)
                return false;
            if (t.filters?.fromStatus && ctx.oldValue && t.filters.fromStatus !== ctx.oldValue)
                return false;
            if (t.filters?.toStatus && ctx.newValue && t.filters.toStatus !== ctx.newValue)
                return false;
            return true;
        });
        for (const rule of matching) {
            await this.executeRule(rule, ctx);
        }
    }
    async executeRule(rule, ctx) {
        let outcome = 'success';
        let errorMsg;
        try {
            const actions = rule.actions;
            for (const action of actions) {
                await this.runAction(action, ctx, rule.createdById);
            }
            // Increment run count and update lastRunAt
            await this.db
                .update(db_1.automations)
                .set({ runCount: rule.runCount + 1, lastRunAt: new Date(), updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(db_1.automations.id, rule.id));
        }
        catch (err) {
            outcome = 'error';
            errorMsg = err?.message ?? String(err);
        }
        // Log the run
        await this.db.insert(db_1.automationRuns).values({
            automationId: rule.id,
            context: {
                taskId: ctx.taskId ?? '',
                userId: ctx.userId ?? '',
                workspaceId: ctx.workspaceId,
            },
            outcome,
            errorMsg,
        });
    }
    async runAction(action, ctx, authorHint) {
        switch (action.type) {
            case 'change_status': {
                if (!ctx.taskId)
                    break;
                const { status } = action.params;
                if (status && typeof status === 'string') {
                    await this.db
                        .update(db_1.tasks)
                        .set({ status: status, updatedAt: new Date() })
                        .where((0, drizzle_orm_1.eq)(db_1.tasks.id, ctx.taskId));
                }
                break;
            }
            case 'set_priority': {
                if (!ctx.taskId)
                    break;
                const { priority } = action.params;
                if (priority && typeof priority === 'string') {
                    await this.db
                        .update(db_1.tasks)
                        .set({ priority: priority, updatedAt: new Date() })
                        .where((0, drizzle_orm_1.eq)(db_1.tasks.id, ctx.taskId));
                }
                break;
            }
            case 'send_notification': {
                if (!ctx.taskId)
                    break;
                // Notify all assignees and creator of the task
                const taskRow = await this.db.select().from(db_1.tasks).where((0, drizzle_orm_1.eq)(db_1.tasks.id, ctx.taskId)).limit(1);
                const task = taskRow[0];
                if (!task)
                    break;
                const message = action.params.message ?? `Automation triggered on task`;
                // Get workspace members to notify
                const members = await this.db
                    .select()
                    .from(db_1.workspaceMembers)
                    .where((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, ctx.workspaceId));
                for (const member of members) {
                    if (member.userId === ctx.userId)
                        continue; // don't notify the actor
                    await this.db.insert(db_1.notifications).values({
                        userId: member.userId,
                        workspaceId: ctx.workspaceId,
                        type: 'task_status_changed',
                        title: 'Automation triggered',
                        body: message,
                        target: ctx.taskId ? { entityType: 'task', entityId: ctx.taskId } : undefined,
                    });
                }
                break;
            }
            case 'create_subtask': {
                if (!ctx.taskId)
                    break;
                const title = action.params.title ?? 'Follow-up task';
                const parentTask = await this.db.select().from(db_1.tasks).where((0, drizzle_orm_1.eq)(db_1.tasks.id, ctx.taskId)).limit(1);
                if (!parentTask[0])
                    break;
                await this.db.insert(db_1.tasks).values({
                    listId: parentTask[0].listId,
                    parentTaskId: ctx.taskId,
                    title,
                    priority: 'normal',
                    status: 'todo',
                });
                break;
            }
            case 'assign_member': {
                if (!ctx.taskId)
                    break;
                const userId = action.params.userId;
                if (userId && typeof userId === 'string') {
                    await this.db.insert(db_1.taskAssignees).values({ taskId: ctx.taskId, userId }).onConflictDoNothing();
                    await this.db.insert(db_1.taskWatchers).values({ taskId: ctx.taskId, userId }).onConflictDoNothing();
                }
                break;
            }
            // Plan §7.7 "post message to channel". Posts a chat message to the given
            // channel; the message body supports `{{task.title}}`-style interpolation
            // from the trigger context.
            case 'post_to_channel': {
                const channelId = typeof action.params.channelId === 'string' ? action.params.channelId : undefined;
                const template = typeof action.params.message === 'string' ? action.params.message : '';
                if (!channelId)
                    break;
                await this.postToChannel(channelId, template, ctx, authorHint);
                break;
            }
            default:
                break;
        }
    }
    // ─── post_to_channel helpers ───────────────────────────────────────────────
    /**
     * Post an automation message into a chat channel via the lowest-level insert
     * path (avoids a Chat↔Automations DI cycle — TasksModule already imports
     * AutomationsModule, so importing ChatModule here would cycle). The message is
     * authored by the automation's creator (`createdById`); when that user is
     * missing or no longer a member we fall back to a workspace admin/member —
     * there is no dedicated system user, so the creator is the cleanest identity.
     */
    async postToChannel(channelId, template, ctx, authorHint) {
        // The channel must exist and belong to the automation's workspace — a rule
        // must never post into another workspace's channel.
        const [channel] = await this.db
            .select({ id: db_1.chatChannels.id, workspaceId: db_1.chatChannels.workspaceId })
            .from(db_1.chatChannels)
            .where((0, drizzle_orm_1.eq)(db_1.chatChannels.id, channelId))
            .limit(1);
        if (!channel)
            throw new common_1.NotFoundException('Channel not found');
        if (channel.workspaceId !== ctx.workspaceId) {
            throw new common_1.ForbiddenException('Channel is not in this workspace');
        }
        const body = renderTemplate(template, await this.buildMessageVars(ctx)).trim();
        if (!body)
            return; // nothing to post (empty template / no vars)
        const authorId = await this.resolveChannelAuthor(ctx.workspaceId, authorHint);
        if (!authorId)
            throw new Error('No eligible author to post automation message');
        const [row] = await this.db
            .insert(db_1.chatMessages)
            .values({ channelId, authorId, body })
            .returning();
        // Broadcast so connected clients render it live, mirroring the shape
        // ChatService.postMessage emits (author name/avatar, empty attachments).
        const [author] = await this.db
            .select({ displayName: db_1.users.displayName, avatarUrl: db_1.users.avatarUrl })
            .from(db_1.users)
            .where((0, drizzle_orm_1.eq)(db_1.users.id, authorId))
            .limit(1);
        this.realtime.emitToWorkspace(channel.workspaceId, {
            type: 'chat.message.created',
            workspaceId: channel.workspaceId,
            channelId,
            message: {
                ...row,
                authorName: author?.displayName,
                authorAvatarUrl: author?.avatarUrl,
                attachments: [],
                reactions: [],
            },
        });
    }
    /** Interpolation variables derived from the trigger context (the task). */
    async buildMessageVars(ctx) {
        const vars = {};
        if (ctx.taskId) {
            const [task] = await this.db
                .select({ title: db_1.tasks.title, status: db_1.tasks.status, priority: db_1.tasks.priority })
                .from(db_1.tasks)
                .where((0, drizzle_orm_1.eq)(db_1.tasks.id, ctx.taskId))
                .limit(1);
            if (task) {
                vars['task.title'] = task.title ?? '';
                vars['task.status'] = task.status ?? '';
                vars['task.priority'] = task.priority ?? '';
            }
        }
        if (ctx.oldValue)
            vars['trigger.oldValue'] = ctx.oldValue;
        if (ctx.newValue)
            vars['trigger.newValue'] = ctx.newValue;
        return vars;
    }
    /** A valid author for the posted message: the creator if still a member, else an admin/member. */
    async resolveChannelAuthor(workspaceId, hint) {
        if (hint) {
            const [member] = await this.db
                .select({ userId: db_1.workspaceMembers.userId })
                .from(db_1.workspaceMembers)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, hint)))
                .limit(1);
            if (member)
                return member.userId;
        }
        const [fallback] = await this.db
            .select({ userId: db_1.workspaceMembers.userId })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId))
            .orderBy((0, drizzle_orm_1.sql) `case when ${db_1.workspaceMembers.role} = 'workspace_admin' then 0 else 1 end`)
            .limit(1);
        return fallback?.userId ?? null;
    }
};
exports.AutomationsService = AutomationsService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_DAY_AT_8AM),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AutomationsService.prototype, "runOverdueTriggers", null);
exports.AutomationsService = AutomationsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, realtime_gateway_1.RealtimeGateway])
], AutomationsService);
//# sourceMappingURL=automations.service.js.map