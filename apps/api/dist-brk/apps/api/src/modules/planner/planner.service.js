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
exports.PlannerService = exports.DEFAULT_BLOCK_PREFIX = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
/**
 * §V2-02 — the Planner.
 *
 * `[12:40]` "Planner ka matlab — woh basically Google Calendar [jaisa] hai."
 * Frame `13:08` is a week grid; `[14:52]` is dragging a task onto it.
 *
 * Blocks are PERSONAL. `[14:56]` "to yeh MERI planner pe bhi show honge" —
 * this is one person's plan for their own week, not a shared schedule, which
 * is why every read here is scoped by `userId` and never widened by a role.
 * A manager who could see your blocks would be seeing your day, not your work.
 */
/** A week is the widest thing the grid asks for; a month view would ask twice. */
const MAX_RANGE_DAYS = 62;
/** Frame `14:45` — dragging task `dbgdh` on makes a block "Work on dbgdh". */
exports.DEFAULT_BLOCK_PREFIX = 'Work on';
/** The values `users.week_start` already accepts, unchanged. */
const WEEK_STARTS = ['sunday', 'monday', 'saturday'];
/**
 * Checked against the runtime's own timezone database rather than a list kept
 * here. A hard-coded list goes stale the next time a country moves its clocks,
 * and the failure is a person unable to pick where they live.
 */
