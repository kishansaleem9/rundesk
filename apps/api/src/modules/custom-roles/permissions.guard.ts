import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { CustomRolesService } from './custom-roles.service'
import type { Permission } from './permission-catalog'

const PERMISSIONS_KEY = 'rundesk.required_permissions'

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
export const RequirePermissions = (
  ...permissions: [Permission, ...Permission[]] | [{ any?: boolean; all: Permission[] }]
) => SetMetadata(PERMISSIONS_KEY, permissions)

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly roles: CustomRolesService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<unknown>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ])
    if (!required) return true

    const { permissions, mode } = this.normalise(required)
    if (permissions.length === 0) return true

    const req = ctx.switchToHttp().getRequest()
    const user = req.user
    const workspaceId: string | undefined =
      req.params?.workspaceId ?? req.workspaceMember?.workspaceId ?? req.body?.workspaceId

    if (!user?.id) throw new ForbiddenException('Not authenticated')
    if (!workspaceId) throw new ForbiddenException('Workspace context required')

    // Super admins bypass — they're a global break-glass role and always
    // have every permission by definition.
    if (user.role === 'super_admin') return true

    const resolution = await this.roles.resolveForUser(workspaceId, user.id)
    if (!resolution) throw new ForbiddenException('Not a workspace member')

    const granted = new Set(resolution.permissions)
    const ok = mode === 'any'
      ? permissions.some((p) => granted.has(p))
      : permissions.every((p) => granted.has(p))

    if (!ok) {
      throw new ForbiddenException(
        mode === 'any'
          ? `Missing required permission (any of: ${permissions.join(', ')})`
          : `Missing required permission${permissions.length > 1 ? 's' : ''}: ${permissions.join(', ')}`,
      )
    }

    req.permissionResolution = resolution
    return true
  }

  private normalise(value: unknown): { permissions: Permission[]; mode: 'all' | 'any' } {
    if (!Array.isArray(value)) return { permissions: [], mode: 'all' }
    const first = value[0]
    if (
      value.length === 1 &&
      typeof first === 'object' &&
      first !== null &&
      ('all' in first || 'any' in first)
    ) {
      const cfg = first as { any?: boolean; all?: Permission[] }
      return {
        permissions: (cfg.all ?? []).filter((p): p is Permission => typeof p === 'string'),
        mode: cfg.any ? 'any' : 'all',
      }
    }
    return {
      permissions: value.filter((p): p is Permission => typeof p === 'string'),
      mode: 'all',
    }
  }
}
