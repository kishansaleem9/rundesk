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
exports.PersonalTasksService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
let PersonalTasksService = class PersonalTasksService {
    constructor(db) {
        this.db = db;
    }
    list(workspaceId, userId) {
        return this.db
            .select()
            .from(db_1.personalTasks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.personalTasks.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.personalTasks.userId, userId)))
            .orderBy((0, drizzle_orm_1.asc)(db_1.personalTasks.done), (0, drizzle_orm_1.asc)(db_1.personalTasks.position), (0, drizzle_orm_1.desc)(db_1.personalTasks.createdAt));
    }
    async create(workspaceId, userId, title) {
        const trimmed = (title ?? '').trim();
        if (!trimmed)
            throw new common_1.BadRequestException('Title is required');
        const [row] = await this.db
            .insert(db_1.personalTasks)
            .values({ workspaceId, userId, title: trimmed })
            .returning();
        return row;
    }
    async assertOwned(id, userId) {
        const [row] = await this.db.select().from(db_1.personalTasks).where((0, drizzle_orm_1.eq)(db_1.personalTasks.id, id)).limit(1);
        if (!row)
            throw new common_1.NotFoundException('Personal task not found');
        if (row.userId !== userId)
            throw new common_1.ForbiddenException('Not your task');
        return row;
    }
    async update(id, userId, patch) {
        await this.assertOwned(id, userId);
        const set = { updatedAt: new Date() };
        if (patch.title !== undefined) {
            const trimmed = patch.title.trim();
            if (!trimmed)
                throw new common_1.BadRequestException('Title cannot be empty');
            set.title = trimmed;
        }
        if (patch.done !== undefined)
            set.done = patch.done;
        const [row] = await this.db.update(db_1.personalTasks).set(set).where((0, drizzle_orm_1.eq)(db_1.personalTasks.id, id)).returning();
        return row;
    }
    async remove(id, userId) {
        await this.assertOwned(id, userId);
        await this.db.delete(db_1.personalTasks).where((0, drizzle_orm_1.eq)(db_1.personalTasks.id, id));
        return { ok: true };
    }
};
exports.PersonalTasksService = PersonalTasksService;
exports.PersonalTasksService = PersonalTasksService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], PersonalTasksService);
//# sourceMappingURL=personal-tasks.service.js.map