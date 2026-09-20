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
exports.TimeEntriesService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const security_service_1 = require("../security/security.service");
const notifications_service_1 = require("../notifications/notifications.service");
const item_visibility_1 = require("../../common/permissions/item-visibility");
let TimeEntriesService = class TimeEntriesService {
    constructor(db, security, notifications) {
        this.db = db;
        this.security = security;
        this.notifications = notifications;
    }
    async canModerateApprovals(workspaceId, userId) {
        const [membership] = await this.db
            .select({ role: db_1.workspaceMembers.role })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)))
            .limit(1);
        return membership?.role === 'workspace_admin';
    }
    /** Guests may not track time (Plan §3.3). Resolves the task's workspace role. */
    async assertNotGuestForTask(taskId, userId) {
        const [row] = await this.db
            .select({ role: db_1.workspaceMembers.role })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .innerJoin(db_1.workspaceMembers, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, db_1.spaces.workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)))
            .where((0, drizzle_orm_1.eq)(db_1.tasks.id, taskId))
            .limit(1);
        if (row?.role === 'guest')
            throw new common_1.ForbiddenException('Guests cannot track time');
    }
    /** Per-member monthly timesheet totals over the last `months` (§8.5). */
    async getMonthlyTimesheet(workspaceId, months = 6) {
        const since = new Date();
        since.setUTCMonth(since.getUTCMonth() - months);
        since.setUTCDate(1);
        since.setUTCHours(0, 0, 0, 0);
        const monthExpr = (0, drizzle_orm_1.sql) `to_char(${db_1.timeEntries.startedAt} at time zone 'UTC', 'YYYY-MM')`;
        const rows = await this.db
            .select({
            userId: db_1.users.id,
            displayName: db_1.users.displayName,
            month: monthExpr,
            totalSeconds: (0, drizzle_orm_1.sql) `coalesce(sum(${db_1.timeEntries.durationSec}), 0)::int`,
            billableSeconds: (0, drizzle_orm_1.sql) `coalesce(sum(case when ${db_1.timeEntries.isBillable} then ${db_1.timeEntries.durationSec} else 0 end), 0)::int`,
        })
            .from(db_1.users)
            .innerJoin(db_1.workspaceMembers, (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, db_1.users.id))
            .innerJoin(db_1.timeEntries, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.timeEntries.userId, db_1.users.id), (0, drizzle_orm_1.gte)(db_1.timeEntries.startedAt, since)))
            .where((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId))
            .groupBy(db_1.users.id, db_1.users.displayName, monthExpr);
        return rows
            .map((r) => ({
            ...r,
            totalHours: Math.round((r.totalSeconds / 3600) * 10) / 10,
            billableHours: Math.round((r.billableSeconds / 3600) * 10) / 10,
        }))
            .sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : a.displayName.localeCompare(b.displayName)));
    }
    /**
     * A5.14 — one row per person per weekday for a single week, which is what a
     * team timesheet is. The per-entry list can't answer "what did the team book
     * on Tuesday?" because it is scoped to one member and unpivoted by day.
     * `weekStart` is a Monday (normalized by the caller).
     */
    /** Monday (UTC) of the week containing `weekStart`; today's week when absent. */
    parseWeekStart(weekStart) {
        const iso = weekStart ?? new Date().toISOString().slice(0, 10);
        return new Date(`${this.normalizeWeekStart(iso)}T00:00:00.000Z`);
    }
    async getTeamWeek(workspaceId, weekStart) {
        const weekEnd = new Date(weekStart);
        weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
        // Monday-indexed day-of-week, so column 0 is always the week start.
        const dayExpr = (0, drizzle_orm_1.sql) `(extract(isodow from ${db_1.timeEntries.startedAt} at time zone 'UTC')::int - 1)`;
        const rows = await this.db
            .select({
            userId: db_1.users.id,
            displayName: db_1.users.displayName,
            dayIndex: dayExpr,
            totalSeconds: (0, drizzle_orm_1.sql) `coalesce(sum(${db_1.timeEntries.durationSec}), 0)::int`,
            billableSeconds: (0, drizzle_orm_1.sql) `coalesce(sum(case when ${db_1.timeEntries.isBillable} then ${db_1.timeEntries.durationSec} else 0 end), 0)::int`,
        })
            .from(db_1.users)
            .innerJoin(db_1.workspaceMembers, (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, db_1.users.id))
            .innerJoin(db_1.timeEntries, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.timeEntries.userId, db_1.users.id), (0, drizzle_orm_1.gte)(db_1.timeEntries.startedAt, weekStart), (0, drizzle_orm_1.lt)(db_1.timeEntries.startedAt, weekEnd)))
            .where((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId))
            .groupBy(db_1.users.id, db_1.users.displayName, dayExpr);
        const byUser = new Map();
        for (const row of rows) {
            const entry = byUser.get(row.userId) ?? {
                userId: row.userId,
                displayName: row.displayName ?? '',
                daySeconds: Array.from({ length: 7 }, () => 0),
                totalSeconds: 0,
                billableSeconds: 0,
            };
            if (row.dayIndex >= 0 && row.dayIndex < 7)
                entry.daySeconds[row.dayIndex] += row.totalSeconds;
            entry.totalSeconds += row.totalSeconds;
            entry.billableSeconds += row.billableSeconds;
            byUser.set(row.userId, entry);
        }
        return [...byUser.values()].sort((a, b) => b.totalSeconds - a.totalSeconds);
    }
    /** The owning project's billable default for a task (§8.3). */
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
    /**
     * Member submits their weekly timesheet for approval (§8.7): marks the week
     * 'submitted' and notifies workspace managers/admins (§10.1 approval_needed).
     */
    async submitTimesheet(workspaceId, userId, weekStart) {
        const normalizedWeekStart = this.normalizeWeekStart(weekStart);
        const [row] = await this.db
            .insert(db_1.timeApprovals)
            .values({ workspaceId, userId, weekStart: normalizedWeekStart, status: 'submitted' })
            .onConflictDoUpdate({
            target: [db_1.timeApprovals.workspaceId, db_1.timeApprovals.userId, db_1.timeApprovals.weekStart],
            set: { status: 'submitted', rejectionReason: null, approvedById: null, approvedAt: null, updatedAt: new Date() },
        })
            .returning();
        // Notify managers/admins that an approval is needed.
        const [submitter] = await this.db.select({ name: db_1.users.displayName }).from(db_1.users).where((0, drizzle_orm_1.eq)(db_1.users.id, userId)).limit(1);
        const managers = await this.db
            .select({ userId: db_1.workspaceMembers.userId })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.workspaceMembers.role, ['workspace_admin', 'manager', 'super_admin'])));
        for (const m of managers) {
            if (m.userId === userId)
                continue;
            void this.notifications.create({
                userId: m.userId,
                workspaceId,
                actorId: userId,
                type: 'approval_needed',
                title: `Timesheet awaiting approval`,
                body: `${submitter?.name ?? 'A teammate'} submitted their timesheet for the week of ${normalizedWeekStart}.`,
                target: { entityType: 'timesheet', entityId: `${userId}:${normalizedWeekStart}`, url: `/app/${workspaceId}/time/approvals` },
            });
        }
        return row;
    }
    normalizeWeekStart(weekStart) {
        const parsed = new Date(`${weekStart}T00:00:00.000Z`);
        if (Number.isNaN(parsed.getTime())) {
            throw new common_1.BadRequestException('Invalid week start date');
        }
        const day = parsed.getUTCDay();
        const distanceToMonday = (day + 6) % 7;
        parsed.setUTCDate(parsed.getUTCDate() - distanceToMonday);
        return parsed.toISOString().slice(0, 10);
    }
    async listForWorkspace(workspaceId, opts = {}) {
        // Per-item task privacy (§2): drop entries whose task is a private task the
        // caller may not see (a private task's title would otherwise leak via
        // `taskTitle`). Managers are unrestricted — the filter resolves to undefined.
        const isManager = opts.actorId
            ? await (0, item_visibility_1.resolveIsManager)(this.db, workspaceId, opts.actorId, opts.actorRole)
            : false;
        const where = (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), opts.userId ? (0, drizzle_orm_1.eq)(db_1.timeEntries.userId, opts.userId) : undefined, opts.since ? (0, drizzle_orm_1.gte)(db_1.timeEntries.startedAt, opts.since) : undefined, (0, item_visibility_1.taskVisibilityFilter)(this.db, opts.actorId ?? '', isManager));
        const rows = await this.db
            .select({
            id: db_1.timeEntries.id,
            taskId: db_1.timeEntries.taskId,
            userId: db_1.timeEntries.userId,
            startedAt: db_1.timeEntries.startedAt,
            endedAt: db_1.timeEntries.endedAt,
            durationSec: db_1.timeEntries.durationSec,
            description: db_1.timeEntries.description,
            isBillable: db_1.timeEntries.isBillable,
            createdAt: db_1.timeEntries.createdAt,
            taskTitle: db_1.tasks.title,
            userName: db_1.users.displayName,
        })
            .from(db_1.timeEntries)
            .leftJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.timeEntries.taskId))
            .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.timeEntries.userId))
            .leftJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .leftJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .leftJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where(where)
            .orderBy((0, drizzle_orm_1.desc)(db_1.timeEntries.startedAt))
            .limit(500);
        return rows.map((r) => ({
            ...r,
            // Frontend expected field name compatibility
            durationSeconds: r.durationSec ?? 0,
            billable: r.isBillable,
            loggedAt: r.startedAt,
        }));
    }
    async listApprovals(workspaceId, status) {
        const since = new Date();
        since.setUTCDate(since.getUTCDate() - 90);
        const rows = await this.db
            .select({
            userId: db_1.timeEntries.userId,
            userName: db_1.users.displayName,
            startedAt: db_1.timeEntries.startedAt,
            durationSec: db_1.timeEntries.durationSec,
            isBillable: db_1.timeEntries.isBillable,
            description: db_1.timeEntries.description,
            projectName: db_1.projects.name,
        })
            .from(db_1.timeEntries)
            .leftJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.timeEntries.taskId))
            .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.timeEntries.userId))
            .leftJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .leftJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .leftJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.gte)(db_1.timeEntries.startedAt, since)))
            .orderBy((0, drizzle_orm_1.desc)(db_1.timeEntries.startedAt));
        const approvals = await this.db
            .select()
            .from(db_1.timeApprovals)
            .where((0, drizzle_orm_1.eq)(db_1.timeApprovals.workspaceId, workspaceId));
        const reviewerIds = [...new Set(approvals.map((item) => item.approvedById).filter((id) => Boolean(id)))];
        const reviewerRows = reviewerIds.length > 0
            ? await this.db
                .select({
                id: db_1.users.id,
                displayName: db_1.users.displayName,
                email: db_1.users.email,
            })
                .from(db_1.users)
                .where((0, drizzle_orm_1.inArray)(db_1.users.id, reviewerIds))
            : [];
        const reviewerById = new Map(reviewerRows.map((row) => [row.id, { name: row.displayName ?? null, email: row.email ?? null }]));
        const approvalByKey = new Map(approvals.map((item) => [`${item.userId}:${item.weekStart}`, item]));
        const sheets = new Map();
        for (const row of rows) {
            const startedAt = new Date(row.startedAt);
            const weekStart = this.normalizeWeekStart(startedAt.toISOString().slice(0, 10));
            const key = `${row.userId}:${weekStart}`;
            const approval = approvalByKey.get(key);
            const start = new Date(`${weekStart}T00:00:00.000Z`);
            const end = new Date(start);
            end.setUTCDate(end.getUTCDate() + 6);
            const reviewer = approval?.approvedById ? reviewerById.get(approval.approvedById) : undefined;
            if (!sheets.has(key)) {
                sheets.set(key, {
                    id: key,
                    userId: row.userId,
                    name: row.userName ?? 'Member',
                    weekStart,
                    weekOf: `${start.toLocaleDateString()} — ${end.toLocaleDateString()}`,
                    total: 0,
                    billable: 0,
                    status: approval?.status ?? 'pending',
                    approvedAt: approval?.approvedAt ?? null,
                    approvedById: approval?.approvedById ?? null,
                    reviewerName: reviewer?.name ?? null,
                    reviewerEmail: reviewer?.email ?? null,
                    rejectionReason: approval?.rejectionReason ?? undefined,
                    entries: [],
                });
            }
            const sheet = sheets.get(key);
            const hours = (row.durationSec ?? 0) / 3600;
            sheet.total += hours;
            if (row.isBillable)
                sheet.billable += hours;
            sheet.entries.push({
                project: row.projectName ?? 'Project',
                hours: Number(hours.toFixed(2)),
                billable: row.isBillable,
                note: row.description ?? undefined,
            });
        }
        const allSheets = [...sheets.values()]
            .map((sheet) => ({
            ...sheet,
            total: Number(sheet.total.toFixed(1)),
            billable: Number(sheet.billable.toFixed(1)),
        }))
            .sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
        return status ? allSheets.filter((sheet) => sheet.status === status) : allSheets;
    }
    async setApprovalStatus(workspaceId, userId, weekStart, actorId, input) {
        const normalizedWeekStart = this.normalizeWeekStart(weekStart);
        const [existing] = await this.db
            .select()
            .from(db_1.timeApprovals)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.timeApprovals.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.timeApprovals.userId, userId), (0, drizzle_orm_1.eq)(db_1.timeApprovals.weekStart, normalizedWeekStart)))
            .limit(1);
        if (existing) {
            const [updated] = await this.db
                .update(db_1.timeApprovals)
                .set({
                status: input.status,
                rejectionReason: input.status === 'rejected' ? input.reason ?? null : null,
                approvedById: actorId,
                approvedAt: new Date(),
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(db_1.timeApprovals.id, existing.id))
                .returning();
            await this.security.logAuditEvent({
                workspaceId,
                actorId,
                action: `timesheet.${input.status}`,
                resourceType: 'timesheet',
                resourceId: `${userId}:${normalizedWeekStart}`,
                description: `Timesheet ${input.status} for week ${normalizedWeekStart}`,
                metadata: {
                    userId,
                    weekStart: normalizedWeekStart,
                    rejectionReason: input.reason ?? null,
                },
            });
            return updated;
        }
        const [created] = await this.db
            .insert(db_1.timeApprovals)
            .values({
            workspaceId,
            userId,
            weekStart: normalizedWeekStart,
            status: input.status,
            rejectionReason: input.status === 'rejected' ? input.reason ?? null : null,
            approvedById: actorId,
            approvedAt: new Date(),
        })
            .returning();
        await this.security.logAuditEvent({
            workspaceId,
            actorId,
            action: `timesheet.${input.status}`,
            resourceType: 'timesheet',
            resourceId: `${userId}:${normalizedWeekStart}`,
            description: `Timesheet ${input.status} for week ${normalizedWeekStart}`,
            metadata: {
                userId,
                weekStart: normalizedWeekStart,
                rejectionReason: input.reason ?? null,
            },
        });
        return created;
    }
    async getRunning(userId) {
        const [row] = await this.db
            .select()
            .from(db_1.timeEntries)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.timeEntries.userId, userId), (0, drizzle_orm_1.isNull)(db_1.timeEntries.endedAt)))
            .orderBy((0, drizzle_orm_1.desc)(db_1.timeEntries.startedAt))
            .limit(1);
        return row ?? null;
    }
    async start(userId, taskId, description, isBillable) {
        await this.assertNotGuestForTask(taskId, userId);
        // Stop any existing running timer for this user
        const running = await this.getRunning(userId);
        if (running)
            await this.stop(running.id, userId);
        const [row] = await this.db
            .insert(db_1.timeEntries)
            .values({
            userId,
            taskId,
            startedAt: new Date(),
            description,
            isBillable: isBillable ?? (await this.projectDefaultBillable(taskId)),
        })
            .returning();
        return row;
    }
    async stop(entryId, userId) {
        const [existing] = await this.db.select().from(db_1.timeEntries).where((0, drizzle_orm_1.eq)(db_1.timeEntries.id, entryId));
        if (!existing)
            throw new common_1.NotFoundException('Entry not found');
        if (existing.userId !== userId)
            throw new common_1.ForbiddenException('Not your timer');
        if (existing.endedAt)
            return existing;
        const endedAt = new Date();
        const durationSec = Math.floor((endedAt.getTime() - new Date(existing.startedAt).getTime()) / 1000);
        const [row] = await this.db
            .update(db_1.timeEntries)
            .set({ endedAt, durationSec, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.timeEntries.id, entryId))
            .returning();
        return row;
    }
    async createManual(data) {
        await this.assertNotGuestForTask(data.taskId, data.userId);
        const startedAt = data.startedAt ?? new Date();
        const endedAt = new Date(startedAt.getTime() + data.durationSec * 1000);
        const [row] = await this.db
            .insert(db_1.timeEntries)
            .values({
            userId: data.userId,
            taskId: data.taskId,
            startedAt,
            endedAt,
            durationSec: data.durationSec,
            description: data.description,
            isBillable: data.isBillable ?? (await this.projectDefaultBillable(data.taskId)),
        })
            .returning();
        return row;
    }
    async update(entryId, userId, patch) {
        const [existing] = await this.db.select().from(db_1.timeEntries).where((0, drizzle_orm_1.eq)(db_1.timeEntries.id, entryId));
        if (!existing)
            throw new common_1.NotFoundException('Entry not found');
        if (existing.userId !== userId)
            throw new common_1.ForbiddenException('Not your entry');
        const set = { ...patch, updatedAt: new Date() };
        if (typeof patch.durationSec === 'number' && patch.startedAt) {
            set.endedAt = new Date(patch.startedAt.getTime() + patch.durationSec * 1000);
        }
        const [row] = await this.db.update(db_1.timeEntries).set(set).where((0, drizzle_orm_1.eq)(db_1.timeEntries.id, entryId)).returning();
        return row;
    }
    async remove(entryId, userId) {
        const [existing] = await this.db.select().from(db_1.timeEntries).where((0, drizzle_orm_1.eq)(db_1.timeEntries.id, entryId));
        if (!existing)
            throw new common_1.NotFoundException('Entry not found');
        if (existing.userId !== userId)
            throw new common_1.ForbiddenException('Not your entry');
        await this.db.delete(db_1.timeEntries).where((0, drizzle_orm_1.eq)(db_1.timeEntries.id, entryId));
        return { ok: true };
    }
};
exports.TimeEntriesService = TimeEntriesService;
exports.TimeEntriesService = TimeEntriesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, security_service_1.SecurityService,
        notifications_service_1.NotificationsService])
], TimeEntriesService);
//# sourceMappingURL=time-entries.service.js.map