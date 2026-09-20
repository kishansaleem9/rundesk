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
exports.ReportsService = void 0;
exports.normalizeScheduleInput = normalizeScheduleInput;
exports.reportResultToCsv = reportResultToCsv;
exports.monthPeriodRange = monthPeriodRange;
exports.scoreContribution = scoreContribution;
exports.contributionNarrativeFallback = contributionNarrativeFallback;
exports.isWorkingWeekday = isWorkingWeekday;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const item_visibility_1 = require("../../common/permissions/item-visibility");
const pdf_1 = require("./pdf");
const ai_service_1 = require("../ai/ai.service");
function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(0, 0, 0, 0);
    return d;
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/**
 * Validate + clamp incoming schedule fields. Throws BadRequestException on an
 * invalid frequency or malformed recipient email; clamps hour to 0–23 and
 * weekday to 0–6, and defaults a weekly schedule with no weekday to Monday.
 * Returns null when no schedule fields were supplied so a plain name/definition
 * edit leaves the existing schedule untouched.
 */
function normalizeScheduleInput(input) {
    if (!input || typeof input !== 'object')
        return null;
    const hasAny = input.frequency !== undefined ||
        input.hour !== undefined ||
        input.dayOfWeek !== undefined ||
        input.recipients !== undefined;
    if (!hasAny)
        return null;
    const freq = input.frequency;
    if (freq !== undefined && freq !== 'none' && freq !== 'daily' && freq !== 'weekly') {
        throw new common_1.BadRequestException('Invalid schedule frequency');
    }
    const frequency = (freq ?? 'none');
    let hour = 8;
    if (input.hour !== undefined) {
        const h = Math.trunc(Number(input.hour));
        if (!Number.isFinite(h) || h < 0 || h > 23)
            throw new common_1.BadRequestException('Schedule hour must be between 0 and 23');
        hour = h;
    }
    let dayOfWeek = null;
    if (input.dayOfWeek !== undefined && input.dayOfWeek !== null) {
        const d = Math.trunc(Number(input.dayOfWeek));
        if (!Number.isFinite(d) || d < 0 || d > 6)
            throw new common_1.BadRequestException('Schedule day of week must be between 0 and 6');
        dayOfWeek = d;
    }
    if (frequency === 'weekly' && dayOfWeek === null)
        dayOfWeek = 1;
    let recipients = [];
    if (input.recipients !== undefined) {
        if (!Array.isArray(input.recipients))
            throw new common_1.BadRequestException('Recipients must be a list of emails');
        const cleaned = input.recipients.map((e) => String(e ?? '').trim().toLowerCase()).filter((e) => e.length > 0);
        for (const e of cleaned) {
            if (!EMAIL_RE.test(e))
                throw new common_1.BadRequestException(`Invalid recipient email: ${e}`);
        }
        recipients = [...new Set(cleaned)];
    }
    return { scheduleFrequency: frequency, scheduleHour: hour, scheduleDayOfWeek: dayOfWeek, scheduleRecipients: recipients };
}
const SUPPORTED_METRICS = [
    'tasks-count',
    'tasks-completed',
    'on-time-rate',
    'cycle-time',
    'time-logged',
    'billable-hours',
    'sprint-velocity',
];
function isoWeekKey(d) {
    // ISO week: Monday-based. Produce e.g. "2026-W25".
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
function monthKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function csvCell(v) {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
/**
 * Serialize a run result to CSV (a `group` column + one column per metric).
 * Shared by the CSV export endpoint and the scheduled-report email attachment.
 */
function reportResultToCsv(result) {
    const header = ['group', ...result.metrics];
    const lines = [header.map(csvCell).join(',')];
    for (const r of result.rows) {
        lines.push([csvCell(r.label), ...result.metrics.map((m) => csvCell(r.values[m] ?? 0))].join(','));
    }
    return lines.join('\n');
}
const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];
// taskActivity actions that count as collaboration touchpoints (comments,
// assignments, dependency/subtask/date coordination).
const COLLABORATION_ACTIONS = new Set([
    'commented', 'assigned', 'unassigned', 'dependency_added', 'dependency_removed',
    'due_date_changed', 'subtask_added', 'checklist_item_toggled',
]);
/** Pure month-range resolver for this-month / last-month in UTC (§7.14 period selector). */
function monthPeriodRange(period, now) {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    if (period === 'last-month') {
        const from = new Date(Date.UTC(y, m - 1, 1));
        const to = new Date(Date.UTC(y, m, 1) - 1);
        return { from, to, label: `${MONTH_NAMES[from.getUTCMonth()]} ${from.getUTCFullYear()}` };
    }
    const from = new Date(Date.UTC(y, m, 1));
    return { from, to: now, label: `${MONTH_NAMES[m]} ${y}` };
}
/**
 * Composite contribution index from a member's real factors (§7.14). Weighted so
 * completed work and resolved blockers dominate, with on-time reliability and
 * collaboration as secondary signals. Pure + testable.
 */
function scoreContribution(f) {
    const completed = Math.max(0, f.tasksCompleted) * 3;
    const blockers = Math.max(0, f.blockersResolved) * 2;
    const onTime = Math.round(Math.max(0, Math.min(100, f.onTimeRate)) / 10); // 0–10
    const collab = Math.min(20, Math.max(0, f.collaboration));
    return completed + blockers + onTime + collab;
}
/** Deterministic per-member contribution narrative (§7.14 AI fallback). Pure + testable. */
function contributionNarrativeFallback(f) {
    if (f.tasksCompleted === 0 && f.collaboration === 0 && f.blockersResolved === 0) {
        return `${f.name} has no recorded activity in this period.`;
    }
    const parts = [
        `completed ${f.tasksCompleted} task${f.tasksCompleted === 1 ? '' : 's'} (${f.onTimeRate}% on time)`,
    ];
    if (f.blockersResolved > 0)
        parts.push(`resolved ${f.blockersResolved} blocker${f.blockersResolved === 1 ? '' : 's'}`);
    if (f.collaboration > 0) {
        parts.push(`logged ${f.collaboration} collaboration touchpoint${f.collaboration === 1 ? '' : 's'}`);
    }
    const last = parts.pop();
    const joined = parts.length ? `${parts.join(', ')}, and ${last}` : last;
    return `${f.name} ${joined}.`;
}
/**
 * Is `d` one of the workspace's working days?
 *
 * Extracted and exported because of the off-by-one waiting in it: JavaScript's
 * `getDay()` is 0=Sunday..6=Saturday, while `workspaces.work_days` stores ISO
 * weekdays, 1=Monday..7=Sunday. Getting that backwards silently shifts every
 * capacity figure by a day, which no integration test would obviously catch.
 */
function isWorkingWeekday(d, workDays) {
    const js = d.getDay();
    return workDays.has(js === 0 ? 7 : js);
}
let ReportsService = class ReportsService {
    constructor(db, ai) {
        this.db = db;
        this.ai = ai;
    }
    // ─── Overview / Summary card ──────────────────────────────────────────────
    async getOverview(workspaceId, actor) {
        const visFilter = await this.taskVisibilityFilterForWorkspace(workspaceId, actor);
        const allTasksQuery = await this.db
            .select({
            id: db_1.tasks.id,
            title: db_1.tasks.title,
            status: db_1.tasks.status,
            statusCategory: db_1.tasks.statusCategory,
            priority: db_1.tasks.priority,
            dueDate: db_1.tasks.dueDate,
            completedAt: db_1.tasks.completedAt,
            listId: db_1.lists.id,
            listName: db_1.lists.name,
            projectId: db_1.projects.id,
            projectName: db_1.projects.name,
            spaceId: db_1.spaces.id,
            spaceName: db_1.spaces.name,
        })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.tasks.listId, db_1.lists.id))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.lists.projectId, db_1.projects.id))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.projects.spaceId, db_1.spaces.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), visFilter));
        const now = new Date();
        const total = allTasksQuery.length;
        const completed = allTasksQuery.filter((t) => t.status === 'done').length;
        const overdue = allTasksQuery.filter((t) => t.dueDate && new Date(t.dueDate) < now && t.status !== 'done').length;
        const dueTodayTasks = allTasksQuery.filter((t) => {
            if (!t.dueDate)
                return false;
            const d = new Date(t.dueDate);
            return d.toDateString() === now.toDateString() && t.status !== 'done';
        });
        const dueToday = dueTodayTasks.length;
        const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
        const byPriority = { urgent: 0, high: 0, normal: 0, low: 0 };
        for (const t of allTasksQuery) {
            if (t.status === 'done' || t.status === 'cancelled')
                continue;
            const key = (t.priority ?? 'normal');
            if (key in byPriority)
                byPriority[key]++;
        }
        // §9.1: return the actual due-today tasks (not just the count) so the
        // real-time widget can render the list with links, ordered by priority.
        const prioRank = { urgent: 0, high: 1, normal: 2, low: 3 };
        const dueTodayList = dueTodayTasks
            .sort((a, b) => (prioRank[a.priority ?? 'normal'] ?? 2) - (prioRank[b.priority ?? 'normal'] ?? 2))
            .slice(0, 50)
            .map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            statusCategory: t.statusCategory,
            priority: t.priority,
            dueDate: t.dueDate,
            listId: t.listId,
            listName: t.listName,
            projectId: t.projectId,
            projectName: t.projectName,
            spaceId: t.spaceId,
            spaceName: t.spaceName,
        }));
        return { total, completed, overdue, dueToday, completionRate, byPriority, dueTodayList };
    }
    // ─── Productivity per member ──────────────────────────────────────────────
    /**
     * View-Reports scoping (Plan §3.3):
     *   • workspace_admin / super_admin → { kind: 'all' } (see everyone).
     *   • manager                       → { kind: 'containers' } scoped to the
     *     spaces & projects they belong to (space_members / project_members),
     *     plus their own rows — i.e. their TEAM only, not the whole workspace.
     *   • everyone else (member/guest)  → { kind: 'user' } (own row only).
     */
    async getViewerScope(workspaceId, userId) {
        const [m] = await this.db
            .select({ role: db_1.workspaceMembers.role })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)))
            .limit(1);
        if (m && (m.role === 'workspace_admin' || m.role === 'super_admin'))
            return { kind: 'all' };
        if (m && m.role === 'manager') {
            const [spaceRows, projectRows] = await Promise.all([
                this.db
                    .select({ spaceId: db_1.spaceMembers.spaceId })
                    .from(db_1.spaceMembers)
                    .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.spaceMembers.spaceId))
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.spaceMembers.userId, userId))),
                this.db
                    .select({ projectId: db_1.projectMembers.projectId })
                    .from(db_1.projectMembers)
                    .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.projectMembers.projectId))
                    .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.projectMembers.userId, userId))),
            ]);
            return {
                kind: 'containers',
                spaceIds: [...new Set(spaceRows.map((r) => r.spaceId))],
                projectIds: [...new Set(projectRows.map((r) => r.projectId))],
                userId,
            };
        }
        return { kind: 'user', userId };
    }
    /**
     * SQL predicate that a task/time row falls inside a manager's team scope: its
     * space or project is one the manager belongs to, OR (fallback) the row is the
     * manager's own (`ownerCol` = their userId) so their contribution is always
     * visible even outside their containers. Returns undefined for non-container
     * viewers, meaning "no extra restriction".
     */
    containerScopeCondition(viewer, cols) {
        if (viewer.kind !== 'containers')
            return undefined;
        const parts = [];
        if (viewer.spaceIds.length)
            parts.push((0, drizzle_orm_1.inArray)(cols.spaceIdCol, viewer.spaceIds));
        if (viewer.projectIds.length)
            parts.push((0, drizzle_orm_1.inArray)(cols.projectIdCol, viewer.projectIds));
        parts.push((0, drizzle_orm_1.eq)(cols.ownerCol, viewer.userId));
        return (0, drizzle_orm_1.or)(...parts);
    }
    /**
     * §2 per-item task privacy. Returns a WHERE fragment that hides private tasks
     * the actor may not see (only their creator, an assignee, or a workspace
     * manager/admin/super_admin see them; everyone else sees just public tasks).
     * AND it into any query that reads the unaliased `tasks` table.
     *
     * Returns `undefined` — a no-op inside drizzle's `and()` — for managers and for
     * trusted internal/system callers that pass no actor (the scheduled-report
     * mailer, the project-health cron, and unit tests), so those workspace-wide
     * aggregates are unchanged. Every user-facing controller path threads the
     * caller, so per-item privacy is enforced on every request a real user makes.
     */
    async taskVisibilityFilterForWorkspace(workspaceId, actor) {
        if (!actor)
            return undefined;
        const isManager = await (0, item_visibility_1.resolveIsManager)(this.db, workspaceId, actor.id, actor.role);
        return (0, item_visibility_1.taskVisibilityFilter)(this.db, actor.id, isManager);
    }
    async getProductivity(workspaceId, days = 30, viewer = { kind: 'all' }, scope = {}, actor) {
        const since = daysAgo(days);
        // §2 per-item privacy: exclude private tasks the caller can't see from the
        // per-member counts. Applied in the tasks left-join ON (not the WHERE) so a
        // member whose only tasks are hidden still appears with 0 rather than
        // vanishing from the report.
        const visFilter = await this.taskVisibilityFilterForWorkspace(workspaceId, actor);
        // Optional space/project scope (Plan §9). Applied inside the CASE counts so
        // every member still appears (with 0) rather than being filtered out.
        const inScope = scope.projectId
            ? (0, drizzle_orm_1.sql) `${db_1.lists.projectId} = ${scope.projectId}`
            : scope.spaceId
                ? (0, drizzle_orm_1.sql) `${db_1.projects.spaceId} = ${scope.spaceId}`
                : (0, drizzle_orm_1.sql) `true`;
        // Manager team scope (Plan §3.3): restrict counts to the manager's own
        // containers + their own tasks. Folded into the same CASE so members with no
        // in-scope tasks still surface with 0.
        const viewerCond = this.containerScopeCondition(viewer, {
            spaceIdCol: db_1.projects.spaceId,
            projectIdCol: db_1.lists.projectId,
            ownerCol: db_1.users.id,
        });
        const effectiveScope = viewerCond ? (0, drizzle_orm_1.sql) `(${inScope}) and (${viewerCond})` : inScope;
        const rows = await this.db
            .select({
            userId: db_1.users.id,
            displayName: db_1.users.displayName,
            email: db_1.users.email,
            avatarUrl: db_1.users.avatarUrl,
            tasksCompleted: (0, drizzle_orm_1.sql) `count(distinct case when ${db_1.tasks.status} = 'done' and ${effectiveScope} then ${db_1.tasks.id} end)::int`,
            tasksCreated: (0, drizzle_orm_1.sql) `count(distinct case when ${db_1.tasks.createdById} = ${db_1.users.id} and ${effectiveScope} then ${db_1.tasks.id} end)::int`,
            totalAssigned: (0, drizzle_orm_1.sql) `count(distinct case when ${effectiveScope} then ${db_1.tasks.id} end)::int`,
        })
            .from(db_1.users)
            .innerJoin(db_1.workspaceMembers, (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, db_1.users.id))
            .leftJoin(db_1.taskAssignees, (0, drizzle_orm_1.eq)(db_1.taskAssignees.userId, db_1.users.id))
            .leftJoin(db_1.tasks, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskAssignees.taskId), (0, drizzle_orm_1.gte)(db_1.tasks.updatedAt, since), visFilter))
            .leftJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .leftJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .where(viewer.kind === 'user'
            ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.users.id, viewer.userId))
            : (0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId))
            .groupBy(db_1.users.id, db_1.users.displayName, db_1.users.email, db_1.users.avatarUrl)
            .orderBy((0, drizzle_orm_1.desc)((0, drizzle_orm_1.sql) `count(distinct case when ${db_1.tasks.status} = 'done' and ${effectiveScope} then ${db_1.tasks.id} end)`));
        return rows;
    }
    /** Completed-tasks trend bucketed by week or month (Plan §9). */
    async getProductivityTrend(workspaceId, days = 90, bucket = 'week', scope = {}, actor) {
        const since = daysAgo(days);
        const visFilter = await this.taskVisibilityFilterForWorkspace(workspaceId, actor);
        const periodExpr = bucket === 'month'
            ? (0, drizzle_orm_1.sql) `to_char(${db_1.tasks.completedAt} at time zone 'UTC', 'YYYY-MM')`
            : (0, drizzle_orm_1.sql) `to_char(date_trunc('week', ${db_1.tasks.completedAt} at time zone 'UTC'), 'YYYY-MM-DD')`;
        const scopeCond = scope.projectId
            ? (0, drizzle_orm_1.eq)(db_1.lists.projectId, scope.projectId)
            : scope.spaceId
                ? (0, drizzle_orm_1.eq)(db_1.projects.spaceId, scope.spaceId)
                : undefined;
        const rows = await this.db
            .select({
            period: periodExpr,
            tasksCompleted: (0, drizzle_orm_1.sql) `count(distinct ${db_1.tasks.id})::int`,
        })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.gte)(db_1.tasks.completedAt, since), scopeCond, visFilter))
            .groupBy(periodExpr)
            .orderBy(periodExpr);
        return rows;
    }
    // ─── Completion analytics ─────────────────────────────────────────────────
    async getCompletionAnalytics(workspaceId, days = 30, filter = {}, actor) {
        const since = daysAgo(days);
        const visFilter = await this.taskVisibilityFilterForWorkspace(workspaceId, actor);
        const allTasks = await this.db
            .select({
            id: db_1.tasks.id,
            status: db_1.tasks.status,
            dueDate: db_1.tasks.dueDate,
            completedAt: db_1.tasks.completedAt,
            createdAt: db_1.tasks.createdAt,
        })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.tasks.listId, db_1.lists.id))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.lists.projectId, db_1.projects.id))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.projects.spaceId, db_1.spaces.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.gte)(db_1.tasks.createdAt, since), 
        // Optional space/project/assignee filters (Plan §9.3). All optional —
        // omitting them preserves the workspace-wide behaviour.
        filter.projectId ? (0, drizzle_orm_1.eq)(db_1.lists.projectId, filter.projectId) : undefined, filter.spaceId ? (0, drizzle_orm_1.eq)(db_1.projects.spaceId, filter.spaceId) : undefined, filter.memberId
            ? (0, drizzle_orm_1.sql) `exists (select 1 from ${db_1.taskAssignees} where ${db_1.taskAssignees.taskId} = ${db_1.tasks.id} and ${db_1.taskAssignees.userId} = ${filter.memberId})`
            : undefined, visFilter));
        const completed = allTasks.filter((t) => t.status === 'done');
        const onTime = completed.filter((t) => t.completedAt && t.dueDate && new Date(t.completedAt) <= new Date(t.dueDate)).length;
        const late = completed.filter((t) => t.completedAt && t.dueDate && new Date(t.completedAt) > new Date(t.dueDate)).length;
        // Group completed tasks by day for trend chart
        const byDay = {};
        for (let i = days - 1; i >= 0; i--) {
            const d = daysAgo(i);
            byDay[d.toISOString().split('T')[0]] = 0;
        }
        for (const t of completed) {
            if (!t.completedAt)
                continue;
            const day = new Date(t.completedAt).toISOString().split('T')[0];
            if (day in byDay)
                byDay[day]++;
        }
        // Status breakdown
        const statusBreakdown = {};
        for (const t of allTasks) {
            statusBreakdown[t.status] = (statusBreakdown[t.status] ?? 0) + 1;
        }
        return {
            total: allTasks.length,
            completed: completed.length,
            onTime,
            late,
            // Share of tasks created in the window that are now done — lets the
            // completion widget offer a this-week / this-month period toggle (§9.1).
            completionRate: allTasks.length > 0 ? Math.round((completed.length / allTasks.length) * 100) : 0,
            onTimeRate: completed.length > 0 ? Math.round((onTime / completed.length) * 100) : 0,
            trend: Object.entries(byDay).map(([date, count]) => ({ date, count })),
            statusBreakdown,
        };
    }
    // ─── Time tracking report ─────────────────────────────────────────────────
    async getTimeReport(workspaceId, days = 30, viewer = { kind: 'all' }, actor) {
        const since = daysAgo(days);
        // Manager team scope (Plan §3.3): only sum time on tasks in the manager's
        // containers + their own. `sql`true`` for admin/member keeps sums identical
        // to the un-scoped form. The task/list/project joins are 1:1 (time_entries
        // FK → tasks), so they never fan out a member's totals.
        const viewerCond = this.containerScopeCondition(viewer, {
            spaceIdCol: db_1.projects.spaceId,
            projectIdCol: db_1.lists.projectId,
            ownerCol: db_1.users.id,
        });
        // §2 per-item privacy: also drop time logged on private tasks the caller
        // can't see. Folded into the same CASE as the container scope (undefined for
        // managers/system callers, so their sums are unchanged); time_entries.task_id
        // is NOT NULL so the joined task row is always present for the check.
        const visFilter = await this.taskVisibilityFilterForWorkspace(workspaceId, actor);
        const inScopeTime = (0, drizzle_orm_1.and)(viewerCond, visFilter) ?? (0, drizzle_orm_1.sql) `true`;
        const rows = await this.db
            .select({
            userId: db_1.users.id,
            displayName: db_1.users.displayName,
            email: db_1.users.email,
            totalSeconds: (0, drizzle_orm_1.sql) `coalesce(sum(case when ${inScopeTime} then ${db_1.timeEntries.durationSec} else 0 end), 0)::int`,
            billableSeconds: (0, drizzle_orm_1.sql) `coalesce(sum(case when ${inScopeTime} and ${db_1.timeEntries.isBillable} then ${db_1.timeEntries.durationSec} else 0 end), 0)::int`,
            entryCount: (0, drizzle_orm_1.sql) `count(case when ${inScopeTime} then ${db_1.timeEntries.id} end)::int`,
        })
            .from(db_1.users)
            .innerJoin(db_1.workspaceMembers, (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, db_1.users.id))
            .leftJoin(db_1.timeEntries, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.timeEntries.userId, db_1.users.id), (0, drizzle_orm_1.gte)(db_1.timeEntries.startedAt, since)))
            .leftJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.timeEntries.taskId))
            .leftJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .leftJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .where(viewer.kind === 'user'
            ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.users.id, viewer.userId))
            : (0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId))
            .groupBy(db_1.users.id, db_1.users.displayName, db_1.users.email)
            .orderBy((0, drizzle_orm_1.desc)((0, drizzle_orm_1.sql) `coalesce(sum(case when ${inScopeTime} then ${db_1.timeEntries.durationSec} else 0 end), 0)`));
        return rows.map((r) => ({
            ...r,
            totalHours: Math.round((r.totalSeconds / 3600) * 10) / 10,
            billableHours: Math.round((r.billableSeconds / 3600) * 10) / 10,
        }));
    }
    /** Billable hours broken down by project (and its client), Plan §9. */
    async getTimeByProject(workspaceId, days = 30, viewer = { kind: 'all' }, actor) {
        const since = daysAgo(days);
        const visFilter = await this.taskVisibilityFilterForWorkspace(workspaceId, actor);
        // Members see only their own time; managers see time in their containers
        // (or their own); admins see everything. This is a straight row filter here
        // because the report already aggregates per project, so out-of-scope
        // projects simply drop out.
        const viewerFilter = viewer.kind === 'user'
            ? (0, drizzle_orm_1.eq)(db_1.timeEntries.userId, viewer.userId)
            : this.containerScopeCondition(viewer, {
                spaceIdCol: db_1.projects.spaceId,
                projectIdCol: db_1.projects.id,
                ownerCol: db_1.timeEntries.userId,
            });
        const rows = await this.db
            .select({
            projectId: db_1.projects.id,
            projectName: db_1.projects.name,
            clientId: db_1.clients.id,
            clientName: db_1.clients.name,
            totalSeconds: (0, drizzle_orm_1.sql) `coalesce(sum(${db_1.timeEntries.durationSec}), 0)::int`,
            billableSeconds: (0, drizzle_orm_1.sql) `coalesce(sum(case when ${db_1.timeEntries.isBillable} then ${db_1.timeEntries.durationSec} else 0 end), 0)::int`,
            entryCount: (0, drizzle_orm_1.sql) `count(${db_1.timeEntries.id})::int`,
        })
            .from(db_1.timeEntries)
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.timeEntries.taskId))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .leftJoin(db_1.clients, (0, drizzle_orm_1.eq)(db_1.clients.id, db_1.projects.clientId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.gte)(db_1.timeEntries.startedAt, since), viewerFilter, visFilter))
            .groupBy(db_1.projects.id, db_1.projects.name, db_1.clients.id, db_1.clients.name)
            .orderBy((0, drizzle_orm_1.desc)((0, drizzle_orm_1.sql) `coalesce(sum(${db_1.timeEntries.durationSec}), 0)`));
        return rows.map((r) => ({
            ...r,
            totalHours: Math.round((r.totalSeconds / 3600) * 10) / 10,
            billableHours: Math.round((r.billableSeconds / 3600) * 10) / 10,
        }));
    }
    /**
     * Average time tasks spend in each status (Plan §9 bottleneck view), derived
     * from status_changed activity: a task is "in" meta.to from that event until
     * its next status change (or now if it's still there).
     */
    async getStatusDurations(workspaceId, days = 90, filter = {}, actor) {
        const since = daysAgo(days);
        const visFilter = await this.taskVisibilityFilterForWorkspace(workspaceId, actor);
        const events = await this.db
            .select({
            taskId: db_1.taskActivity.taskId,
            meta: db_1.taskActivity.meta,
            createdAt: db_1.taskActivity.createdAt,
        })
            .from(db_1.taskActivity)
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskActivity.taskId))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.taskActivity.action, 'status_changed'), (0, drizzle_orm_1.gte)(db_1.taskActivity.createdAt, since), 
        // Optional space/project/assignee filters (Plan §9.3).
        filter.projectId ? (0, drizzle_orm_1.eq)(db_1.lists.projectId, filter.projectId) : undefined, filter.spaceId ? (0, drizzle_orm_1.eq)(db_1.projects.spaceId, filter.spaceId) : undefined, filter.memberId
            ? (0, drizzle_orm_1.sql) `exists (select 1 from ${db_1.taskAssignees} where ${db_1.taskAssignees.taskId} = ${db_1.tasks.id} and ${db_1.taskAssignees.userId} = ${filter.memberId})`
            : undefined, visFilter))
            .orderBy((0, drizzle_orm_1.asc)(db_1.taskActivity.taskId), (0, drizzle_orm_1.asc)(db_1.taskActivity.createdAt));
        const now = Date.now();
        const durations = new Map();
        let i = 0;
        while (i < events.length) {
            const taskId = events[i].taskId;
            const group = [];
            while (i < events.length && events[i].taskId === taskId) {
                group.push(events[i]);
                i++;
            }
            for (let j = 0; j < group.length; j++) {
                const to = group[j].meta?.to;
                if (!to)
                    continue;
                const start = new Date(group[j].createdAt).getTime();
                const end = j + 1 < group.length ? new Date(group[j + 1].createdAt).getTime() : now;
                const ms = Math.max(0, end - start);
                const d = durations.get(to) ?? { totalMs: 0, count: 0 };
                d.totalMs += ms;
                d.count += 1;
                durations.set(to, d);
            }
        }
        return [...durations.entries()]
            .map(([status, d]) => ({
            status,
            avgHours: Math.round((d.totalMs / d.count / 3_600_000) * 10) / 10,
            samples: d.count,
        }))
            .sort((a, b) => b.avgHours - a.avgHours);
    }
    // ─── Sprint velocity ──────────────────────────────────────────────────────
    async getSprintVelocity(workspaceId, actor) {
        const recentSprints = await this.db
            .select()
            .from(db_1.sprints)
            .where((0, drizzle_orm_1.eq)(db_1.sprints.workspaceId, workspaceId))
            .orderBy((0, drizzle_orm_1.desc)(db_1.sprints.startDate))
            .limit(10);
        // §2 per-item privacy: exclude private tasks the caller can't see from both
        // the task count and the story-point sums. Joining sprint_tasks → tasks is
        // 1:1 on an FK, so with no filter (managers/system callers) no rows drop.
        const visFilter = await this.taskVisibilityFilterForWorkspace(workspaceId, actor);
        const results = await Promise.all(recentSprints.map(async (sprint) => {
            const taskRows = await this.db
                .select({ taskId: db_1.sprintTasks.taskId })
                .from(db_1.sprintTasks)
                .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.sprintTasks.taskId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.sprintTasks.sprintId, sprint.id), visFilter));
            // Sum story points from sprint_tasks
            const [pointsRow] = await this.db
                .select({
                planned: (0, drizzle_orm_1.sql) `coalesce(sum(${db_1.sprintTasks.storyPoints}), 0)::float`,
                completed: (0, drizzle_orm_1.sql) `coalesce(sum(case when ${db_1.tasks.statusCategory} = 'closed' or ${db_1.tasks.status} = 'done' then ${db_1.sprintTasks.storyPoints} else 0 end), 0)::float`,
            })
                .from(db_1.sprintTasks)
                .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.sprintTasks.taskId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.sprintTasks.sprintId, sprint.id), visFilter));
            const plannedPoints = Number(pointsRow?.planned ?? 0);
            const completedPoints = Number(pointsRow?.completed ?? 0);
            return {
                sprintId: sprint.id,
                name: sprint.name,
                startDate: sprint.startDate,
                endDate: sprint.endDate,
                status: sprint.status,
                taskCount: taskRows.length,
                plannedPoints,
                completedPoints,
            };
        }));
        return results;
    }
    // ─── Goals progress ────────────────────────────────────────────────────────
    async getGoalsProgress(workspaceId) {
        const rows = await this.db
            .select()
            .from(db_1.goals)
            .where((0, drizzle_orm_1.eq)(db_1.goals.workspaceId, workspaceId))
            .orderBy((0, drizzle_orm_1.desc)(db_1.goals.createdAt));
        const byStatus = {
            on_track: 0,
            at_risk: 0,
            off_track: 0,
            completed: 0,
        };
        for (const g of rows) {
            const status = g.status;
            if (status in byStatus)
                byStatus[status]++;
        }
        const avgProgress = rows.length > 0
            ? Math.round(rows.reduce((s, g) => {
                const pct = g.targetValue > 0 ? (g.currentValue / g.targetValue) * 100 : 0;
                return s + pct;
            }, 0) / rows.length)
            : 0;
        return {
            goals: rows.map((g) => ({
                ...g,
                progress: g.targetValue > 0 ? Math.round((g.currentValue / g.targetValue) * 100) : 0,
            })),
            byStatus,
            avgProgress,
            total: rows.length,
        };
    }
    async getWorkload(workspaceId, days = 14, actor) {
        const horizon = Math.min(Math.max(days, 1), 90);
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + horizon - 1);
        end.setHours(23, 59, 59, 999);
        const members = await this.db
            .select({
            userId: db_1.users.id,
            name: db_1.users.displayName,
            email: db_1.users.email,
            role: db_1.workspaceMembers.role,
            weeklyCapacityHours: db_1.workspaceMembers.weeklyCapacityHours,
        })
            .from(db_1.workspaceMembers)
            .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.workspaceMembers.userId))
            .where((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId));
        // The workspace's own week, rather than an assumed Mon–Fri. A Sun–Thu team
        // used to read as two days of overtime and two days idle.
        const [wsRow] = await this.db
            .select({ workDays: db_1.workspaces.workDays })
            .from(db_1.workspaces)
            .where((0, drizzle_orm_1.eq)(db_1.workspaces.id, workspaceId))
            .limit(1);
        const workDays = new Set(wsRow?.workDays?.length ? wsRow.workDays : [1, 2, 3, 4, 5]);
        const holidayRows = await this.db
            .select({ day: db_1.workspaceHolidays.day })
            .from(db_1.workspaceHolidays)
            .where((0, drizzle_orm_1.eq)(db_1.workspaceHolidays.workspaceId, workspaceId));
        const holidays = new Set(holidayRows.map((h) => h.day));
        const isWorkDay = (d) => isWorkingWeekday(d, workDays);
        // §A4.10 — someone on leave should not absorb planned load. Leave that
        // straddles the window still counts, so the query is an overlap test.
        // Local calendar day, not toISOString(): the horizon starts at local
        // midnight, and a UTC render would shift a day off by one for anyone west
        // of Greenwich.
        const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const timeOffRows = await this.db
            .select({ userId: db_1.timeOff.userId, startsOn: db_1.timeOff.startsOn, endsOn: db_1.timeOff.endsOn })
            .from(db_1.timeOff)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.timeOff.workspaceId, workspaceId), (0, drizzle_orm_1.gte)(db_1.timeOff.endsOn, isoDay(start)), (0, drizzle_orm_1.lte)(db_1.timeOff.startsOn, isoDay(end))));
        const daysOffByUser = new Map();
        for (const entry of timeOffRows) {
            const set = daysOffByUser.get(entry.userId) ?? new Set();
            for (let offset = 0; offset < horizon; offset++) {
                const day = new Date(start);
                day.setDate(day.getDate() + offset);
                const iso = isoDay(day);
                if (iso >= entry.startsOn && iso <= entry.endsOn)
                    set.add(iso);
            }
            daysOffByUser.set(entry.userId, set);
        }
        const visFilter = await this.taskVisibilityFilterForWorkspace(workspaceId, actor);
        const assignments = await this.db
            .select({
            userId: db_1.taskAssignees.userId,
            timeEstimate: db_1.tasks.timeEstimate,
            startDate: db_1.tasks.startDate,
            dueDate: db_1.tasks.dueDate,
            status: db_1.tasks.status,
        })
            .from(db_1.taskAssignees)
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskAssignees.taskId))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false), (0, drizzle_orm_1.sql) `${db_1.tasks.status} != 'done'`, visFilter));
        const dayCount = horizon;
        const perUser = new Map();
        for (const member of members) {
            perUser.set(member.userId, Array.from({ length: dayCount }, () => 0));
        }
        const toDayStart = (value) => {
            const next = new Date(value);
            next.setHours(0, 0, 0, 0);
            return next;
        };
        for (const assignment of assignments) {
            const dailyLoads = perUser.get(assignment.userId);
            if (!dailyLoads)
                continue;
            const estimateHours = Math.max(0.5, Math.round(((assignment.timeEstimate ?? 4 * 3600) / 3600) * 10) / 10);
            const rawStart = assignment.startDate ? toDayStart(new Date(assignment.startDate)) : start;
            const rawEnd = assignment.dueDate ? toDayStart(new Date(assignment.dueDate)) : rawStart;
            const rangeStart = rawStart < start ? start : rawStart;
            const rangeEnd = rawEnd > end ? end : rawEnd;
            const spanDays = Math.max(1, Math.floor((rangeEnd.getTime() - rangeStart.getTime()) / 86400000) + 1);
            const perDay = estimateHours / spanDays;
            for (let offset = 0; offset < dayCount; offset++) {
                const current = new Date(start);
                current.setDate(current.getDate() + offset);
                const within = current >= rangeStart && current <= rangeEnd;
                if (within)
                    dailyLoads[offset] += perDay;
            }
        }
        // A5.14 — without actual hours the view compares plan against plan, so it
        // can never show over- or under-delivery. Tracked time is inherently
        // backward-looking while the heat-map is forward-looking, so it is summed
        // over the TRAILING window of the same length and reported separately
        // (`trackedWindowDays`) rather than blended into the daily loads.
        const trackedFrom = new Date(start);
        trackedFrom.setDate(trackedFrom.getDate() - (horizon - 1));
        const trackedRows = await this.db
            .select({
            userId: db_1.timeEntries.userId,
            seconds: (0, drizzle_orm_1.sql) `coalesce(sum(${db_1.timeEntries.durationSec}), 0)::int`,
        })
            .from(db_1.timeEntries)
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.timeEntries.taskId))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.gte)(db_1.timeEntries.startedAt, trackedFrom), visFilter))
            .groupBy(db_1.timeEntries.userId);
        const trackedByUser = new Map(trackedRows.map((row) => [row.userId, row.seconds]));
        // Capacity for the trailing window counts the workspace's own working days,
        // matching the week the daily figure below is derived from.
        let trackedWorkdays = 0;
        for (let offset = 0; offset < horizon; offset++) {
            const day = new Date(trackedFrom);
            day.setDate(day.getDate() + offset);
            if (isWorkDay(day) && !holidays.has(isoDay(day)))
                trackedWorkdays++;
        }
        return members.map((member) => {
            const weekly = member.weeklyCapacityHours ?? 40;
            // Spread the week's hours over the days the workspace actually works, so
            // a four-day week reads as longer days rather than a smaller week.
            const dailyCapacity = Math.max(1, Math.round((weekly / workDays.size) * 10) / 10);
            const dailyLoads = (perUser.get(member.userId) ?? []).map((load) => Math.round(load * 10) / 10);
            // Capacity is reported per day rather than as one number so a day off can
            // be zero without pretending the person's whole week shrank.
            const daysOff = daysOffByUser.get(member.userId) ?? new Set();
            const dailyCapacities = Array.from({ length: horizon }, (_, offset) => {
                const day = new Date(start);
                day.setDate(day.getDate() + offset);
                const iso = isoDay(day);
                // Three ways a day has no capacity: it is not a working day, it is a
                // company holiday, or this person is away.
                if (!isWorkDay(day) || holidays.has(iso) || daysOff.has(iso))
                    return 0;
                return dailyCapacity;
            });
            return {
                daysOff: [...daysOff].sort(),
                dailyCapacities,
                userId: member.userId,
                name: member.name ?? 'Unknown',
                email: member.email ?? null,
                role: humanizeRole(member.role),
                capacity: dailyCapacity,
                weeklyCapacityHours: weekly,
                dailyLoads,
                estimatedHours: Math.round(dailyLoads.reduce((sum, load) => sum + load, 0) * 10) / 10,
                trackedHours: Math.round(((trackedByUser.get(member.userId) ?? 0) / 3600) * 10) / 10,
                windowCapacityHours: Math.round(dailyCapacity * trackedWorkdays * 10) / 10,
                trackedWindowDays: horizon,
            };
        });
    }
    /**
     * Drill-down for a single workload heat-map cell (§5.6): the tasks assigned
     * to `userId` that contribute load on `dateStr` (YYYY-MM-DD). Mirrors the
     * span/estimate maths in getWorkload exactly so the per-task `hours` sum to
     * the cell's displayed load. `days` is the same horizon the heat-map uses so
     * the range clamping matches.
     */
    async getWorkloadDay(workspaceId, userId, dateStr, days = 14, actor) {
        const horizon = Math.min(Math.max(days, 1), 90);
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + horizon - 1);
        end.setHours(0, 0, 0, 0);
        const target = new Date(dateStr);
        if (Number.isNaN(target.getTime()))
            return [];
        target.setHours(0, 0, 0, 0);
        const visFilter = await this.taskVisibilityFilterForWorkspace(workspaceId, actor);
        const rows = await this.db
            .select({
            id: db_1.tasks.id,
            title: db_1.tasks.title,
            status: db_1.tasks.status,
            statusCategory: db_1.tasks.statusCategory,
            priority: db_1.tasks.priority,
            startDate: db_1.tasks.startDate,
            dueDate: db_1.tasks.dueDate,
            timeEstimate: db_1.tasks.timeEstimate,
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
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.taskAssignees.userId, userId), (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false), (0, drizzle_orm_1.sql) `${db_1.tasks.status} != 'done'`, visFilter));
        const toDayStart = (value) => {
            const next = new Date(value);
            next.setHours(0, 0, 0, 0);
            return next;
        };
        const prioRank = { urgent: 0, high: 1, normal: 2, low: 3 };
        const result = [];
        for (const task of rows) {
            const estimateHours = Math.max(0.5, Math.round(((task.timeEstimate ?? 4 * 3600) / 3600) * 10) / 10);
            const rawStart = task.startDate ? toDayStart(new Date(task.startDate)) : start;
            const rawEnd = task.dueDate ? toDayStart(new Date(task.dueDate)) : rawStart;
            const rangeStart = rawStart < start ? start : rawStart;
            const rangeEnd = rawEnd > end ? end : rawEnd;
            if (target < rangeStart || target > rangeEnd)
                continue;
            const spanDays = Math.max(1, Math.floor((rangeEnd.getTime() - rangeStart.getTime()) / 86400000) + 1);
            const perDay = estimateHours / spanDays;
            result.push({
                id: task.id,
                title: task.title,
                status: task.status,
                statusCategory: task.statusCategory,
                priority: task.priority,
                startDate: task.startDate,
                dueDate: task.dueDate,
                hours: Math.round(perDay * 10) / 10,
                listId: task.listId,
                listName: task.listName,
                projectId: task.projectId,
                projectName: task.projectName,
                spaceId: task.spaceId,
                spaceName: task.spaceName,
            });
        }
        result.sort((a, b) => (prioRank[a.priority ?? 'normal'] ?? 2) - (prioRank[b.priority ?? 'normal'] ?? 2) || b.hours - a.hours);
        return result;
    }
    /**
     * Deterministic per-project health scores 0–100 (§5.7). Transparent weighted
     * formula from real signals — no AI, no randomness:
     *   score = 100 × ( 0.35·onTime + 0.30·notOverdue + 0.15·notBlocked + 0.20·recentActivity )
     *   • onTime         = completed-with-due tasks finished on/before due date
     *                      (1 if some completed but none had due dates; 0.6 neutral if none completed)
     *   • notOverdue     = 1 − (open tasks past due ÷ open tasks)
     *   • notBlocked     = 1 − (open tasks blocked by an incomplete task ÷ open tasks)
     *   • recentActivity = min(1, activity events in last 7d ÷ open tasks)
     * Bands: green ≥ 75, yellow ≥ 50, red < 50; empty projects score 0.
     */
    async getProjectHealth(workspaceId, actor) {
        const now = Date.now();
        const activitySince = daysAgo(7);
        // §2 per-item privacy: the health signals (task counts, blockers, activity)
        // are computed only over tasks the caller can see. undefined for
        // managers/super-admins and for the daily health cron (no actor), so the
        // persisted snapshots stay workspace-wide.
        const visFilter = await this.taskVisibilityFilterForWorkspace(workspaceId, actor);
        const projectRows = await this.db
            .select({ id: db_1.projects.id, name: db_1.projects.name, color: db_1.projects.color })
            .from(db_1.projects)
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.projects.isArchived, false)))
            .orderBy((0, drizzle_orm_1.asc)(db_1.projects.name));
        const taskRows = await this.db
            .select({
            id: db_1.tasks.id,
            projectId: db_1.lists.projectId,
            status: db_1.tasks.status,
            statusCategory: db_1.tasks.statusCategory,
            dueDate: db_1.tasks.dueDate,
            completedAt: db_1.tasks.completedAt,
        })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false), visFilter));
        const statusById = new Map(taskRows.map((t) => [t.id, t.statusCategory]));
        // Blocked open tasks: normalize both dependency directions to
        // (blockedId ← blockerId); a blocker still open means real blockage.
        const depRows = await this.db
            .select({
            taskId: db_1.taskDependencies.taskId,
            relatedTaskId: db_1.taskDependencies.relatedTaskId,
            type: db_1.taskDependencies.type,
        })
            .from(db_1.taskDependencies)
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskDependencies.taskId))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.taskDependencies.type, ['blocks', 'blocked_by']), visFilter));
        const blockedSet = new Set();
        for (const d of depRows) {
            const blockedId = d.type === 'blocks' ? d.relatedTaskId : d.taskId;
            const blockerId = d.type === 'blocks' ? d.taskId : d.relatedTaskId;
            const blockerStatus = statusById.get(blockerId);
            if (blockerStatus && blockerStatus !== 'closed')
                blockedSet.add(blockedId);
        }
        const activityRows = await this.db
            .select({
            projectId: db_1.lists.projectId,
            count: (0, drizzle_orm_1.sql) `count(${db_1.taskActivity.id})::int`,
        })
            .from(db_1.taskActivity)
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskActivity.taskId))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.gte)(db_1.taskActivity.createdAt, activitySince), visFilter))
            .groupBy(db_1.lists.projectId);
        const activityByProject = new Map(activityRows.map((r) => [r.projectId, r.count]));
        const byProject = new Map();
        for (const t of taskRows) {
            const arr = byProject.get(t.projectId) ?? [];
            arr.push(t);
            byProject.set(t.projectId, arr);
        }
        const W = { onTime: 0.35, overdue: 0.3, blockers: 0.15, activity: 0.2 };
        const isClosed = (t) => t.statusCategory === 'closed' || t.status === 'done';
        const results = projectRows.map((p) => {
            const ts = byProject.get(p.id) ?? [];
            const total = ts.length;
            const completed = ts.filter(isClosed);
            const open = ts.filter((t) => !isClosed(t));
            const openCount = open.length;
            const completedWithDue = completed.filter((t) => t.dueDate && t.completedAt);
            const onTimeCount = completedWithDue.filter((t) => new Date(t.completedAt) <= new Date(t.dueDate)).length;
            const onTimeScore = completedWithDue.length > 0 ? onTimeCount / completedWithDue.length : completed.length > 0 ? 1 : 0.6;
            const overdueOpen = open.filter((t) => t.dueDate && new Date(t.dueDate).getTime() < now).length;
            const overdueScore = openCount > 0 ? 1 - overdueOpen / openCount : 1;
            const blockedOpen = open.filter((t) => blockedSet.has(t.id)).length;
            const blockerScore = openCount > 0 ? 1 - blockedOpen / openCount : 1;
            const recentActivity = activityByProject.get(p.id) ?? 0;
            const activityScore = openCount > 0 ? Math.min(1, recentActivity / openCount) : 1;
            const raw = onTimeScore * W.onTime + overdueScore * W.overdue + blockerScore * W.blockers + activityScore * W.activity;
            const score = total === 0 ? 0 : Math.round(raw * 100);
            const band = total === 0 ? 'empty' : score >= 75 ? 'green' : score >= 50 ? 'yellow' : 'red';
            return {
                projectId: p.id,
                name: p.name,
                color: p.color,
                score,
                band,
                total,
                open: openCount,
                completed: completed.length,
                overdueOpen,
                blockedOpen,
                recentActivity,
                components: {
                    onTime: Math.round(onTimeScore * 100),
                    overdue: Math.round(overdueScore * 100),
                    blockers: Math.round(blockerScore * 100),
                    activity: Math.round(activityScore * 100),
                },
            };
        });
        // Healthiest first; empty projects (score 0) naturally sink to the bottom.
        results.sort((a, b) => b.score - a.score);
        return results;
    }
    /**
     * Workspace-wide recent task activity feed (§9.1). Unlike /notifications
     * (per-user), this returns the latest task_activity events across the whole
     * workspace with actor + task context for linking.
     */
    async getWorkspaceActivity(workspaceId, limit = 20, actor) {
        const safeLimit = Math.min(Math.max(limit, 1), 100);
        const visFilter = await this.taskVisibilityFilterForWorkspace(workspaceId, actor);
        const rows = await this.db
            .select({
            id: db_1.taskActivity.id,
            action: db_1.taskActivity.action,
            meta: db_1.taskActivity.meta,
            createdAt: db_1.taskActivity.createdAt,
            taskId: db_1.tasks.id,
            taskTitle: db_1.tasks.title,
            actorId: db_1.users.id,
            actorName: db_1.users.displayName,
            actorAvatarUrl: db_1.users.avatarUrl,
            listId: db_1.lists.id,
            listName: db_1.lists.name,
            projectId: db_1.projects.id,
            projectName: db_1.projects.name,
            spaceId: db_1.spaces.id,
            spaceName: db_1.spaces.name,
        })
            .from(db_1.taskActivity)
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskActivity.taskId))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.taskActivity.actorId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), visFilter))
            .orderBy((0, drizzle_orm_1.desc)(db_1.taskActivity.createdAt))
            .limit(safeLimit);
        return rows;
    }
    // ─── Custom report builder (real metrics × dimension × filters) ────────────
    async runCustomReport(workspaceId, def, actor) {
        const days = typeof def.days === 'number' && def.days > 0 ? def.days : 30;
        const since = daysAgo(days);
        // §2 per-item privacy: exclude private tasks the caller can't see from the
        // base task set; every metric/dimension below derives from these rows, so the
        // whole report inherits the filter. undefined for managers/system callers
        // (e.g. the scheduled-report mailer), keeping their reports workspace-wide.
        const visFilter = await this.taskVisibilityFilterForWorkspace(workspaceId, actor);
        const dimension = (def.dimension ?? def.dimensions?.[0] ?? 'assignee');
        const requested = (def.metrics ?? []).filter((m) => SUPPORTED_METRICS.includes(m));
        const metrics = requested.length ? requested : ['tasks-count'];
        const want = new Set(metrics);
        const filters = Array.isArray(def.filters) ? def.filters : [];
        // Base task set for the workspace within the date window.
        const taskRows = await this.db
            .select({
            id: db_1.tasks.id,
            status: db_1.tasks.status,
            statusCategory: db_1.tasks.statusCategory,
            priority: db_1.tasks.priority,
            createdAt: db_1.tasks.createdAt,
            dueDate: db_1.tasks.dueDate,
            completedAt: db_1.tasks.completedAt,
            projectId: db_1.projects.id,
            projectName: db_1.projects.name,
        })
            .from(db_1.tasks)
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.tasks.listId, db_1.lists.id))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.lists.projectId, db_1.projects.id))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.projects.spaceId, db_1.spaces.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.gte)(db_1.tasks.createdAt, since), visFilter));
        const taskIds = taskRows.map((t) => t.id);
        // Assignees (needed for the assignee dimension and assignee filters).
        const assigneesByTask = new Map();
        if (taskIds.length) {
            const rows = await this.db
                .select({ taskId: db_1.taskAssignees.taskId, userId: db_1.users.id, name: db_1.users.displayName, email: db_1.users.email })
                .from(db_1.taskAssignees)
                .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.taskAssignees.userId))
                .where((0, drizzle_orm_1.inArray)(db_1.taskAssignees.taskId, taskIds));
            for (const r of rows) {
                const list = assigneesByTask.get(r.taskId) ?? [];
                list.push({ userId: r.userId, name: r.name || r.email });
                assigneesByTask.set(r.taskId, list);
            }
        }
        // Labels (only when grouping by label).
        const labelsByTask = new Map();
        if (dimension === 'label' && taskIds.length) {
            const rows = await this.db
                .select({ taskId: db_1.taskLabelAssignments.taskId, id: db_1.labels.id, name: db_1.labels.name })
                .from(db_1.taskLabelAssignments)
                .innerJoin(db_1.labels, (0, drizzle_orm_1.eq)(db_1.labels.id, db_1.taskLabelAssignments.labelId))
                .where((0, drizzle_orm_1.inArray)(db_1.taskLabelAssignments.taskId, taskIds));
            for (const r of rows) {
                const list = labelsByTask.get(r.taskId) ?? [];
                list.push({ id: r.id, name: r.name });
                labelsByTask.set(r.taskId, list);
            }
        }
        // Time entries (only when a time metric is requested).
        const timeByTask = new Map();
        if ((want.has('time-logged') || want.has('billable-hours')) && taskIds.length) {
            const rows = await this.db
                .select({ taskId: db_1.timeEntries.taskId, durationSec: db_1.timeEntries.durationSec, isBillable: db_1.timeEntries.isBillable })
                .from(db_1.timeEntries)
                .where((0, drizzle_orm_1.inArray)(db_1.timeEntries.taskId, taskIds));
            for (const r of rows) {
                const sec = r.durationSec ?? 0;
                const cur = timeByTask.get(r.taskId) ?? { total: 0, billable: 0 };
                cur.total += sec;
                if (r.isBillable)
                    cur.billable += sec;
                timeByTask.set(r.taskId, cur);
            }
        }
        // Sprint membership + points (sprint dimension or velocity metric).
        const sprintByTask = new Map();
        if ((dimension === 'sprint' || want.has('sprint-velocity')) && taskIds.length) {
            const rows = await this.db
                .select({ taskId: db_1.sprintTasks.taskId, sprintId: db_1.sprints.id, sprintName: db_1.sprints.name, points: db_1.sprintTasks.storyPoints })
                .from(db_1.sprintTasks)
                .innerJoin(db_1.sprints, (0, drizzle_orm_1.eq)(db_1.sprints.id, db_1.sprintTasks.sprintId))
                .where((0, drizzle_orm_1.inArray)(db_1.sprintTasks.taskId, taskIds));
            for (const r of rows) {
                sprintByTask.set(r.taskId, { id: r.sprintId, name: r.sprintName, points: r.points ?? 0 });
            }
        }
        // Apply filters as task predicates.
        const filtered = taskRows.filter((t) => {
            for (const f of filters) {
                const field = (f.field ?? '').toLowerCase();
                const val = (f.value ?? '').toLowerCase().trim();
                if (!field || !val)
                    continue;
                if (field === 'priority' && (t.priority ?? '').toLowerCase() !== val)
                    return false;
                if (field === 'status' && (t.status ?? '').toLowerCase() !== val)
                    return false;
                if (field === 'project' && (t.projectName ?? '').toLowerCase() !== val)
                    return false;
                if (field === 'assignee') {
                    const names = (assigneesByTask.get(t.id) ?? []).map((a) => a.name.toLowerCase());
                    if (!names.includes(val))
                        return false;
                }
            }
            return true;
        });
        // Group by the chosen dimension (1:many dims fan a task into each group).
        const groups = new Map();
        const add = (key, label, t) => {
            const g = groups.get(key);
            if (g)
                g.tasks.push(t);
            else
                groups.set(key, { key, label, tasks: [t] });
        };
        for (const t of filtered) {
            switch (dimension) {
                case 'assignee': {
                    const as = assigneesByTask.get(t.id) ?? [];
                    if (as.length === 0)
                        add('unassigned', 'Unassigned', t);
                    else
                        for (const a of as)
                            add(a.userId, a.name, t);
                    break;
                }
                case 'label': {
                    const ls = labelsByTask.get(t.id) ?? [];
                    if (ls.length === 0)
                        add('none', 'No label', t);
                    else
                        for (const l of ls)
                            add(l.id, l.name, t);
                    break;
                }
                case 'status':
                    add(t.status, t.status, t);
                    break;
                case 'priority':
                    add(t.priority ?? 'normal', t.priority ?? 'normal', t);
                    break;
                case 'project':
                    add(t.projectId, t.projectName ?? 'Unknown', t);
                    break;
                case 'sprint': {
                    const s = sprintByTask.get(t.id);
                    if (!s)
                        add('none', 'No sprint', t);
                    else
                        add(s.id, s.name, t);
                    break;
                }
                case 'date-week':
                    add(isoWeekKey(new Date(t.createdAt)), isoWeekKey(new Date(t.createdAt)), t);
                    break;
                case 'date-month':
                    add(monthKey(new Date(t.createdAt)), monthKey(new Date(t.createdAt)), t);
                    break;
                default:
                    add('all', 'All', t);
            }
        }
        const rows = [...groups.values()].map((g) => {
            const completed = g.tasks.filter((t) => t.statusCategory === 'closed' || !!t.completedAt);
            const values = {};
            if (want.has('tasks-count'))
                values['tasks-count'] = g.tasks.length;
            if (want.has('tasks-completed'))
                values['tasks-completed'] = completed.length;
            if (want.has('on-time-rate')) {
                const onTime = completed.filter((t) => t.completedAt && t.dueDate && new Date(t.completedAt) <= new Date(t.dueDate)).length;
                values['on-time-rate'] = completed.length ? Math.round((onTime / completed.length) * 100) : 0;
            }
            if (want.has('cycle-time')) {
                const durations = completed
                    .filter((t) => t.completedAt)
                    .map((t) => (new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime()) / 86400000);
                values['cycle-time'] = durations.length
                    ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10
                    : 0;
            }
            if (want.has('time-logged')) {
                const sec = g.tasks.reduce((a, t) => a + (timeByTask.get(t.id)?.total ?? 0), 0);
                values['time-logged'] = Math.round((sec / 3600) * 10) / 10;
            }
            if (want.has('billable-hours')) {
                const sec = g.tasks.reduce((a, t) => a + (timeByTask.get(t.id)?.billable ?? 0), 0);
                values['billable-hours'] = Math.round((sec / 3600) * 10) / 10;
            }
            if (want.has('sprint-velocity')) {
                values['sprint-velocity'] =
                    Math.round(completed.reduce((a, t) => a + (sprintByTask.get(t.id)?.points ?? 0), 0) * 10) / 10;
            }
            return { key: g.key, label: g.label, values };
        });
        const primary = metrics[0];
        rows.sort((a, b) => (b.values[primary] ?? 0) - (a.values[primary] ?? 0));
        return { dimension, metrics, generatedAt: new Date().toISOString(), rows };
    }
    async exportCustomReportCsv(workspaceId, def, actor) {
        const result = await this.runCustomReport(workspaceId, def, actor);
        return reportResultToCsv(result);
    }
    /** Render a custom report to a server-generated PDF (Plan §9). */
    async exportCustomReportPdf(workspaceId, def, actor) {
        const result = await this.runCustomReport(workspaceId, def, actor);
        const header = ['Group', ...result.metrics];
        const rows = result.rows.map((r) => [r.label, ...result.metrics.map((m) => r.values[m] ?? 0)]);
        const title = `Custom report — by ${result.dimension}`;
        const subtitle = `Generated ${new Date(result.generatedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
        return (0, pdf_1.renderReportPdf)(title, [subtitle, '', ...(0, pdf_1.tableToLines)(header, rows)]);
    }
    // ─── Saved report definitions ─────────────────────────────────────────────
    listSavedReports(workspaceId) {
        return this.db
            .select()
            .from(db_1.customReports)
            .where((0, drizzle_orm_1.eq)(db_1.customReports.workspaceId, workspaceId))
            .orderBy((0, drizzle_orm_1.desc)(db_1.customReports.createdAt));
    }
    async createSavedReport(workspaceId, userId, name, definition, schedule) {
        if (definition == null || typeof definition !== 'object' || Array.isArray(definition)) {
            throw new common_1.BadRequestException('Report "definition" must be an object');
        }
        const sched = normalizeScheduleInput(schedule);
        const [row] = await this.db
            .insert(db_1.customReports)
            .values({
            workspaceId,
            createdById: userId,
            name: name?.trim() || 'Untitled report',
            definition,
            ...(sched ?? {}),
        })
            .returning();
        return row;
    }
    async updateSavedReport(workspaceId, id, patch) {
        const set = { updatedAt: new Date() };
        if (patch.name !== undefined)
            set.name = patch.name.trim() || 'Untitled report';
        if (patch.definition !== undefined) {
            if (patch.definition == null || typeof patch.definition !== 'object' || Array.isArray(patch.definition)) {
                throw new common_1.BadRequestException('Report "definition" must be an object');
            }
            set.definition = patch.definition;
        }
        const sched = normalizeScheduleInput(patch.schedule);
        if (sched) {
            set.scheduleFrequency = sched.scheduleFrequency;
            set.scheduleHour = sched.scheduleHour;
            set.scheduleDayOfWeek = sched.scheduleDayOfWeek;
            set.scheduleRecipients = sched.scheduleRecipients;
        }
        const [row] = await this.db
            .update(db_1.customReports)
            .set(set)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.customReports.id, id), (0, drizzle_orm_1.eq)(db_1.customReports.workspaceId, workspaceId)))
            .returning();
        if (!row)
            throw new common_1.NotFoundException('Report not found');
        return row;
    }
    async deleteSavedReport(workspaceId, id) {
        const [row] = await this.db
            .delete(db_1.customReports)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.customReports.id, id), (0, drizzle_orm_1.eq)(db_1.customReports.workspaceId, workspaceId)))
            .returning();
        if (!row)
            throw new common_1.NotFoundException('Report not found');
        return { ok: true };
    }
    // ─── Contribution analytics (§7.14) ────────────────────────────────────────
    /** Resolve the reporting window for a contribution report (month or sprint). */
    async resolveContributionPeriod(workspaceId, period, sprintId, now) {
        if (period === 'sprint') {
            const rows = sprintId
                ? await this.db
                    .select()
                    .from(db_1.sprints)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.sprints.id, sprintId), (0, drizzle_orm_1.eq)(db_1.sprints.workspaceId, workspaceId)))
                    .limit(1)
                : await this.db
                    .select()
                    .from(db_1.sprints)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.sprints.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.sprints.status, 'active')))
                    .orderBy((0, drizzle_orm_1.desc)(db_1.sprints.startDate))
                    .limit(1);
            const s = rows[0];
            if (s) {
                const from = new Date(s.startDate);
                const to = s.endDate ? new Date(s.endDate) : now;
                return {
                    from,
                    to,
                    meta: { type: 'sprint', sprintId: s.id, from: from.toISOString(), to: to.toISOString(), label: `Sprint: ${s.name}` },
                };
            }
            // No sprint available — fall back to the current month.
            const mr = monthPeriodRange('this-month', now);
            return {
                from: mr.from,
                to: mr.to,
                meta: { type: 'sprint', from: mr.from.toISOString(), to: mr.to.toISOString(), label: 'No active sprint — this month' },
            };
        }
        const mr = monthPeriodRange(period, now);
        return {
            from: mr.from,
            to: mr.to,
            meta: { type: period, from: mr.from.toISOString(), to: mr.to.toISOString(), label: mr.label },
        };
    }
    /**
     * Per-member contribution factors over a period (§7.14): tasks completed,
     * on-time rate, collaboration touchpoints (comments/assignments/coordination
     * activity), and blockers resolved — all from real data — plus a composite
     * score and an AI narrative per member (deterministic fallback). `opts.viewer`
     * scopes the report (Plan §3.3): members to their own row, managers to their
     * team (containers), admins to everyone.
     */
    async getContribution(workspaceId, opts = {}, ctx = {}) {
        const now = new Date();
        const period = opts.period ?? 'this-month';
        const viewer = opts.viewer ?? { kind: 'all' };
        const { from, to, meta } = await this.resolveContributionPeriod(workspaceId, period, opts.sprintId, now);
        // §2 per-item privacy: exclude private tasks the caller can't see from the
        // per-assignee completion and per-actor activity aggregates below.
        const visFilter = await this.taskVisibilityFilterForWorkspace(workspaceId, ctx.userId ? { id: ctx.userId, role: ctx.role } : undefined);
        const members = await this.db
            .select({ userId: db_1.users.id, name: db_1.users.displayName, email: db_1.users.email })
            .from(db_1.workspaceMembers)
            .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.workspaceMembers.userId))
            .where(viewer.kind === 'user'
            ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.users.id, viewer.userId))
            : (0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId));
        // Manager team scope (Plan §3.3): fold container membership into the
        // per-assignee / per-actor aggregates so a manager's contribution view is
        // restricted to their spaces & projects (plus their own rows). Undefined for
        // admins/members, leaving those aggregates workspace-wide as before.
        const completedViewerCond = this.containerScopeCondition(viewer, {
            spaceIdCol: db_1.projects.spaceId,
            projectIdCol: db_1.lists.projectId,
            ownerCol: db_1.taskAssignees.userId,
        });
        const activityViewerCond = this.containerScopeCondition(viewer, {
            spaceIdCol: db_1.projects.spaceId,
            projectIdCol: db_1.lists.projectId,
            ownerCol: db_1.taskActivity.actorId,
        });
        // Completed / on-time / assigned counts per assignee within the window.
        // Bind the window bounds as ISO strings: a raw ${date} embed in a sql template
        // carries no column type, so the driver would mishandle a bare Date — Postgres
        // casts the string param to timestamptz in the comparison.
        const fromIso = from.toISOString();
        const toIso = to.toISOString();
        const completedRows = await this.db
            .select({
            userId: db_1.taskAssignees.userId,
            completed: (0, drizzle_orm_1.sql) `count(distinct case when ${db_1.tasks.status} = 'done' and ${db_1.tasks.completedAt} >= ${fromIso} and ${db_1.tasks.completedAt} <= ${toIso} then ${db_1.tasks.id} end)::int`,
            onTime: (0, drizzle_orm_1.sql) `count(distinct case when ${db_1.tasks.status} = 'done' and ${db_1.tasks.completedAt} >= ${fromIso} and ${db_1.tasks.completedAt} <= ${toIso} and ${db_1.tasks.dueDate} is not null and ${db_1.tasks.completedAt} <= ${db_1.tasks.dueDate} then ${db_1.tasks.id} end)::int`,
            assigned: (0, drizzle_orm_1.sql) `count(distinct case when ${db_1.tasks.updatedAt} >= ${fromIso} and ${db_1.tasks.updatedAt} <= ${toIso} then ${db_1.tasks.id} end)::int`,
        })
            .from(db_1.taskAssignees)
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskAssignees.taskId))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.tasks.isArchived, false), completedViewerCond, visFilter))
            .groupBy(db_1.taskAssignees.userId);
        // Collaboration + blockers-resolved from the activity log, per actor.
        const activityRows = await this.db
            .select({
            actorId: db_1.taskActivity.actorId,
            action: db_1.taskActivity.action,
            count: (0, drizzle_orm_1.sql) `count(*)::int`,
        })
            .from(db_1.taskActivity)
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskActivity.taskId))
            .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
            .innerJoin(db_1.projects, (0, drizzle_orm_1.eq)(db_1.projects.id, db_1.lists.projectId))
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaces.workspaceId, workspaceId), (0, drizzle_orm_1.gte)(db_1.taskActivity.createdAt, from), (0, drizzle_orm_1.lte)(db_1.taskActivity.createdAt, to), activityViewerCond, visFilter))
            .groupBy(db_1.taskActivity.actorId, db_1.taskActivity.action);
        const completedByUser = new Map(completedRows.map((r) => [r.userId, r]));
        const collabByUser = new Map();
        const blockersByUser = new Map();
        for (const r of activityRows) {
            if (!r.actorId)
                continue;
            if (COLLABORATION_ACTIONS.has(r.action)) {
                collabByUser.set(r.actorId, (collabByUser.get(r.actorId) ?? 0) + r.count);
            }
            if (r.action === 'dependency_removed') {
                blockersByUser.set(r.actorId, (blockersByUser.get(r.actorId) ?? 0) + r.count);
            }
        }
        const factors = members.map((m) => {
            const c = completedByUser.get(m.userId);
            const tasksCompleted = c?.completed ?? 0;
            const onTimeRate = tasksCompleted > 0 ? Math.round(((c?.onTime ?? 0) / tasksCompleted) * 100) : 0;
            const collaboration = collabByUser.get(m.userId) ?? 0;
            const blockersResolved = blockersByUser.get(m.userId) ?? 0;
            const score = scoreContribution({ tasksCompleted, onTimeRate, collaboration, blockersResolved });
            return {
                userId: m.userId,
                name: m.name ?? m.email ?? 'Unknown',
                email: m.email ?? null,
                tasksCompleted,
                tasksAssigned: c?.assigned ?? 0,
                onTimeRate,
                collaboration,
                blockersResolved,
                score,
            };
        });
        factors.sort((a, b) => b.score - a.score || b.tasksCompleted - a.tasksCompleted);
        // AI narrative per member (one model call; deterministic fallback each).
        const items = factors.map((f) => ({
            key: f.userId,
            name: f.name,
            facts: `completed ${f.tasksCompleted} tasks, ${f.onTimeRate}% on time, ${f.collaboration} collaboration touchpoints, ${f.blockersResolved} blockers resolved`,
            fallback: contributionNarrativeFallback(f),
        }));
        const narratives = this.ai
            ? await this.ai.narrateContributions(items, { userId: ctx.userId, workspaceId })
            : Object.fromEntries(items.map((it) => [it.key, it.fallback]));
        const source = this.ai?.isAvailable() ? 'ai' : 'heuristic';
        return {
            period: meta,
            source,
            members: factors.map((f) => ({ ...f, narrative: narratives[f.userId] ?? contributionNarrativeFallback(f) })),
        };
    }
    /** Render a contribution report to a server-generated PDF (§7.14). */
    async exportContributionPdf(workspaceId, opts = {}, ctx = {}) {
        const report = await this.getContribution(workspaceId, opts, ctx);
        const header = ['Member', 'Completed', 'On-time %', 'Collab', 'Blockers', 'Score'];
        const rows = report.members.map((m) => [
            m.name,
            m.tasksCompleted,
            m.onTimeRate,
            m.collaboration,
            m.blockersResolved,
            m.score,
        ]);
        const narrativeLines = report.members.flatMap((m) => [`- ${m.name}: ${m.narrative}`]);
        const lines = [
            `Period: ${report.period.label}`,
            `Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
            '',
            ...(0, pdf_1.tableToLines)(header, rows),
            '',
            'Narratives:',
            ...narrativeLines,
        ];
        return (0, pdf_1.renderReportPdf)('Contribution report', lines);
    }
};
exports.ReportsService = ReportsService;
exports.ReportsService = ReportsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [Object, ai_service_1.AiService])
], ReportsService);
function humanizeRole(role) {
    if (!role)
        return 'Member';
    switch (role) {
        case 'workspace_admin':
            return 'Admin';
        case 'manager':
            return 'Manager';
        case 'guest':
            return 'Guest';
        case 'super_admin':
            return 'Super admin';
        case 'member':
            return 'Member';
        default:
            return role.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
    }
}
//# sourceMappingURL=reports.service.js.map