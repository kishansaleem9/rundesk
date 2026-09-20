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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionsGuard = exports.RequirePermissions = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const custom_roles_service_1 = require("./custom-roles.service");
const PERMISSIONS_KEY = 'rundesk.required_permissions';
/**
 * Decorator that declares which permissions a route requires. Apply
 * alongside `JwtAuthGuard` (and typically `WorkspaceMemberGuard`).
 * Multiple permissions are AND'd by default; pass `{ any: true }`
 * to OR them.
 *
 * @example
 *   @UseGuards(JwtAuthGuard, WorkspaceMemberGuard, PermissionsGuard)
 *   @RequirePermissions('integrations.manage')
 *   delete(...) { ... }
 */
const RequirePermissions = (...permissions) => (0, common_1.SetMetadata)(PERMISSIONS_KEY, permissions);
exports.RequirePermissions = RequirePermissions;
let PermissionsGuard = class PermissionsGuard {
    constructor(reflector, roles) {
        this.reflector = reflector;
        this.roles = roles;
    }
    async canActivate(ctx) {
        const required = this.reflector.getAllAndOverride(PERMISSIONS_KEY, [
            ctx.getHandler(),
            ctx.getClass(),
        ]);
        if (!required)
            return true;
        const { permissions, mode } = this.normalise(required);
        if (permissions.length === 0)
            return true;
        const req = ctx.switchToHttp().getRequest();
        const user = req.user;
        if (!user?.id)
            throw new common_1.ForbiddenException('Not authenticated');
        // Super admins bypass — a global break-glass role with every permission by
        // definition, regardless of (and without needing) workspace context. This
        // MUST run before the workspaceId requirement below: on routes where the
        // workspace is only derivable by ResourceMemberGuard (e.g. POST /projects
        // carries just `spaceId`), that guard short-circuits for super_admin without
        // populating `req.workspaceMember`, so `workspaceId` would be undefined here
        // and a super-admin would be wrongly 403'd on a core action.
        if (user.role === 'super_admin')
            return true;
        const workspaceId = req.params?.workspaceId ?? req.workspaceMember?.workspaceId ?? req.body?.workspaceId;
        if (!workspaceId)
            throw new common_1.ForbiddenException('Workspace context required');
        const resolution = await this.roles.resolveForUser(workspaceId, user.id);
        if (!resolution)
            throw new common_1.ForbiddenException('Not a workspace member');
        const granted = new Set(resolution.permissions);
        const ok = mode === 'any'
            ? permissions.some((p) => granted.has(p))
            : permissions.every((p) => granted.has(p));
        if (!ok) {
            throw new common_1.ForbiddenException(mode === 'any'
                ? `Missing required permission (any of: ${permissions.join(', ')})`
                : `Missing required permission${permissions.length > 1 ? 's' : ''}: ${permissions.join(', ')}`);
        }
        req.permissionResolution = resolution;
        return true;
    }
    normalise(value) {
        if (!Array.isArray(value))
            return { permissions: [], mode: 'all' };
        const first = value[0];
        if (value.length === 1 &&
            typeof first === 'object' &&
            first !== null &&
            ('all' in first || 'any' in first)) {
            const cfg = first;
            return {
                permissions: (cfg.all ?? []).filter((p) => typeof p === 'string'),
                mode: cfg.any ? 'any' : 'all',
            };
        }
        return {
            permissions: value.filter((p) => typeof p === 'string'),
            mode: 'all',
        };
    }
};
exports.PermissionsGuard = PermissionsGuard;
exports.PermissionsGuard = PermissionsGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector,
        custom_roles_service_1.CustomRolesService])
], PermissionsGuard);
//# sourceMappingURL=permissions.guard.js.map