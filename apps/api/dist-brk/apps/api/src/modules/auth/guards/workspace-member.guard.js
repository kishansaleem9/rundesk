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
exports.WorkspaceMemberGuard = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../../common/database/database.module");
/**
 * Guard that verifies the authenticated user belongs to the workspace
 * referenced by the `:workspaceId` path parameter. Caches the membership
 * row on `request.workspaceMember` for downstream consumers.
 *
 * Use after JwtAuthGuard:
 *   @UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
 */
let WorkspaceMemberGuard = class WorkspaceMemberGuard {
    constructor(db) {
        this.db = db;
    }
    async canActivate(ctx) {
        const req = ctx.switchToHttp().getRequest();
        const user = req.user;
        const workspaceId = req.params?.workspaceId;
        if (!user?.id) {
            throw new common_1.ForbiddenException('Not authenticated');
        }
        if (!workspaceId) {
            // Routes without a workspaceId param shouldn't use this guard, but if
            // it gets attached accidentally we fail closed.
            throw new common_1.ForbiddenException('Workspace context required');
        }
        // Super admins can access any workspace.
        if (user.role === 'super_admin') {
            // Still confirm the workspace exists so 404 is honest.
            const [ws] = await this.db
                .select({ id: db_1.workspaces.id })
                .from(db_1.workspaces)
                .where((0, drizzle_orm_1.eq)(db_1.workspaces.id, workspaceId))
                .limit(1);
            if (!ws)
                throw new common_1.NotFoundException('Workspace not found');
            req.workspaceMember = { userId: user.id, workspaceId, role: 'super_admin' };
            return true;
        }
        const [member] = await this.db
            .select()
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, user.id)))
            .limit(1);
        if (!member) {
            // Treat as 404 — disabled features should not appear to exist.
            throw new common_1.NotFoundException('Workspace not found');
        }
        req.workspaceMember = member;
        return true;
    }
};
exports.WorkspaceMemberGuard = WorkspaceMemberGuard;
exports.WorkspaceMemberGuard = WorkspaceMemberGuard = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], WorkspaceMemberGuard);
//# sourceMappingURL=workspace-member.guard.js.map