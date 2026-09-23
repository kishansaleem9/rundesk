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
import { isManagerRole } from '../../../common/permissions/item-visibility'

/**
 * Workspace-admin or super-admin only. Apply AFTER JwtAuthGuard.
 * Use this in place of WorkspaceMemberGuard for endpoints that mutate
 * workspace-level resources (members, integrations, webhooks, API keys,
 * feature flags, audit log access, etc.).
 */
@Injectable()
export class WorkspaceAdminGuard implements CanActivate {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest()
    const user = req.user
    const workspaceId: string | undefined = req.params?.workspaceId

    if (!user?.id) throw new ForbiddenException('Not authenticated')
    if (!workspaceId) throw new ForbiddenException('Workspace context required')

    if (user.role === 'super_admin') {
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

    if (!member) throw new NotFoundException('Workspace not found')
    if (!isManagerRole(member.role)) {
      throw new ForbiddenException('Workspace admin or manager role required')
    }

    req.workspaceMember = member
    return true
  }
}
