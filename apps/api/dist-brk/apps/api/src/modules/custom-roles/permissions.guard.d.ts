import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CustomRolesService } from './custom-roles.service';
import type { Permission } from './permission-catalog';
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
export declare const RequirePermissions: (...permissions: [Permission, ...Permission[]] | [{
    any?: boolean;
    all: Permission[];
}]) => import("@nestjs/common").CustomDecorator<string>;
export declare class PermissionsGuard implements CanActivate {
    private readonly reflector;
    private readonly roles;
    constructor(reflector: Reflector, roles: CustomRolesService);
    canActivate(ctx: ExecutionContext): Promise<boolean>;
    private normalise;
}
