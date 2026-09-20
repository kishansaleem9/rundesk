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
exports.AnnouncementsService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const security_service_1 = require("../security/security.service");
let AnnouncementsService = class AnnouncementsService {
    constructor(db, security) {
        this.db = db;
        this.security = security;
    }
    async list(workspaceId) {
        return this.db
            .select()
            .from(db_1.announcements)
            .where((0, drizzle_orm_1.eq)(db_1.announcements.workspaceId, workspaceId))
            .orderBy((0, drizzle_orm_1.desc)(db_1.announcements.createdAt));
    }
    async listActive(workspaceId, userId) {
        const now = new Date();
        const rows = await this.db
            .select()
            .from(db_1.announcements)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.announcements.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.announcements.isActive, true), (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(db_1.announcements.expiresAt), (0, drizzle_orm_1.gt)(db_1.announcements.expiresAt, now))))
            .orderBy((0, drizzle_orm_1.desc)(db_1.announcements.createdAt));
        const dismissed = await this.db
            .select({ announcementId: db_1.announcementDismissals.announcementId })
            .from(db_1.announcementDismissals)
            .where((0, drizzle_orm_1.eq)(db_1.announcementDismissals.userId, userId));
        const dismissedSet = new Set(dismissed.map((d) => d.announcementId));
        return rows.filter((row) => !dismissedSet.has(row.id));
    }
    async create(workspaceId, userId, input) {
        const [created] = await this.db
            .insert(db_1.announcements)
            .values({
            workspaceId,
            createdById: userId,
            title: input.title.trim(),
            body: input.body?.trim() ?? '',
            tone: input.tone ?? 'info',
            isActive: input.isActive ?? true,
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        })
            .returning();
        await this.security.logAuditEvent({
            workspaceId,
            actorId: userId,
            action: 'announcement.created',
            resourceType: 'announcement',
            resourceId: created.id,
            description: `Created announcement "${created.title}"`,
            metadata: { tone: created.tone, isActive: created.isActive },
        });
        return created;
    }
    async update(workspaceId, announcementId, patch, actorId) {
        const [updated] = await this.db
            .update(db_1.announcements)
            .set({
            title: patch.title?.trim(),
            body: patch.body?.trim(),
            tone: patch.tone,
            isActive: patch.isActive,
            expiresAt: patch.expiresAt === undefined ? undefined : patch.expiresAt ? new Date(patch.expiresAt) : null,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.announcements.id, announcementId), (0, drizzle_orm_1.eq)(db_1.announcements.workspaceId, workspaceId)))
            .returning();
        if (!updated)
            throw new common_1.NotFoundException('Announcement not found');
        await this.security.logAuditEvent({
            workspaceId,
            actorId,
            action: 'announcement.updated',
            resourceType: 'announcement',
            resourceId: announcementId,
            description: `Updated announcement "${updated.title}"`,
            metadata: {
                title: patch.title ?? null,
                tone: patch.tone ?? null,
                isActive: patch.isActive ?? null,
            },
        });
        return updated;
    }
    async remove(workspaceId, announcementId, actorId) {
        const [deleted] = await this.db
            .delete(db_1.announcements)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.announcements.id, announcementId), (0, drizzle_orm_1.eq)(db_1.announcements.workspaceId, workspaceId)))
            .returning({ id: db_1.announcements.id, title: db_1.announcements.title });
        if (!deleted)
            throw new common_1.NotFoundException('Announcement not found');
        await this.security.logAuditEvent({
            workspaceId,
            actorId,
            action: 'announcement.removed',
            resourceType: 'announcement',
            resourceId: announcementId,
            description: `Removed announcement "${deleted.title}"`,
        });
        return { ok: true };
    }
    async trackView(workspaceId, announcementId) {
        const [existing] = await this.db
            .select()
            .from(db_1.announcements)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.announcements.id, announcementId), (0, drizzle_orm_1.eq)(db_1.announcements.workspaceId, workspaceId)))
            .limit(1);
        if (!existing)
            throw new common_1.NotFoundException('Announcement not found');
        const [updated] = await this.db
            .update(db_1.announcements)
            .set({ views: (existing.views ?? 0) + 1, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.announcements.id, announcementId))
            .returning();
        return updated;
    }
    async dismiss(workspaceId, announcementId, userId) {
        const [existing] = await this.db
            .select()
            .from(db_1.announcements)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.announcements.id, announcementId), (0, drizzle_orm_1.eq)(db_1.announcements.workspaceId, workspaceId)))
            .limit(1);
        if (!existing)
            throw new common_1.NotFoundException('Announcement not found');
        const [alreadyDismissed] = await this.db
            .select({ id: db_1.announcementDismissals.id })
            .from(db_1.announcementDismissals)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.announcementDismissals.announcementId, announcementId), (0, drizzle_orm_1.eq)(db_1.announcementDismissals.userId, userId)))
            .limit(1);
        if (!alreadyDismissed) {
            await this.db.insert(db_1.announcementDismissals).values({ announcementId, userId });
        }
        const [updated] = await this.db
            .update(db_1.announcements)
            .set({
            dismisses: (existing.dismisses ?? 0) + (alreadyDismissed ? 0 : 1),
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(db_1.announcements.id, announcementId))
            .returning();
        return updated;
    }
};
exports.AnnouncementsService = AnnouncementsService;
exports.AnnouncementsService = AnnouncementsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, security_service_1.SecurityService])
], AnnouncementsService);
//# sourceMappingURL=announcements.service.js.map