function isKnownTimezone(zone) {
    try {
        new Intl.DateTimeFormat('en', { timeZone: zone });
        return true;
    }
    catch {
        return false;
    }
}
function parseInstant(value, field) {
    if (typeof value !== 'string' && !(value instanceof Date)) {
        throw new common_1.BadRequestException(`"${field}" must be a date`);
    }
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime()))
        throw new common_1.BadRequestException(`"${field}" is not a valid date`);
    return d;
}
let PlannerService = class PlannerService {
    constructor(db) {
        this.db = db;
    }
    /**
     * The blocks on one person's grid between two instants.
     *
     * Half-open on purpose — `[from, to)` — so asking for two consecutive weeks
     * returns each block exactly once. A closed range double-counts anything
     * starting precisely at midnight on the boundary, which is most all-day
     * blocks.
     */
    async listBlocks(workspaceId, userId, fromRaw, toRaw) {
        const from = parseInstant(fromRaw, 'from');
        const to = parseInstant(toRaw, 'to');
        if (to <= from)
            throw new common_1.BadRequestException('"to" must be after "from"');
        const days = (to.getTime() - from.getTime()) / 86_400_000;
        if (days > MAX_RANGE_DAYS) {
            throw new common_1.BadRequestException(`A planner range covers at most ${MAX_RANGE_DAYS} days`);
        }
        const rows = await this.db
            .select({
            id: db_1.taskTimeBlocks.id,
            taskId: db_1.taskTimeBlocks.taskId,
            title: db_1.taskTimeBlocks.title,
            startsAt: db_1.taskTimeBlocks.startsAt,
            endsAt: db_1.taskTimeBlocks.endsAt,
            isAllDay: db_1.taskTimeBlocks.isAllDay,
            taskTitle: db_1.tasks.title,
            taskStatus: db_1.tasks.status,
            taskPriority: db_1.tasks.priority,
            taskListId: db_1.tasks.listId,
            /*
             * §V2-02e — what "Show recurring" has to have in order to mean
             * anything. A block on a recurring task is one occurrence of something
             * that happens again; the grid can only draw the next ones if it is
             * told the cadence, and it was not. The setting existed, the column
             * existed, and the two had never been introduced.
             *
             * Sent as the task's stored recurrence rather than as pre-computed
             * dates: the range the grid draws changes with the view and the
             * arrows, and a server that baked in a horizon would be wrong for
             * every span but the one it guessed.
             */
            taskRecurrence: db_1.tasks.recurrence,
        })
            .from(db_1.taskTimeBlocks)
            .leftJoin(db_1.tasks, (0, drizzle_orm_1.eq)(db_1.tasks.id, db_1.taskTimeBlocks.taskId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.taskTimeBlocks.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.taskTimeBlocks.userId, userId), (0, drizzle_orm_1.gte)(db_1.taskTimeBlocks.startsAt, from), (0, drizzle_orm_1.lt)(db_1.taskTimeBlocks.startsAt, to)))
            .orderBy((0, drizzle_orm_1.asc)(db_1.taskTimeBlocks.startsAt));
        /*
         * `label` is resolved here rather than stored, so renaming a task renames
         * every block that points at it. A stored copy would leave last week's
         * grid describing a task by a name it no longer has.
         */
        return rows.map((r) => ({ ...r, label: r.title ?? r.taskTitle ?? null }));
    }
    /**
     * The person's own planner preferences.
     *
     * Returned WITH `weekStart` and `timezone`, which are columns on `users` and
     * not part of the planner blob. Frame `14:10` puts "Start week on" and
     * "Timezone" on the Appearance page, so the page needs them — but they are
     * account-wide settings that every date in the product already honours, and
     * a planner-local copy that could drift from them would be a bug with a
     * settings page for creating it. The page reads and writes the real columns
     * through here.
     */
    async getSettings(userId) {
        const [row] = await this.db
            .select({ settings: db_1.users.plannerSettings, weekStart: db_1.users.weekStart, timezone: db_1.users.timezone })
            .from(db_1.users)
            .where((0, drizzle_orm_1.eq)(db_1.users.id, userId))
            .limit(1);
        return {
            ...(row?.settings ?? {}),
            weekStart: row?.weekStart ?? 'sunday',
            timezone: row?.timezone ?? 'UTC',
        };
    }
    async updateSettings(userId, patch) {
        if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
            throw new common_1.BadRequestException('Planner settings must be an object');
        }
        /*
         * `weekStart` and `timezone` are peeled off and written to their own
         * columns rather than into the blob — see `getSettings`. Everything else
         * in the product reads those columns, so the Appearance page changing
         * them has to change them for real, not just for the calendar.
         */
        const { weekStart, timezone, ...plannerOnly } = patch;
        if (weekStart !== undefined && !WEEK_STARTS.includes(weekStart)) {
            throw new common_1.BadRequestException(`Week start must be one of ${WEEK_STARTS.join(', ')}`);
        }
        if (timezone !== undefined && !isKnownTimezone(timezone)) {
            throw new common_1.BadRequestException('That is not a timezone this system knows');
        }
        /*
         * §V2-02e — the switches are booleans, and until now anything at all was
         * accepted into the blob.
         *
         * This matters more than it looks. A reader written as `value !== false`
         * treats the string `"false"` as ON, and a reader written as
         * `value === true` treats it as OFF — so a bad value does not fail, it
         * makes two readers of one setting disagree. Rejecting it here is the only
         * place that cannot drift.
         */
        const BOOLEAN_KEYS = [
            'showWeekends',
            'showWeekNumbers',
            'alwaysOpenAtStartOfWeek',
            'darkenNonWorkingHours',
            'savePersonalEventsQuickly',
            'showAssigned',
            'showRecurring',
            'showOverdue',
            'upcomingShowTimeLeft',
            'upcomingQuickJoin',
            'upcomingDesktopNotify',
        ];
        for (const key of BOOLEAN_KEYS) {
            const value = plannerOnly[key];
            if (value !== undefined && typeof value !== 'boolean') {
                throw new common_1.BadRequestException(`"${key}" must be true or false`);
            }
        }
        /* The fourth value is `list`, and the web dialog's own copy of this union
         * was missing it for as long as the controller has accepted it. */
        if (patch.colorTasksBy !== undefined) {
            const allowed = ['none', 'priority', 'status', 'list'];
            if (!allowed.includes(patch.colorTasksBy)) {
                throw new common_1.BadRequestException(`Colour tasks by must be one of ${allowed.join(', ')}`);
            }
        }
        if (patch.defaultDurationMinutes !== undefined) {
            const n = patch.defaultDurationMinutes;
            if (!Number.isInteger(n) || n < 5 || n > 24 * 60) {
                throw new common_1.BadRequestException('Default event duration must be between 5 minutes and 24 hours');
            }
        }
        /*
         * A default list you cannot post to is worse than no default: every task
         * created from a message would fail somewhere the person never sees.
         */
        if (patch.defaultListId) {
            const [list] = await this.db
                .select({ id: db_1.lists.id })
                .from(db_1.lists)
                .where((0, drizzle_orm_1.eq)(db_1.lists.id, patch.defaultListId))
                .limit(1);
            if (!list)
                throw new common_1.BadRequestException('That list does not exist');
        }
        const { weekStart: currentWeek, timezone: currentZone, ...currentPlanner } = await this.getSettings(userId);
        const nextPlanner = { ...currentPlanner, ...plannerOnly };
        await this.db
            .update(db_1.users)
            .set({
            plannerSettings: nextPlanner,
            weekStart: weekStart ?? currentWeek,
            timezone: timezone ?? currentZone,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(db_1.users.id, userId));
        return { ...nextPlanner, weekStart: weekStart ?? currentWeek, timezone: timezone ?? currentZone };
    }
    /**
     * Put a block on the grid. `[14:52]` — the drop target of the drag.
     *
     * A task-backed block stores no title: it renders from the task, prefixed
     * with the person's own "Work on". Storing the composed string would freeze
     * both the prefix and the task's name at the moment of the drag.
     */
    async createBlock(workspaceId, userId, body) {
        const startsAt = parseInstant(body.startsAt, 'startsAt');
        let endsAt;
        if (body.endsAt) {
            endsAt = parseInstant(body.endsAt, 'endsAt');
        }
        else {
            // No end given: the person's own default duration, which is what
            // dropping a task on the grid does — it does not ask for a length.
            const settings = await this.getSettings(userId);
            const minutes = settings.defaultDurationMinutes ?? 60;
            endsAt = new Date(startsAt.getTime() + minutes * 60_000);
        }
        if (endsAt <= startsAt)
            throw new common_1.BadRequestException('A block must end after it starts');
        const title = body.title?.trim() || null;
        if (!body.taskId && !title) {
            throw new common_1.BadRequestException('A block needs a task or a title');
        }
        if (body.taskId) {
            // The task must exist and be in this workspace — a block pointing across
            // workspaces would render a title its owner is not allowed to read.
            const [task] = await this.db
                .select({ id: db_1.tasks.id })
                .from(db_1.tasks)
                .innerJoin(db_1.lists, (0, drizzle_orm_1.eq)(db_1.lists.id, db_1.tasks.listId))
                .where((0, drizzle_orm_1.eq)(db_1.tasks.id, body.taskId))
                .limit(1);
            if (!task)
                throw new common_1.NotFoundException('Task not found');
        }
        const [row] = await this.db
            .insert(db_1.taskTimeBlocks)
            .values({
            workspaceId,
            userId,
            taskId: body.taskId ?? null,
            title: body.taskId ? null : title,
            startsAt,
            endsAt,
            isAllDay: body.isAllDay === true,
        })
            .returning();
        return row;
    }
    /** Moving or resizing a block on the grid. */
    async updateBlock(blockId, userId, patch) {
        const existing = await this.ownedBlock(blockId, userId);
        const startsAt = patch.startsAt !== undefined ? parseInstant(patch.startsAt, 'startsAt') : existing.startsAt;
        const endsAt = patch.endsAt !== undefined ? parseInstant(patch.endsAt, 'endsAt') : existing.endsAt;
        if (endsAt <= startsAt)
            throw new common_1.BadRequestException('A block must end after it starts');
        const set = { startsAt, endsAt, updatedAt: new Date() };
        if (patch.isAllDay !== undefined)
            set.isAllDay = patch.isAllDay === true;
        if (patch.title !== undefined) {
            const title = patch.title?.trim() || null;
            if (!existing.taskId && !title)
                throw new common_1.BadRequestException('A block needs a task or a title');
            // A task-backed block keeps rendering from its task; a title here would
            // be written and never read.
            if (!existing.taskId)
                set.title = title;
        }
        const [row] = await this.db
            .update(db_1.taskTimeBlocks)
            .set(set)
            .where((0, drizzle_orm_1.eq)(db_1.taskTimeBlocks.id, blockId))
            .returning();
        return row;
    }
    async deleteBlock(blockId, userId) {
        await this.ownedBlock(blockId, userId);
        await this.db.delete(db_1.taskTimeBlocks).where((0, drizzle_orm_1.eq)(db_1.taskTimeBlocks.id, blockId));
        return { ok: true };
    }
    /**
     * A block you do not own is a 404, not a 403 — the same reasoning as a
     * private view. Somebody else's plan for their Thursday is not something you
     * should be able to confirm the existence of.
     */
    async ownedBlock(blockId, userId) {
        const [row] = await this.db
            .select()
            .from(db_1.taskTimeBlocks)
            .where((0, drizzle_orm_1.eq)(db_1.taskTimeBlocks.id, blockId))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException('Block not found');
        if (row.userId !== userId)
            throw new common_1.NotFoundException('Block not found');
        return row;
    }
};
exports.PlannerService = PlannerService;
exports.PlannerService = PlannerService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], PlannerService);
//# sourceMappingURL=planner.service.js.map