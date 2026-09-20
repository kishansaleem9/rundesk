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
exports.FoldersService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const security_service_1 = require("../security/security.service");
const item_visibility_1 = require("../../common/permissions/item-visibility");
const container_access_1 = require("../../common/permissions/container-access");
let FoldersService = class FoldersService {
    constructor(db, security) {
        this.db = db;
        this.security = security;
    }
    async listBySpace(spaceId, actor) {
        // §2 per-item privacy: hide private folders the actor may not see.
        let visFilter;
        if (actor) {
            const [ctx] = await this.db
                .select({ workspaceId: db_1.spaces.workspaceId })
                .from(db_1.spaces)
                .where((0, drizzle_orm_1.eq)(db_1.spaces.id, spaceId))
                .limit(1);
            if (ctx) {
                const isManager = await (0, item_visibility_1.resolveIsManager)(this.db, ctx.workspaceId, actor.id, actor.role);
                visFilter = (0, item_visibility_1.folderVisibilityFilter)(actor.id, isManager);
            }
        }
        return this.db
            .select()
            .from(db_1.folders)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.folders.spaceId, spaceId), (0, drizzle_orm_1.eq)(db_1.folders.isArchived, false), visFilter))
            .orderBy((0, drizzle_orm_1.asc)(db_1.folders.position), (0, drizzle_orm_1.asc)(db_1.folders.name));
    }
    async create(spaceId, data, actorId) {
        const [row] = await this.db
            .insert(db_1.folders)
            .values({
            spaceId,
            name: data.name,
            color: data.color || '#354fb0',
            createdById: actorId ?? null,
        })
            .returning();
        return row;
    }
    async update(spaceId, folderId, patch) {
        if (patch.visibility !== undefined && patch.visibility !== 'public' && patch.visibility !== 'private') {
            throw new common_1.BadRequestException('visibility must be public or private');
        }
        const set = { updatedAt: new Date() };
        if (patch.name !== undefined)
            set.name = patch.name;
        if (patch.color !== undefined)
            set.color = patch.color;
        if (patch.position !== undefined)
            set.position = patch.position;
        if (patch.visibility !== undefined)
            set.visibility = patch.visibility;
        const [row] = await this.db
            .update(db_1.folders)
            .set(set)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.folders.id, folderId), (0, drizzle_orm_1.eq)(db_1.folders.spaceId, spaceId)))
            .returning();
        if (!row)
            throw new common_1.NotFoundException('Folder not found');
        return row;
    }
    /**
     * Move a folder into a different space, taking its projects with it.
     *
     * `projects` carries BOTH `spaceId` and `folderId`, so moving only the folder
     * would leave its projects pointing at a space they no longer live in — they
     * would vanish from both spaces. The two are updated together.
     *
     * Cross-workspace moves are rejected: a folder must stay inside the tenant it
     * was created in.
     */
    async move(spaceId, folderId, targetSpaceId, actorId, ipAddress) {
        const [src] = await this.db
            .select({ name: db_1.folders.name, createdById: db_1.folders.createdById, workspaceId: db_1.spaces.workspaceId })
            .from(db_1.folders)
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.folders.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.folders.id, folderId), (0, drizzle_orm_1.eq)(db_1.folders.spaceId, spaceId)))
            .limit(1);
        if (!src)
            throw new common_1.NotFoundException('Folder not found');
        const [target] = await this.db
            .select({ id: db_1.spaces.id, name: db_1.spaces.name, workspaceId: db_1.spaces.workspaceId, isArchived: db_1.spaces.isArchived })
            .from(db_1.spaces)
            .where((0, drizzle_orm_1.eq)(db_1.spaces.id, targetSpaceId))
            .limit(1);
        if (!target)
            throw new common_1.NotFoundException('Target space not found');
        if (target.workspaceId !== src.workspaceId) {
            throw new common_1.BadRequestException('A folder can only be moved within its own workspace');
        }
        if (target.isArchived)
            throw new common_1.BadRequestException('Cannot move into a deleted space');
        if (targetSpaceId === spaceId)
            return { ok: true, movedProjects: 0 };
        if (actorId) {
            await (0, container_access_1.assertCanManageContainer)(this.db, {
                workspaceId: src.workspaceId,
                createdById: src.createdById,
                actorId,
                kind: 'folder',
                spaceId,
            });
        }
        const movedProjects = await this.db
            .update(db_1.projects)
            .set({ spaceId: targetSpaceId, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.projects.folderId, folderId))
            .returning({ id: db_1.projects.id });
        await this.db
            .update(db_1.folders)
            .set({ spaceId: targetSpaceId, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.folders.id, folderId));
        if (actorId) {
            await this.security.logAuditEvent({
                workspaceId: src.workspaceId,
                actorId,
                action: 'folder.moved',
                resourceType: 'folder',
                resourceId: folderId,
                description: `Moved folder "${src.name}" to space "${target.name}"`,
                ipAddress,
                metadata: { fromSpaceId: spaceId, toSpaceId: targetSpaceId, projectsMoved: movedProjects.length },
            });
        }
        return { ok: true, movedProjects: movedProjects.length };
    }
    /**
     * §13.4 — deleting a folder ARCHIVES it (soft delete) so it can be restored
     * from the workspace Trash. It used to be hard-deleted, which made a folder
     * the one container that could never be recovered.
     *
     * The folder's projects keep their `folderId`, so restoring the folder brings
     * its contents back grouped exactly as before; while the folder is archived
     * every read path treats those projects as sitting directly under the space.
     */
    async remove(spaceId, folderId, actorId, ipAddress) {
        // Resolve name + owning workspace up-front for the §13.3 audit event.
        const [ctx] = await this.db
            .select({ name: db_1.folders.name, workspaceId: db_1.spaces.workspaceId })
            .from(db_1.folders)
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.folders.spaceId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.folders.id, folderId), (0, drizzle_orm_1.eq)(db_1.folders.spaceId, spaceId)))
            .limit(1);
        if (!ctx)
            throw new common_1.NotFoundException('Folder not found');
        await this.db
            .update(db_1.folders)
            .set({ isArchived: true, archivedAt: new Date(), archivedById: actorId ?? null, updatedAt: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.folders.id, folderId), (0, drizzle_orm_1.eq)(db_1.folders.spaceId, spaceId)));
        if (actorId) {
            // §13.3 — audit the container deletion (mirrors space/project/list).
            await this.security.logAuditEvent({
                workspaceId: ctx.workspaceId,
                actorId,
                action: 'folder.deleted',
                resourceType: 'folder',
                resourceId: folderId,
                description: `Deleted folder "${ctx.name}"`,
                ipAddress,
            });
        }
        return { ok: true };
    }
};
exports.FoldersService = FoldersService;
exports.FoldersService = FoldersService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, security_service_1.SecurityService])
], FoldersService);
//# sourceMappingURL=folders.service.js.map