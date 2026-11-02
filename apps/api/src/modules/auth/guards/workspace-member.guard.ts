import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { and, eq } from 'drizzle-orm'
import { workspaceMembers, workspaces } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../../common/database/database.module'
import { ALLOW_ARCHIVED_WORKSPACE } from '../../../common/decorators/allow-archived-workspace.decorator'

/**
 * Guard that verifies the authenticated user belongs to the workspace
 * referenced by the `:workspaceId` path parameter. Caches the membership
 * row on `request.workspaceMember` for downstream consumers.
 *
 * Use after JwtAuthGuard:
 *   @UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
 *
 * AN ARCHIVED WORKSPACE IS NOT FOUND BY ITS MEMBERS
 * (`found-02-nov/archived-workspace-still-opens`): archiving is Settings ›
 * General's "Delete Workspace", and its members lose it at once (QA WS-018),
 * where they kept opening it by its address. Only a route marked
 * `@AllowArchivedWorkspace()` — restoring it, deleting it for good — answers
 * them. A platform admin, who runs the platform rather than belonging to it,
 * still reaches it, as they reach any workspace.
 */
@Injectable()
export class WorkspaceMemberGuard implements CanActivate {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly reflector: Reflector,
  ) {}

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

    const [row] = await this.db
      .select({ member: workspaceMembers, isArchived: workspaces.isArchived })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, user.id),
        ),
      )
      .limit(1)

    const archivedAllowed = () =>
      this.reflector.getAllAndOverride<boolean>(ALLOW_ARCHIVED_WORKSPACE, [ctx.getHandler(), ctx.getClass()]) === true
    if (!row || (row.isArchived && !archivedAllowed())) {
      // Treat as 404 — disabled features should not appear to exist.
      throw new NotFoundException('Workspace not found')
    }

    req.workspaceMember = row.member
    return true
  }
}
