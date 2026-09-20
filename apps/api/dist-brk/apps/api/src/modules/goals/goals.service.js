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
exports.GoalsService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
let GoalsService = class GoalsService {
    constructor(db) {
        this.db = db;
    }
    list(workspaceId, opts = {}) {
        const where = (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.goals.workspaceId, workspaceId), opts.spaceId === null ? (0, drizzle_orm_1.isNull)(db_1.goals.spaceId) : opts.spaceId ? (0, drizzle_orm_1.eq)(db_1.goals.spaceId, opts.spaceId) : undefined, opts.parentGoalId === null ? (0, drizzle_orm_1.isNull)(db_1.goals.parentGoalId) : opts.parentGoalId ? (0, drizzle_orm_1.eq)(db_1.goals.parentGoalId, opts.parentGoalId) : undefined);
        return this.db
            .select({
            id: db_1.goals.id,
            workspaceId: db_1.goals.workspaceId,
            spaceId: db_1.goals.spaceId,
            parentGoalId: db_1.goals.parentGoalId,
            ownerId: db_1.goals.ownerId,
            ownerName: db_1.users.displayName,
            title: db_1.goals.title,
            description: db_1.goals.description,
            kind: db_1.goals.kind,
            targetValue: db_1.goals.targetValue,
            currentValue: db_1.goals.currentValue,
            unit: db_1.goals.unit,
            status: db_1.goals.status,
            startDate: db_1.goals.startDate,
            dueDate: db_1.goals.dueDate,
            completedAt: db_1.goals.completedAt,
            createdAt: db_1.goals.createdAt,
            updatedAt: db_1.goals.updatedAt,
        })
            .from(db_1.goals)
            .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.goals.ownerId))
            .where(where)
            .orderBy((0, drizzle_orm_1.asc)(db_1.goals.dueDate), (0, drizzle_orm_1.desc)(db_1.goals.createdAt));
    }
    async create(data) {
        const [row] = await this.db
            .insert(db_1.goals)
            .values({
            workspaceId: data.workspaceId,
            spaceId: data.spaceId ?? null,
            parentGoalId: data.parentGoalId ?? null,
            ownerId: data.ownerId ?? null,
            title: data.title,
            description: data.description,
            kind: data.kind ?? 'percentage',
            targetValue: data.targetValue ?? 100,
            unit: data.unit,
            startDate: data.startDate,
            dueDate: data.dueDate,
        })
            .returning();
        return row;
    }
    async update(goalId, patch, actorId) {
        const [existing] = await this.db.select().from(db_1.goals).where((0, drizzle_orm_1.eq)(db_1.goals.id, goalId));
        if (!existing)
            throw new common_1.NotFoundException('Goal not found');
        const set = { ...patch, updatedAt: new Date() };
        if (typeof patch.currentValue === 'number' && patch.currentValue !== existing.currentValue) {
            await this.db.insert(db_1.goalUpdates).values({
                goalId,
                authorId: actorId,
                fromValue: existing.currentValue,
                toValue: patch.currentValue,
            });
            const target = patch.targetValue ?? existing.targetValue;
            if (patch.currentValue >= target && existing.status !== 'completed') {
                set.status = 'completed';
                set.completedAt = new Date();
            }
        }
        const [row] = await this.db.update(db_1.goals).set(set).where((0, drizzle_orm_1.eq)(db_1.goals.id, goalId)).returning();
        return row;
    }
    async delete(goalId) {
        await this.db.delete(db_1.goals).where((0, drizzle_orm_1.eq)(db_1.goals.id, goalId));
        return { ok: true };
    }
    history(goalId) {
        return this.db
            .select()
            .from(db_1.goalUpdates)
            .where((0, drizzle_orm_1.eq)(db_1.goalUpdates.goalId, goalId))
            .orderBy((0, drizzle_orm_1.desc)(db_1.goalUpdates.createdAt));
    }
    // ─── Single goal detail (goal + owner + key results) ───────────────────────
    async getOne(goalId) {
        const [goal] = await this.db
            .select({
            id: db_1.goals.id,
            workspaceId: db_1.goals.workspaceId,
            spaceId: db_1.goals.spaceId,
            parentGoalId: db_1.goals.parentGoalId,
            ownerId: db_1.goals.ownerId,
            owner: { id: db_1.users.id, displayName: db_1.users.displayName, avatarUrl: db_1.users.avatarUrl },
            title: db_1.goals.title,
            description: db_1.goals.description,
            kind: db_1.goals.kind,
            targetValue: db_1.goals.targetValue,
            currentValue: db_1.goals.currentValue,
            unit: db_1.goals.unit,
            status: db_1.goals.status,
            startDate: db_1.goals.startDate,
            dueDate: db_1.goals.dueDate,
            completedAt: db_1.goals.completedAt,
            createdAt: db_1.goals.createdAt,
            updatedAt: db_1.goals.updatedAt,
        })
            .from(db_1.goals)
            .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.goals.ownerId))
            .where((0, drizzle_orm_1.eq)(db_1.goals.id, goalId))
            .limit(1);
        if (!goal)
            throw new common_1.NotFoundException('Goal not found');
        const keyResults = await this.listKeyResults(goalId);
        return { ...goal, keyResults };
    }
    // ─── Key results (OKR sub-metrics) ─────────────────────────────────────────
    listKeyResults(goalId) {
        return this.db
            .select({
            id: db_1.goalKeyResults.id,
            goalId: db_1.goalKeyResults.goalId,
            ownerId: db_1.goalKeyResults.ownerId,
            ownerName: db_1.users.displayName,
            title: db_1.goalKeyResults.title,
            unit: db_1.goalKeyResults.unit,
            targetValue: db_1.goalKeyResults.targetValue,
            currentValue: db_1.goalKeyResults.currentValue,
            status: db_1.goalKeyResults.status,
            position: db_1.goalKeyResults.position,
            createdAt: db_1.goalKeyResults.createdAt,
            updatedAt: db_1.goalKeyResults.updatedAt,
        })
            .from(db_1.goalKeyResults)
            .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.goalKeyResults.ownerId))
            .where((0, drizzle_orm_1.eq)(db_1.goalKeyResults.goalId, goalId))
            .orderBy((0, drizzle_orm_1.asc)(db_1.goalKeyResults.position), (0, drizzle_orm_1.asc)(db_1.goalKeyResults.createdAt));
    }
    async createKeyResult(goalId, data) {
        const [goal] = await this.db.select({ workspaceId: db_1.goals.workspaceId }).from(db_1.goals).where((0, drizzle_orm_1.eq)(db_1.goals.id, goalId)).limit(1);
        if (!goal)
            throw new common_1.NotFoundException('Goal not found');
        const [existing] = await this.db.select({ n: db_1.goalKeyResults.position }).from(db_1.goalKeyResults).where((0, drizzle_orm_1.eq)(db_1.goalKeyResults.goalId, goalId)).orderBy((0, drizzle_orm_1.desc)(db_1.goalKeyResults.position)).limit(1);
        const [row] = await this.db
            .insert(db_1.goalKeyResults)
            .values({
            goalId,
            workspaceId: goal.workspaceId,
            title: data.title,
            unit: data.unit,
            targetValue: data.targetValue ?? 100,
            currentValue: data.currentValue ?? 0,
            ownerId: data.ownerId ?? null,
            position: (existing?.n ?? -1) + 1,
        })
            .returning();
        return row;
    }
    async updateKeyResult(krId, patch) {
        const [existing] = await this.db.select().from(db_1.goalKeyResults).where((0, drizzle_orm_1.eq)(db_1.goalKeyResults.id, krId)).limit(1);
        if (!existing)
            throw new common_1.NotFoundException('Key result not found');
        const set = { ...patch, updatedAt: new Date() };
        if (typeof patch.currentValue === 'number') {
            const target = patch.targetValue ?? existing.targetValue;
            if (patch.currentValue >= target)
                set.status = patch.status ?? 'completed';
        }
        const [row] = await this.db.update(db_1.goalKeyResults).set(set).where((0, drizzle_orm_1.eq)(db_1.goalKeyResults.id, krId)).returning();
        return row;
    }
    async deleteKeyResult(krId) {
        await this.db.delete(db_1.goalKeyResults).where((0, drizzle_orm_1.eq)(db_1.goalKeyResults.id, krId));
        return { ok: true };
    }
};
exports.GoalsService = GoalsService;
exports.GoalsService = GoalsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], GoalsService);
//# sourceMappingURL=goals.service.js.map