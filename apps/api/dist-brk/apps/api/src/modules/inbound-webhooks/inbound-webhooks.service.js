"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InboundWebhooksService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const crypto = __importStar(require("crypto"));
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const tasks_service_1 = require("../tasks/tasks.service");
const PRIORITIES = new Set(['urgent', 'high', 'normal', 'low']);
let InboundWebhooksService = class InboundWebhooksService {
    constructor(db, tasks) {
        this.db = db;
        this.tasks = tasks;
    }
    listForList(listId) {
        return this.db
            .select()
            .from(db_1.inboundWebhooks)
            .where((0, drizzle_orm_1.eq)(db_1.inboundWebhooks.listId, listId))
            .orderBy((0, drizzle_orm_1.asc)(db_1.inboundWebhooks.createdAt));
    }
    async create(listId, name, createdById) {
        const token = crypto.randomBytes(24).toString('hex');
        const [row] = await this.db
            .insert(db_1.inboundWebhooks)
            .values({ listId, name: name?.trim() || 'Inbound webhook', token, createdById })
            .returning();
        return row;
    }
    async remove(id, listId) {
        await this.db.delete(db_1.inboundWebhooks).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.inboundWebhooks.id, id), (0, drizzle_orm_1.eq)(db_1.inboundWebhooks.listId, listId)));
        return { ok: true };
    }
    /**
     * Receive an external POST and create a task in the token's list (Plan §12).
     * Accepts { title (required), description?, priority?, dueDate? }.
     */
    async receive(token, payload) {
        const [hook] = await this.db.select().from(db_1.inboundWebhooks).where((0, drizzle_orm_1.eq)(db_1.inboundWebhooks.token, token)).limit(1);
        if (!hook || !hook.isEnabled)
            throw new common_1.NotFoundException('Webhook not found');
        const title = (payload?.title ?? '').trim();
        if (!title)
            throw new common_1.BadRequestException('title is required');
        const priority = payload?.priority && PRIORITIES.has(payload.priority) ? payload.priority : undefined;
        let dueDate;
        if (payload?.dueDate) {
            const d = new Date(payload.dueDate);
            if (!Number.isNaN(d.getTime()))
                dueDate = d;
        }
        if (!hook.createdById)
            throw new common_1.BadRequestException('Webhook has no owning user');
        const task = await this.tasks.createTask({
            listId: hook.listId,
            title,
            description: payload?.description,
            priority,
            dueDate,
            createdById: hook.createdById,
        });
        return { ok: true, taskId: task?.id };
    }
};
exports.InboundWebhooksService = InboundWebhooksService;
exports.InboundWebhooksService = InboundWebhooksService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, tasks_service_1.TasksService])
], InboundWebhooksService);
//# sourceMappingURL=inbound-webhooks.service.js.map