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
exports.ClipsService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const r2_service_1 = require("../../common/storage/r2.service");
const database_module_1 = require("../../common/database/database.module");
const email_service_1 = require("../email/email.service");
let ClipsService = class ClipsService {
    constructor(r2, email, db) {
        this.r2 = r2;
        this.email = email;
        this.db = db;
    }
    sanitizeFileName(input) {
        return input.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'clip.webm';
    }
    clipPrefix(workspaceId) {
        return `workspaces/${workspaceId}/clips/`;
    }
    async createUploadUrl(workspaceId, actorEmail, body) {
        if (!this.r2.configured)
            throw new common_1.BadRequestException('R2 is not configured');
        const fileName = this.sanitizeFileName(body.fileName);
        const key = `${this.clipPrefix(workspaceId)}${Date.now()}-${fileName}`;
        const uploadUrl = await this.r2.presignPutObject(key, body.contentType || 'video/webm', {
            title: (body.title ?? fileName).slice(0, 120),
            durationseconds: String(body.durationSeconds ?? 0),
            recordedby: actorEmail,
        });
        return { uploadUrl, storageKey: key };
    }
    async list(workspaceId) {
        if (!this.r2.configured)
            return [];
        const prefix = this.clipPrefix(workspaceId);
        const listed = await this.r2.listObjects(prefix, 200);
        const objects = (listed.Contents ?? []).filter((o) => !!o.Key);
        const results = await Promise.all(objects.map(async (obj) => {
            const key = obj.Key;
            const head = await this.r2.headObject(key);
            const fileName = key.split('/').pop() ?? 'clip.webm';
            const title = head.Metadata?.title ?? fileName;
            const durationSeconds = Number(head.Metadata?.durationseconds ?? 0);
            const recordedBy = head.Metadata?.recordedby ?? 'teammate';
            const url = await this.r2.getObjectUrl(key);
            return {
                id: key,
                storageKey: key,
                title,
                fileName,
                durationSeconds,
                recordedBy,
                sizeBytes: obj.Size ?? 0,
                createdAt: obj.LastModified?.toISOString() ?? null,
                url,
            };
        }));
        return results.sort((a, b) => {
            const left = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const right = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return right - left;
        });
    }
    async remove(workspaceId, storageKey) {
        // A missing/non-string storageKey threw on `.startsWith()` → 500. Validate
        // the type so a malformed body yields a 400.
        if (typeof storageKey !== 'string' || !storageKey.startsWith(this.clipPrefix(workspaceId))) {
            throw new common_1.BadRequestException('Invalid clip key for workspace');
        }
        await this.r2.deleteObject(storageKey);
        return { ok: true };
    }
    async share(workspaceId, actorId, actorEmail, body) {
        if (typeof body.storageKey !== 'string' || !body.storageKey.startsWith(this.clipPrefix(workspaceId))) {
            throw new common_1.BadRequestException('Invalid clip key for workspace');
        }
        const expiresInSeconds = Math.max(60, Math.min(7 * 24 * 60 * 60, (body.expiresInMinutes ?? 60) * 60));
        const shareUrl = await this.r2.getObjectUrl(body.storageKey, expiresInSeconds);
        const clipName = body.storageKey.split('/').pop() ?? 'clip.webm';
        if (body.mode === 'public')
            return { shareUrl };
        let recipientEmail = body.email?.trim();
        if (body.mode === 'member') {
            if (!body.userId)
                throw new common_1.BadRequestException('userId is required');
            const [member] = await this.db
                .select({ email: db_1.users.email })
                .from(db_1.workspaceMembers)
                .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.workspaceMembers.userId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, body.userId)))
                .limit(1);
            if (!member)
                throw new common_1.NotFoundException('Member not found in workspace');
            recipientEmail = member.email;
        }
        if (!recipientEmail)
            throw new common_1.BadRequestException('email is required');
        await this.email.sendClipSharedEmail({
            to: recipientEmail,
            actorEmail,
            clipName,
            clipUrl: shareUrl,
            expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
        });
        return { shareUrl, sentTo: recipientEmail };
    }
};
exports.ClipsService = ClipsService;
exports.ClipsService = ClipsService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [r2_service_1.R2Service,
        email_service_1.EmailService, Object])
], ClipsService);
//# sourceMappingURL=clips.service.js.map