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
var TaskRemindersService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskRemindersService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const notifications_service_1 = require("../notifications/notifications.service");
/**
 * User-created task reminders (Plan §4/§10). Users pin an arbitrary "remind me
 * at <time>" on a task; a minute tick fires each due reminder exactly once
 * through the notification pipeline. Separate from the automated
 * due-soon/overdue RemindersService in the notifications module.
 */
let TaskRemindersService = TaskRemindersService_1 = class TaskRemindersService {
    constructor(db, notifications) {
        this.db = db;
        this.notifications = notifications;
        this.logger = new common_1.Logger(TaskRemindersService_1.name);
    }
    /** Resolve a task's title + workspace, asserting it lives in this workspace. */
    async resolveTask(workspaceId, taskId) {
        const [row] = await this.db
            .select({ id: db_1.tasks.id, title: db_1.tasks.title })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId), (0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId)))
            .limit(1);
        return row ?? null;
    }
    /** Shared validation: a reminder has to be for a real, future moment. */
    parseWhen(remindAt) {
        const when = remindAt instanceof Date ? remindAt : new Date(remindAt);
        if (Number.isNaN(when.getTime()))
            throw new common_1.BadRequestException('remindAt must be a valid date/time');
        // Allow a minute of clock skew, otherwise reminders must be in the future.
        if (when.getTime() <= Date.now() - 60_000)
            throw new common_1.BadRequestException('remindAt must be in the future');
        return when;
    }
    async create(workspaceId, userId, taskId, remindAt, note) {
        if (!taskId)
            throw new common_1.BadRequestException('taskId is required');
        const when = this.parseWhen(remindAt);
        const task = await this.resolveTask(workspaceId, taskId);
        if (!task)
            throw new common_1.NotFoundException('Task not found in this workspace');
        const trimmedNote = note?.trim() || null;
        const [row] = await this.db
            .insert(db_1.reminders)
            .values({ workspaceId, userId, taskId, remindAt: when, note: trimmedNote })
            .returning();
        return { ...row, taskTitle: task.title };
    }
    /**
     * §G11 [15:19] — a reminder about a chat message.
     *
     * Access is the caller's problem to have established before getting here;
     * ChatService checks the channel and then calls this. What this owns is that
     * the row points at the message, so the notification lands you back on the
     * line you wanted to remember.
     */
    async createForMessage(workspaceId, userId, messageId, remindAt, note) {
        if (!messageId)
            throw new common_1.BadRequestException('messageId is required');
        const when = this.parseWhen(remindAt);
        const [row] = await this.db
            .insert(db_1.reminders)
            .values({ workspaceId, userId, messageId, remindAt: when, note: note?.trim() || null })
            .returning();
        return row;
    }
    /**
     * A reminder about nothing in particular — just a note and a time.
     *
     * This is what `/remind in 2 hours call Ali` should always have been. It used
     * to fabricate a task to hold the text, which left a phantom task in the list
     * for every egg-timer anybody set, and refused outright in a workspace with
     * no list yet.
     */
    async createStandalone(workspaceId, userId, remindAt, note) {
        const trimmedNote = note?.trim();
        if (!trimmedNote)
            throw new common_1.BadRequestException('A reminder needs something to say');
        const when = this.parseWhen(remindAt);
        const [row] = await this.db
            .insert(db_1.reminders)
            .values({ workspaceId, userId, remindAt: when, note: trimmedNote })
            .returning();
        return row;
    }
    /** The caller's reminders on a task (pending first, then fired), soonest first. */
    async listForTask(taskId, userId) {
        return this.db
            .select()
            .from(db_1.reminders)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.reminders.taskId, taskId), (0, drizzle_orm_1.eq)(db_1.reminders.userId, userId)))
            .orderBy((0, drizzle_orm_1.asc)(db_1.reminders.remindAt));
    }
    /**
     * All of the caller's still-pending reminders in a workspace.
     *
     * LEFT joins, not inner. An inner join on `tasks` was correct only while
     * every reminder had a task; the moment one could be about a message or
     * about nothing, an inner join stops being a join and starts being a filter
     * that hides rows the user created and can see no reason for.
     */
    async listUpcoming(workspaceId, userId) {
        return this.db
            .select({
            id: db_1.reminders.id,
            taskId: db_1.reminders.taskId,
            taskTitle: db_1.tasks.title,
            messageId: db_1.reminders.messageId,
            messageBody: db_1.chatMessages.body,
            channelId: db_1.chatMessages.channelId,
            channelName: db_1.chatChannels.name,
            note: db_1.reminders.note,
            remindAt: db_1.reminders.remindAt,
            notifiedAt: db_1.reminders.notifiedAt,
        })
            .from(db_1.reminders)
            .leftJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.reminders.taskId))
            .leftJoin(db_1.chatMessages, (0, drizzle_orm_1.eq)(db_1.chatMessages.id, db_1.reminders.messageId))
            .leftJoin(db_1.chatChannels, (0, drizzle_orm_1.eq)(db_1.chatChannels.id, db_1.chatMessages.channelId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.reminders.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.reminders.userId, userId), (0, drizzle_orm_1.isNull)(db_1.reminders.notifiedAt)))
            .orderBy((0, drizzle_orm_1.asc)(db_1.reminders.remindAt));
    }
    /** The caller's reminders about one chat message, soonest first. */
    async listForMessage(messageId, userId) {
        return this.db
            .select()
            .from(db_1.reminders)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.reminders.messageId, messageId), (0, drizzle_orm_1.eq)(db_1.reminders.userId, userId)))
            .orderBy((0, drizzle_orm_1.asc)(db_1.reminders.remindAt));
    }
    async remove(id, userId) {
        const [row] = await this.db
            .delete(db_1.reminders)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.reminders.id, id), (0, drizzle_orm_1.eq)(db_1.reminders.userId, userId)))
            .returning({ id: db_1.reminders.id });
        if (!row)
            throw new common_1.NotFoundException('Reminder not found');
        return { ok: true };
    }
    /**
     * Fire every reminder that's due and not yet fired. Each row is claimed with a
     * conditional UPDATE (notified_at IS NULL) so a reminder can never double-fire,
     * even if two ticks overlap. Returns the number fired. Public so the tick — and
     * tests — can invoke it directly.
     */
    async processDue(now = new Date()) {
        const due = await this.db
            .select({
            id: db_1.reminders.id,
            userId: db_1.reminders.userId,
            workspaceId: db_1.reminders.workspaceId,
            taskId: db_1.reminders.taskId,
            messageId: db_1.reminders.messageId,
            note: db_1.reminders.note,
            taskTitle: db_1.tasks.title,
            messageBody: db_1.chatMessages.body,
            channelId: db_1.chatMessages.channelId,
        })
            .from(db_1.reminders)
            // LEFT, for the reason listUpcoming gives: an inner join here would let
            // every message and standalone reminder come due and never fire, with
            // nothing anywhere saying why.
            .leftJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.reminders.taskId))
            .leftJoin(db_1.chatMessages, (0, drizzle_orm_1.eq)(db_1.chatMessages.id, db_1.reminders.messageId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.isNull)(db_1.reminders.notifiedAt), (0, drizzle_orm_1.lte)(db_1.reminders.remindAt, now)));
        let fired = 0;
        for (const r of due) {
            // Claim the row; only the tick that flips notified_at sends the notification.
            const claimed = await this.db
                .update(db_1.reminders)
                .set({ notifiedAt: now })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.reminders.id, r.id), (0, drizzle_orm_1.isNull)(db_1.reminders.notifiedAt)))
                .returning({ id: db_1.reminders.id });
            if (claimed.length === 0)
                continue;
            fired++;
            // Three subjects, three destinations. A reminder that fires and lands
            // nowhere is worse than one that never fires — it interrupts you and
            // then refuses to say what about.
            if (r.messageId && r.channelId) {
                void this.notifications.create({
                    userId: r.userId,
                    workspaceId: r.workspaceId,
                    type: 'message_reminder',
                    title: r.note ? `Reminder: ${r.note}` : 'Reminder about a message',
                    body: (r.messageBody ?? '').slice(0, 180) || undefined,
                    target: {
                        entityType: 'chat_message',
                        entityId: r.messageId,
                        url: `/app/${r.workspaceId}/chat?channel=${r.channelId}&message=${r.messageId}`,
                    },
                    emailContext: { commentSnippet: (r.messageBody ?? '').slice(0, 180) },
                });
            }
            else if (r.taskId && r.taskTitle) {
                void this.notifications.create({
                    userId: r.userId,
                    workspaceId: r.workspaceId,
                    type: 'task_due_soon',
                    title: `Reminder: "${r.taskTitle}"`,
                    body: r.note ?? undefined,
                    target: {
                        entityType: 'task',
                        entityId: r.taskId,
                        url: `/app/${r.workspaceId}/tasks/${r.taskId}`,
                    },
                    emailContext: { taskTitle: r.taskTitle },
                });
            }
            else {
                // A note and a time, with nothing to open. It still has to arrive.
                void this.notifications.create({
                    userId: r.userId,
                    workspaceId: r.workspaceId,
                    type: 'message_reminder',
                    title: `Reminder: ${r.note ?? 'you asked to be reminded'}`,
                    target: { entityType: 'insights', entityId: r.workspaceId, url: `/app/${r.workspaceId}/inbox` },
                });
            }
        }
        return fired;
    }
    /** Minute tick — fire any reminders that have come due. */
    async tick() {
        try {
            const fired = await this.processDue();
            if (fired > 0)
                this.logger.log(`Fired ${fired} reminder(s)`);
        }
        catch (err) {
            this.logger.error('Reminder tick failed', err);
        }
    }
};
exports.TaskRemindersService = TaskRemindersService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_MINUTE),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TaskRemindersService.prototype, "tick", null);
exports.TaskRemindersService = TaskRemindersService = TaskRemindersService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, notifications_service_1.NotificationsService])
], TaskRemindersService);
//# sourceMappingURL=task-reminders.service.js.map