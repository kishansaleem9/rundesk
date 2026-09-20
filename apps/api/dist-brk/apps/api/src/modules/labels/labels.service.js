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
exports.LabelsService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
let LabelsService = class LabelsService {
    constructor(db) {
        this.db = db;
    }
    list(workspaceId) {
        return this.db
            .select()
            .from(db_1.labels)
            .where((0, drizzle_orm_1.eq)(db_1.labels.workspaceId, workspaceId))
            .orderBy((0, drizzle_orm_1.asc)(db_1.labels.name));
    }
    /**
     * Create a tag, or hand back the one that already answers to that name.
     *
     * §G15 [23:16] — "likh ke ENTER dabao to naya tag ban jaye", which makes this
     * the create path people hit constantly rather than once from a settings
     * screen. Two things follow.
     *
     * It has to be idempotent. `uq_label_name_per_workspace` means a second
     * "urgent" is a 23505, and a type-and-Enter box produces exactly that the
     * moment somebody tags a second task with a tag they already made. Returning
     * the existing row is also what the user meant: they typed a name to get a
     * tag by that name, not to get a new row.
     *
     * And the match has to ignore case, which the constraint does not. "Urgent"
     * and "urgent" are one tag as far as anybody typing is concerned, and letting
     * both exist turns the list into a spelling test.
     */
    async create(workspaceId, data) {
        const name = data.name.trim();
        if (!name)
            throw new common_1.BadRequestException('A tag needs a name');
        const [existing] = await this.db
            .select()
            .from(db_1.labels)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.labels.workspaceId, workspaceId), (0, drizzle_orm_1.sql) `lower(${db_1.labels.name}) = lower(${name})`))
            .limit(1);
        if (existing)
            return existing;
        try {
            const [row] = await this.db
                .insert(db_1.labels)
                .values({ workspaceId, name, color: data.color })
                .returning();
            return row;
        }
        catch (err) {
            // Two people naming the same tag at once. The loser of the race wanted
            // the tag, not the insert.
            if (err?.code === '23505') {
                const [raced] = await this.db
                    .select()
                    .from(db_1.labels)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.labels.workspaceId, workspaceId), (0, drizzle_orm_1.sql) `lower(${db_1.labels.name}) = lower(${name})`))
                    .limit(1);
                if (raced)
                    return raced;
            }
            throw err;
        }
    }
    async update(labelId, data) {
        const [row] = await this.db
            .update(db_1.labels)
            .set({ ...(data.name ? { name: data.name.trim() } : {}), ...(data.color ? { color: data.color } : {}) })
            .where((0, drizzle_orm_1.eq)(db_1.labels.id, labelId))
            .returning();
        if (!row)
            throw new common_1.NotFoundException('Label not found');
        return row;
    }
    async delete(labelId) {
        const [row] = await this.db.delete(db_1.labels).where((0, drizzle_orm_1.eq)(db_1.labels.id, labelId)).returning();
        if (!row)
            throw new common_1.NotFoundException('Label not found');
        return { ok: true };
    }
};
exports.LabelsService = LabelsService;
exports.LabelsService = LabelsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], LabelsService);
//# sourceMappingURL=labels.service.js.map