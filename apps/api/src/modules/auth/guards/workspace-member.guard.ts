import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { workspaceMembers, workspaces } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../../common/database/database.module'

/**
 * Guard that verifies the authenticated user belongs to the workspace
 * referenced by the `:workspaceId` path parameter. Caches the membership
 * row on `request.workspaceMember` for downstream consumers.
 *
 * Use after JwtAuthGuard:
 *   @UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
 */
@Injectable()
export class WorkspaceMemberGuard implements CanActivate {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest()
    const user = req.user
    const workspaceId: string | undefined = req.params?.workspaceId

    if (!user?.id) {
      throw new ForbiddenException('Not authenticated')
    }
    if (!workspaceId) {
      // Routes without a workspaceId param shouldn't use this guard, but if
      // it gets attached accidentally we fail closed.
      throw new ForbiddenException('Workspace context required')
    }

    // Super admins can access any workspace.
    if (user.role === 'super_admin') {
      // Still confirm the workspace exists so 404 is honest.
      const [ws] = await this.db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1)
      if (!ws) throw new NotFoundException('Workspace not found')
      req.workspaceMember = { userId: user.id, workspaceId, role: 'super_admin' }
      return true
    }

    const [member] = await this.db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, user.id),
        ),
      )
      .limit(1)

    if (!member) {
      // Treat as 404 — disabled features should not appear to exist.
      throw new NotFoundException('Workspace not found')
    }

    req.workspaceMember = member
    return true
  }
}
