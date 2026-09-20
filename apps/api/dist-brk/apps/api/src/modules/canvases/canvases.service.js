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
exports.CanvasesService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const realtime_gateway_1 = require("../realtime/realtime.gateway");
let CanvasesService = class CanvasesService {
    constructor(db, realtime) {
        this.db = db;
        this.realtime = realtime;
    }
    async list(workspaceId, type) {
        if (type && !this.isSupportedType(type))
            throw new common_1.BadRequestException('Unsupported canvas type');
        const base = this.db.select().from(db_1.workspaceCanvases);
        const rows = type
            ? await base.where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceCanvases.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceCanvases.type, type))).orderBy((0, drizzle_orm_1.desc)(db_1.workspaceCanvases.updatedAt))
            : await base.where((0, drizzle_orm_1.eq)(db_1.workspaceCanvases.workspaceId, workspaceId)).orderBy((0, drizzle_orm_1.desc)(db_1.workspaceCanvases.updatedAt));
        return rows;
    }
    async create(workspaceId, userId, body) {
        if (!this.isSupportedType(body.type))
            throw new common_1.BadRequestException('Unsupported canvas type');
        const [row] = await this.db
            .insert(db_1.workspaceCanvases)
            .values({
            workspaceId,
            type: body.type,
            title: body.title,
            data: (body.data ?? {}),
            createdById: userId,
        })
            .returning();
        this.realtime.emitToWorkspace(workspaceId, {
            type: 'canvas.created',
            workspaceId,
            canvas: row,
            actorId: userId,
        });
        return row;
    }
    async get(workspaceId, canvasId) {
        const [row] = await this.db
            .select()
            .from(db_1.workspaceCanvases)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceCanvases.id, canvasId), (0, drizzle_orm_1.eq)(db_1.workspaceCanvases.workspaceId, workspaceId)))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException('Canvas not found');
        return row;
    }
    async update(workspaceId, canvasId, actorId, body) {
        if (body.type && !this.isSupportedType(body.type))
            throw new common_1.BadRequestException('Unsupported canvas type');
        if (body.expectedUpdatedAt) {
            const [current] = await this.db
                .select({ updatedAt: db_1.workspaceCanvases.updatedAt })
                .from(db_1.workspaceCanvases)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceCanvases.id, canvasId), (0, drizzle_orm_1.eq)(db_1.workspaceCanvases.workspaceId, workspaceId)))
                .limit(1);
            if (!current)
                throw new common_1.NotFoundException('Canvas not found');
            const expected = new Date(body.expectedUpdatedAt).getTime();
            const actual = current.updatedAt ? new Date(current.updatedAt).getTime() : NaN;
            if (!Number.isFinite(expected) || expected !== actual) {
                throw new common_1.ConflictException('Canvas was updated by someone else. Please refresh and try again.');
            }
        }
        const [row] = await this.db
            .update(db_1.workspaceCanvases)
            .set({
            title: body.title,
            data: body.data,
            type: body.type,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceCanvases.id, canvasId), (0, drizzle_orm_1.eq)(db_1.workspaceCanvases.workspaceId, workspaceId)))
            .returning();
        if (!row)
            throw new common_1.NotFoundException('Canvas not found');
        this.realtime.emitToWorkspace(workspaceId, {
            type: 'canvas.updated',
            workspaceId,
            canvasId,
            patch: {
                title: row.title,
                type: row.type,
                data: row.data,
                updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
            },
            actorId,
        });
        return row;
    }
    async remove(workspaceId, canvasId, actorId) {
        await this.db
            .delete(db_1.workspaceCanvases)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceCanvases.id, canvasId), (0, drizzle_orm_1.eq)(db_1.workspaceCanvases.workspaceId, workspaceId)));
        this.realtime.emitToWorkspace(workspaceId, {
            type: 'canvas.deleted',
            workspaceId,
            canvasId,
            actorId,
        });
        return { ok: true };
    }
    isSupportedType(type) {
        return type === 'whiteboard' || type === 'mindmap';
    }
};
exports.CanvasesService = CanvasesService;
exports.CanvasesService = CanvasesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, realtime_gateway_1.RealtimeGateway])
], CanvasesService);
//# sourceMappingURL=canvases.service.js.map