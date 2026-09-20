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
exports.TimeOffService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
/** Longest single leave entry — a year of "away" is a leaver, not a holiday. */
const MAX_TIME_OFF_DAYS = 365;
/** YYYY-MM-DD, the shape the `date` column round-trips without a timezone. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
/**
 * §A4.10 Days off. ClickUp models workweeks, working hours, holiday calendars
 * and team days off; for an agency only the last one changes a decision, so this
 * stores exactly that and feeds it to the workload heat-map.
 */
let TimeOffService = class TimeOffService {
    constructor(db) {
        this.db = db;
    }
    /**
     * Every entry overlapping [from, to] for the workspace. Availability is a team
     * fact — you cannot plan around leave you cannot see — so this is not scoped
     * to the caller.
     */
    async list(workspaceId, range) {
        const from = range?.from && DATE_ONLY.test(range.from) ? range.from : undefined;
        const to = range?.to && DATE_ONLY.test(range.to) ? range.to : undefined;
        return this.db
            .select({
            id: db_1.timeOff.id,
            userId: db_1.timeOff.userId,
            startsOn: db_1.timeOff.startsOn,
            endsOn: db_1.timeOff.endsOn,
            note: db_1.timeOff.note,
            displayName: db_1.users.displayName,
            email: db_1.users.email,
        })
            .from(db_1.timeOff)
            .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.timeOff.userId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.timeOff.workspaceId, workspaceId), 
        // Overlap, not containment: leave that starts before the window and
        // ends inside it still removes capacity from the window.
        from ? (0, drizzle_orm_1.gte)(db_1.timeOff.endsOn, from) : undefined, to ? (0, drizzle_orm_1.lte)(db_1.timeOff.startsOn, to) : undefined))
            .orderBy((0, drizzle_orm_1.asc)(db_1.timeOff.startsOn));
    }
    async create(workspaceId, actor, input) {
        const userId = input.userId ?? actor.id;
        // Booking someone else's leave is a scheduling decision about them, so it
        // stays with managers; anyone may record their own.
        if (userId !== actor.id && !actor.isManager) {
            throw new common_1.ForbiddenException('Only an admin or manager can record time off for someone else');
        }
        if (!DATE_ONLY.test(input.startsOn ?? '') || !DATE_ONLY.test(input.endsOn ?? '')) {
            throw new common_1.BadRequestException('startsOn and endsOn must be YYYY-MM-DD dates');
        }
        const start = new Date(`${input.startsOn}T00:00:00Z`);
        const end = new Date(`${input.endsOn}T00:00:00Z`);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            throw new common_1.BadRequestException('startsOn and endsOn must be valid dates');
        }
        if (end < start)
            throw new common_1.BadRequestException('endsOn must not be before startsOn');
        const spanDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
        if (spanDays > MAX_TIME_OFF_DAYS) {
            throw new common_1.BadRequestException(`Time off cannot span more than ${MAX_TIME_OFF_DAYS} days`);
        }
        const [membership] = await this.db
            .select({ userId: db_1.workspaceMembers.userId })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)))
            .limit(1);
        if (!membership)
            throw new common_1.BadRequestException('That user is not a member of this workspace');
        const [row] = await this.db
            .insert(db_1.timeOff)
            .values({
            workspaceId,
            userId,
            startsOn: input.startsOn,
            endsOn: input.endsOn,
            note: input.note?.trim() || null,
            createdById: actor.id,
        })
            .returning();
        return row;
    }
    async remove(workspaceId, entryId, actor) {
        const [row] = await this.db
            .select()
            .from(db_1.timeOff)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.timeOff.id, entryId), (0, drizzle_orm_1.eq)(db_1.timeOff.workspaceId, workspaceId)))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException('Time off entry not found');
        if (row.userId !== actor.id && !actor.isManager) {
            throw new common_1.ForbiddenException('Only an admin or manager can remove someone else’s time off');
        }
        await this.db.delete(db_1.timeOff).where((0, drizzle_orm_1.eq)(db_1.timeOff.id, entryId));
        return { ok: true };
    }
};
exports.TimeOffService = TimeOffService;
exports.TimeOffService = TimeOffService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], TimeOffService);
//# sourceMappingURL=time-off.service.js.map