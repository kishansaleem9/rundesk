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
exports.ContainerMembersService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const CONTAINER_ROLES = ['admin', 'edit', 'comment', 'view'];
const WS_MANAGE_ROLES = ['workspace_admin', 'manager', 'super_admin'];
function assertRole(role) {
    if (!CONTAINER_ROLES.includes(role))
        throw new common_1.BadRequestException('Invalid role');
}
let ContainerMembersService = class ContainerMembersService {
    constructor(db) {
        this.db = db;
    }
    async isWorkspaceManager(workspaceId, userId) {
        const [wm] = await this.db
            .select({ role: db_1.workspaceMembers.role })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId)))
            .limit(1);
        return !!wm && WS_MANAGE_ROLES.includes(wm.role);
    }
    // ── Spaces ─────────────────────────────────────────────────────────────────
    async spaceCtx(spaceId) {
        const [row] = await this.db
            .select({ workspaceId: db_1.spaces.workspaceId, visibility: db_1.spaces.visibility })
            .from(db_1.spaces)
            .where((0, drizzle_orm_1.eq)(db_1.spaces.id, spaceId))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException('Space not found');
        return row;
    }
    async assertCanManageSpace(spaceId, actorId) {
        const [sm] = await this.db
            .select({ role: db_1.spaceMembers.role })
            .from(db_1.spaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaceMembers.spaceId, spaceId), (0, drizzle_orm_1.eq)(db_1.spaceMembers.userId, actorId)))
            .limit(1);
        if (sm?.role === 'admin')
            return;
        const ctx = await this.spaceCtx(spaceId);
        if (await this.isWorkspaceManager(ctx.workspaceId, actorId))
            return;
        throw new common_1.ForbiddenException('Only a space admin or workspace manager can manage this space');
    }
    async listSpaceMembers(spaceId) {
        await this.spaceCtx(spaceId);
        return this.db
            .select({
            userId: db_1.spaceMembers.userId,
            role: db_1.spaceMembers.role,
            email: db_1.users.email,
            displayName: db_1.users.displayName,
            avatarUrl: db_1.users.avatarUrl,
        })
            .from(db_1.spaceMembers)
            .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.spaceMembers.userId))
            .where((0, drizzle_orm_1.eq)(db_1.spaceMembers.spaceId, spaceId));
    }
    async addSpaceMember(spaceId, actorId, userId, role = 'edit') {
        assertRole(role);
        await this.assertCanManageSpace(spaceId, actorId);
        await this.db
            .insert(db_1.spaceMembers)
            .values({ spaceId, userId, role, addedById: actorId })
            .onConflictDoNothing();
        return { ok: true };
    }
    async updateSpaceMemberRole(spaceId, actorId, userId, role) {
        assertRole(role);
        await this.assertCanManageSpace(spaceId, actorId);
        const [row] = await this.db
            .update(db_1.spaceMembers)
            .set({ role, updatedAt: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaceMembers.spaceId, spaceId), (0, drizzle_orm_1.eq)(db_1.spaceMembers.userId, userId)))
            .returning();
        if (!row)
            throw new common_1.NotFoundException('Member not found');
        return row;
    }
    async removeSpaceMember(spaceId, actorId, userId) {
        await this.assertCanManageSpace(spaceId, actorId);
        await this.db
            .delete(db_1.spaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaceMembers.spaceId, spaceId), (0, drizzle_orm_1.eq)(db_1.spaceMembers.userId, userId)));
        return { ok: true };
    }
    async setSpaceVisibility(spaceId, actorId, visibility) {
        if (visibility !== 'public' && visibility !== 'private') {
            throw new common_1.BadRequestException('visibility must be public or private');
        }
        await this.assertCanManageSpace(spaceId, actorId);
        const [row] = await this.db
            .update(db_1.spaces)
            .set({ visibility, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.spaces.id, spaceId))
            .returning();
        return row;
    }
    // ── Projects ───────────────────────────────────────────────────────────────
    async projectCtx(projectId) {
        const [row] = await this.db
            .select({ workspaceId: db_1.spaces.workspaceId, spaceId: db_1.projects.spaceId })
            .from(db_1.projects)
            .innerJoin(db_1.spaces, (0, drizzle_orm_1.eq)(db_1.spaces.id, db_1.projects.spaceId))
            .where((0, drizzle_orm_1.eq)(db_1.projects.id, projectId))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException('Project not found');
        return row;
    }
    async assertCanManageProject(projectId, actorId) {
        const [pm] = await this.db
            .select({ role: db_1.projectMembers.role })
            .from(db_1.projectMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.projectMembers.projectId, projectId), (0, drizzle_orm_1.eq)(db_1.projectMembers.userId, actorId)))
            .limit(1);
        if (pm?.role === 'admin')
            return;
        const ctx = await this.projectCtx(projectId);
        // A space admin (of the owning space) can manage its projects too.
        const [sm] = await this.db
            .select({ role: db_1.spaceMembers.role })
            .from(db_1.spaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.spaceMembers.spaceId, ctx.spaceId), (0, drizzle_orm_1.eq)(db_1.spaceMembers.userId, actorId)))
            .limit(1);
        if (sm?.role === 'admin')
            return;
        if (await this.isWorkspaceManager(ctx.workspaceId, actorId))
            return;
        throw new common_1.ForbiddenException('Only a project/space admin or workspace manager can manage this project');
    }
    async listProjectMembers(projectId) {
        await this.projectCtx(projectId);
        return this.db
            .select({
            userId: db_1.projectMembers.userId,
            role: db_1.projectMembers.role,
            email: db_1.users.email,
            displayName: db_1.users.displayName,
            avatarUrl: db_1.users.avatarUrl,
        })
            .from(db_1.projectMembers)
            .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.projectMembers.userId))
            .where((0, drizzle_orm_1.eq)(db_1.projectMembers.projectId, projectId));
    }
    async addProjectMember(projectId, actorId, userId, role = 'edit') {
        assertRole(role);
        await this.assertCanManageProject(projectId, actorId);
        await this.db
            .insert(db_1.projectMembers)
            .values({ projectId, userId, role, addedById: actorId })
            .onConflictDoNothing();
        return { ok: true };
    }
    async updateProjectMemberRole(projectId, actorId, userId, role) {
        assertRole(role);
        await this.assertCanManageProject(projectId, actorId);
        const [row] = await this.db
            .update(db_1.projectMembers)
            .set({ role, updatedAt: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.projectMembers.projectId, projectId), (0, drizzle_orm_1.eq)(db_1.projectMembers.userId, userId)))
            .returning();
        if (!row)
            throw new common_1.NotFoundException('Member not found');
        return row;
    }
    async removeProjectMember(projectId, actorId, userId) {
        await this.assertCanManageProject(projectId, actorId);
        await this.db
            .delete(db_1.projectMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.projectMembers.projectId, projectId), (0, drizzle_orm_1.eq)(db_1.projectMembers.userId, userId)));
        return { ok: true };
    }
    async setProjectVisibility(projectId, actorId, visibility) {
        if (visibility !== null && visibility !== 'public' && visibility !== 'private') {
            throw new common_1.BadRequestException('visibility must be public, private or null (inherit)');
        }
        await this.assertCanManageProject(projectId, actorId);
        const [row] = await this.db
            .update(db_1.projects)
            .set({ visibility, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.projects.id, projectId))
            .returning();
        return row;
    }
};
exports.ContainerMembersService = ContainerMembersService;
exports.ContainerMembersService = ContainerMembersService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], ContainerMembersService);
//# sourceMappingURL=container-members.service.js.map