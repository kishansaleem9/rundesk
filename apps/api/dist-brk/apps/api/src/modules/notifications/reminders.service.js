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
var RemindersService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemindersService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const notifications_service_1 = require("./notifications.service");
let RemindersService = RemindersService_1 = class RemindersService {
    constructor(db, notifications) {
        this.db = db;
        this.notifications = notifications;
        this.logger = new common_1.Logger(RemindersService_1.name);
    }
    /**
     * Runs every day at 8 AM UTC.
     * Sends due-soon reminders at each user's configured lead days (§10.4 —
     * default [1, 2], optionally 7) and overdue notifications.
     */
    async sendDueDateReminders() {
        this.logger.log('Running due-date reminder job');
        try {
            const now = new Date();
            const today = new Date(now);
            today.setHours(0, 0, 0, 0);
            // Widest lead window any user can configure (currently 7 days). Fetch
            // every due-soon task in this window once, then decide per-assignee based
            // on that user's configured lead days.
            const maxLeadDays = Math.max(...notifications_service_1.ALLOWED_REMINDER_LEAD_DAYS);
            const windowEnd = new Date(today);
            windowEnd.setDate(windowEnd.getDate() + maxLeadDays);
            windowEnd.setHours(23, 59, 59, 999);
            // Find tasks due within the widest lead window that aren't done/cancelled,
            // joined with each assignee's notification preferences.
            const dueSoonRows = await this.db
                .select({
                taskId: db_1.tasks.id,
                taskTitle: db_1.tasks.title,
                dueDate: db_1.tasks.dueDate,
                assigneeId: db_1.taskAssignees.userId,
                prefs: db_1.users.notificationPreferences,
                workspaceId: db_1.spaces.workspaceId,
                workspaceName: db_1.workspaces.name,
            })
                .from(db_1.tasks)
                .innerJoin(db_1.taskAssignees, (0, drizzle_orm_1.eq)(db_1.taskAssignees.taskId, db_1.tasks.id))
                .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.taskAssignees.userId))
                .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
                .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .innerJoin(db_1.workspaces, (0, drizzle_orm_1.eq)(db_1.workspaces.id, db_1.spaces.workspaceId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false), (0, drizzle_orm_1.gte)(db_1.tasks.dueDate, today), (0, drizzle_orm_1.lte)(db_1.tasks.dueDate, windowEnd), 
            // Exclude done and cancelled
            (0, drizzle_orm_1.sql) `${db_1.tasks.status} NOT IN ('done', 'cancelled')`));
            let dueSoonSent = 0;
            for (const row of dueSoonRows) {
                if (!row.dueDate)
                    continue;
                const dueDay = new Date(row.dueDate);
                dueDay.setHours(0, 0, 0, 0);
                // Whole calendar days from today to the due date (0 = today, 1 = tomorrow).
                const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000);
                // This assignee's configured lead days (default [1, 2] when unset).
                const leadDays = (0, notifications_service_1.normalizeReminderLeadDays)(row.prefs?.reminderLeadDays);
                if (!leadDays.includes(diffDays))
                    continue;
                const dueDateLabel = (0, notifications_service_1.reminderLeadLabel)(diffDays);
                dueSoonSent += 1;
                void this.notifications.create({
                    userId: row.assigneeId,
                    workspaceId: row.workspaceId,
                    type: 'task_due_soon',
                    title: `Task due ${dueDateLabel}: "${row.taskTitle}"`,
                    target: {
                        entityType: 'task',
                        entityId: row.taskId,
                        url: `/app/${row.workspaceId}/tasks/${row.taskId}`,
                    },
                    emailContext: {
                        taskTitle: row.taskTitle,
                        workspaceName: row.workspaceName,
                        dueDateLabel,
                    },
                });
            }
            // Overdue tasks (due before today, not done/cancelled)
            const overdueRows = await this.db
                .select({
                taskId: db_1.tasks.id,
                taskTitle: db_1.tasks.title,
                assigneeId: db_1.taskAssignees.userId,
                workspaceId: db_1.spaces.workspaceId,
                workspaceName: db_1.workspaces.name,
            })
                .from(db_1.tasks)
                .innerJoin(db_1.taskAssignees, (0, drizzle_orm_1.eq)(db_1.taskAssignees.taskId, db_1.tasks.id))
                .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
                .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .innerJoin(db_1.workspaces, (0, drizzle_orm_1.eq)(db_1.workspaces.id, db_1.spaces.workspaceId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false), (0, drizzle_orm_1.lte)(db_1.tasks.dueDate, today), (0, drizzle_orm_1.sql) `${db_1.tasks.status} NOT IN ('done', 'cancelled')`));
            for (const row of overdueRows) {
                void this.notifications.create({
                    userId: row.assigneeId,
                    workspaceId: row.workspaceId,
                    type: 'task_overdue',
                    title: `Overdue task: "${row.taskTitle}"`,
                    target: {
                        entityType: 'task',
                        entityId: row.taskId,
                        url: `/app/${row.workspaceId}/tasks/${row.taskId}`,
                    },
                    emailContext: {
                        taskTitle: row.taskTitle,
                        workspaceName: row.workspaceName,
                    },
                });
            }
            this.logger.log(`Reminders sent: ${dueSoonSent} due-soon (from ${dueSoonRows.length} candidates), ${overdueRows.length} overdue`);
        }
        catch (err) {
            this.logger.error('Due-date reminder job failed', err);
        }
    }
    /**
     * End-of-day: warn anyone who left a timer running (Plan §8.1).
     */
    async warnLeftRunningTimers() {
        try {
            const running = await this.db
                .select({
                userId: db_1.timeEntries.userId,
                taskId: db_1.tasks.id,
                taskTitle: db_1.tasks.title,
                workspaceId: db_1.spaces.workspaceId,
                startedAt: db_1.timeEntries.startedAt,
            })
                .from(db_1.timeEntries)
                .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.timeEntries.taskId))
                .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
                .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
                .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                .where((0, drizzle_orm_1.isNull)(db_1.timeEntries.endedAt));
            for (const row of running) {
                void this.notifications.create({
                    userId: row.userId,
                    workspaceId: row.workspaceId,
                    type: 'task_updated',
                    title: 'Timer still running',
                    body: `Your timer on “${row.taskTitle}” is still running — don't forget to stop it.`,
                    target: { entityType: 'task', entityId: row.taskId, url: `/app/${row.workspaceId}/time` },
                });
            }
            if (running.length)
                this.logger.log(`End-of-day: warned ${running.length} running timers`);
        }
        catch (err) {
            this.logger.error('End-of-day timer warning job failed', err);
        }
    }
};
exports.RemindersService = RemindersService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_DAY_AT_8AM),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RemindersService.prototype, "sendDueDateReminders", null);
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_DAY_AT_6PM),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RemindersService.prototype, "warnLeftRunningTimers", null);
exports.RemindersService = RemindersService = RemindersService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, notifications_service_1.NotificationsService])
], RemindersService);
//# sourceMappingURL=reminders.service.js.map