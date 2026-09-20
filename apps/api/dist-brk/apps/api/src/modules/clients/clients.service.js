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
exports.ClientsService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
let ClientsService = class ClientsService {
    constructor(db) {
        this.db = db;
    }
    list(workspaceId) {
        return this.db
            .select({
            id: db_1.clients.id,
            name: db_1.clients.name,
            contactEmail: db_1.clients.contactEmail,
            createdById: db_1.clients.createdById,
            createdAt: db_1.clients.createdAt,
        })
            .from(db_1.clients)
            .where((0, drizzle_orm_1.eq)(db_1.clients.workspaceId, workspaceId))
            .orderBy((0, drizzle_orm_1.asc)(db_1.clients.name));
    }
    async create(workspaceId, name, contactEmail, createdById) {
        // Reject a non-string name up front — `.trim()` on a number/object threw and
        // surfaced as a 500 instead of a 400.
        if (typeof name !== 'string' || !name.trim())
            throw new common_1.BadRequestException('Client name is required');
        const trimmed = name.trim();
        const email = typeof contactEmail === 'string' ? contactEmail.trim() || null : null;
        const [row] = await this.db
            .insert(db_1.clients)
            .values({ workspaceId, name: trimmed, contactEmail: email, createdById })
            .onConflictDoNothing()
            .returning();
        if (!row)
            throw new common_1.BadRequestException('A client with that name already exists');
        return row;
    }
    async remove(clientId, workspaceId) {
        await this.db.delete(db_1.clients).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.clients.id, clientId), (0, drizzle_orm_1.eq)(db_1.clients.workspaceId, workspaceId)));
        return { ok: true };
    }
};
exports.ClientsService = ClientsService;
exports.ClientsService = ClientsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], ClientsService);
//# sourceMappingURL=clients.service.js.map