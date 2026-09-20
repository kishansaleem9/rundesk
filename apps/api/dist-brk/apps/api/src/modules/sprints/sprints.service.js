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
exports.SprintsService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const item_visibility_1 = require("../../common/permissions/item-visibility");
function isTaskDone(status, statusCategory) {
    return statusCategory === 'closed' || status === 'done';
}
function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}
function endOfDay(d) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
}
function eachDayInclusive(start, end) {
    const days = [];
    const cur = startOfDay(start);
    const last = startOfDay(end);
    while (cur <= last) {
        days.push(new Date(cur));
        cur.setDate(cur.getDate() + 1);
    }
    return days;
}
let SprintsService = class SprintsService {
    constructor(db) {
        this.db = db;
    }
    async loadSprintTaskRows(sprintIds, visFilter) {
        if (sprintIds.length === 0)
            return [];
        return this.db
            .select({
            sprintId: db_1.sprintTasks.sprintId,
            taskId: db_1.tasks.id,
            title: db_1.tasks.title,
            status: db_1.tasks.status,
            statusCategory: db_1.tasks.statusCategory,
            priority: db_1.tasks.priority,
            dueDate: db_1.tasks.dueDate,
            storyPoints: db_1.sprintTasks.storyPoints,
            completedAt: db_1.tasks.completedAt,
        })
            .from(db_1.sprintTasks)
            .innerJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.sprintTasks.taskId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(db_1.sprintTasks.sprintId, sprintIds), visFilter))
            .orderBy((0, drizzle_orm_1.asc)(db_1.sprintTasks.addedAt));
    }
    /**
     * §2 per-item task-visibility WHERE fragment for a sprint's workspace.
     * undefined = no restriction (no actor, or the actor is a manager).
     */
    async sprintTaskVisFilter(workspaceId, actor) {
        if (!actor)
            return undefined;
        const isManager = await (0, item_visibility_1.resolveIsManager)(this.db, workspaceId, actor.id, actor.role);
        return (0, item_visibility_1.taskVisibilityFilter)(this.db, actor.id, isManager);
    }
    aggregateStats(rows) {
        const map = new Map();
        for (const row of rows) {
            const cur = map.get(row.sprintId) ?? {
                taskCount: 0,
                completedTasks: 0,
                totalPoints: 0,
                completedPoints: 0,
            };
            const pts = Number(row.storyPoints ?? 0);
            cur.taskCount += 1;
            cur.totalPoints += pts;
            if (isTaskDone(row.status, row.statusCategory)) {
                cur.completedTasks += 1;
                cur.completedPoints += pts;
            }
            map.set(row.sprintId, cur);
        }
        return map;
    }
    buildBurndown(sprint, rows) {
        const days = eachDayInclusive(sprint.startDate, sprint.endDate);
        if (days.length === 0)
            return [];
        const totalPoints = rows.reduce((s, r) => s + Number(r.storyPoints ?? 0), 0);
        const today = startOfDay(new Date());
        return days.map((day, i) => {
            const dayEnd = endOfDay(day);
            const completedByDay = rows
                .filter((r) => {
                if (!isTaskDone(r.status, r.statusCategory))
                    return false;
                if (!r.completedAt)
                    return startOfDay(day) <= today;
                return new Date(r.completedAt) <= dayEnd;
            })
                .reduce((s, r) => s + Number(r.storyPoints ?? 0), 0);
            const ideal = days.length <= 1
                ? 0
                : Math.round(totalPoints - (totalPoints * i) / (days.length - 1));
            const actual = startOfDay(day) > today ? null : Math.max(0, totalPoints - completedByDay);
            return {
                day: day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                ideal,
                actual,
            };
        });
    }
    async list(workspaceId, actor) {
        const rows = await this.db
            .select()
            .from(db_1.sprints)
            .where((0, drizzle_orm_1.eq)(db_1.sprints.workspaceId, workspaceId))
            .orderBy((0, drizzle_orm_1.desc)(db_1.sprints.startDate));
        const visFilter = await this.sprintTaskVisFilter(workspaceId, actor);
        const taskRows = await this.loadSprintTaskRows(rows.map((s) => s.id), visFilter);
        const statsMap = this.aggregateStats(taskRows);
        return rows.map((s) => {
            const stats = statsMap.get(s.id) ?? {
                taskCount: 0,
                completedTasks: 0,
                totalPoints: 0,
                completedPoints: 0,
            };
            return { ...s, ...stats };
        });
    }
    async getDetail(sprintId, actor) {
        const sprint = await this.get(sprintId);
        const visFilter = await this.sprintTaskVisFilter(sprint.workspaceId, actor);
        const taskRows = await this.loadSprintTaskRows([sprintId], visFilter);
        const stats = this.aggregateStats(taskRows).get(sprintId) ?? {
            taskCount: 0,
            completedTasks: 0,
            totalPoints: 0,
            completedPoints: 0,
        };
        return {
            ...sprint,
            ...stats,
            burndown: this.buildBurndown(sprint, taskRows),
            tasks: taskRows.map((r) => ({
                id: r.taskId,
                title: r.title,
                status: r.status,
                statusCategory: r.statusCategory,
                priority: r.priority,
                dueDate: r.dueDate,
                storyPoints: r.storyPoints,
                completedAt: r.completedAt,
            })),
        };
    }
    async get(sprintId) {
        const [row] = await this.db.select().from(db_1.sprints).where((0, drizzle_orm_1.eq)(db_1.sprints.id, sprintId));
        if (!row)
            throw new common_1.NotFoundException('Sprint not found');
        return row;
    }
    async create(data) {
        const [row] = await this.db
            .insert(db_1.sprints)
            .values({
            workspaceId: data.workspaceId,
            spaceId: data.spaceId ?? null,
            name: data.name,
            goal: data.goal,
            startDate: data.startDate,
            endDate: data.endDate,
        })
            .returning();
        return row;
    }
    async update(sprintId, patch) {
        const set = { ...patch };
        if (patch.status === 'completed' || patch.status === 'cancelled') {
            set.closedAt = new Date();
        }
        const [row] = await this.db.update(db_1.sprints).set(set).where((0, drizzle_orm_1.eq)(db_1.sprints.id, sprintId)).returning();
        if (!row)
            throw new common_1.NotFoundException('Sprint not found');
        return row;
    }
    async delete(sprintId) {
        await this.db.delete(db_1.sprints).where((0, drizzle_orm_1.eq)(db_1.sprints.id, sprintId));
        return { ok: true };
    }
    async listTasks(sprintId, actor) {
        const sprint = await this.get(sprintId);
        const visFilter = await this.sprintTaskVisFilter(sprint.workspaceId, actor);
        const rows = await this.loadSprintTaskRows([sprintId], visFilter);
        return rows.map((r) => ({
            id: r.taskId,
            title: r.title,
            status: r.status,
            statusCategory: r.statusCategory,
            priority: r.priority,
            dueDate: r.dueDate,
            storyPoints: r.storyPoints,
            completedAt: r.completedAt,
        }));
    }
    async addTask(sprintId, taskId, storyPoints) {
        // When storyPoints is omitted (the common case) the conflict `set` would be
        // empty, which drizzle rejects ("No values to set") — so only update on
        // conflict when there's actually a value to write.
        if (storyPoints === undefined) {
            await this.db
                .insert(db_1.sprintTasks)
                .values({ sprintId, taskId })
                .onConflictDoNothing();
        }
        else {
            await this.db
                .insert(db_1.sprintTasks)
                .values({ sprintId, taskId, storyPoints })
                .onConflictDoUpdate({
                target: [db_1.sprintTasks.sprintId, db_1.sprintTasks.taskId],
                set: { storyPoints },
            });
        }
        return { ok: true };
    }
    async removeTask(sprintId, taskId) {
        await this.db
            .delete(db_1.sprintTasks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.sprintTasks.sprintId, sprintId), (0, drizzle_orm_1.eq)(db_1.sprintTasks.taskId, taskId)));
        return { ok: true };
    }
};
exports.SprintsService = SprintsService;
exports.SprintsService = SprintsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], SprintsService);
//# sourceMappingURL=sprints.service.js.map