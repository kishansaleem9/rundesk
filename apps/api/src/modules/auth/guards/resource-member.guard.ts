import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { spaces, projects, lists, tasks, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../../common/database/database.module'

/**
 * Enforces workspace membership for resources nested under a space / project /
 * list / task (which don't carry a `workspaceId` param). Apply AFTER
 * JwtAuthGuard on controllers/routes that read or create those resources but
 * have no other authorization — otherwise any authenticated user could reach
 * another workspace's data by guessing IDs (broken tenant isolation).
 *
 * Resolves the owning workspace from whichever of workspaceId / spaceId /
 * projectId / listId / taskId is present (param first, then body), then checks
 * the caller is a member. super_admin bypasses, matching the other guards.
 */
@Injectable()
export class ResourceMemberGuard implements CanActivate {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest()
    const user = req.user
    if (!user?.id) throw new ForbiddenException('Not authenticated')

    const workspaceId = await this.resolveWorkspaceId(req.params ?? {}, req.body ?? {})
    if (!workspaceId) throw new NotFoundException('Resource not found')

    if (user.role === 'super_admin') return true

    const [member] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, user.id)))
      .limit(1)
    if (!member) throw new ForbiddenException('You are not a member of this workspace')

    req.workspaceMember = { ...member, workspaceId, userId: user.id }
    return true
  }

  private async resolveWorkspaceId(
    p: Record<string, string>,
    b: Record<string, unknown>,
  ): Promise<string | null> {
    if (p.workspaceId) return p.workspaceId
    if (typeof b.workspaceId === 'string') return b.workspaceId

    const spaceId = p.spaceId ?? (typeof b.spaceId === 'string' ? b.spaceId : undefined)
    const projectId = p.projectId ?? (typeof b.projectId === 'string' ? b.projectId : undefined)
    const listId = p.listId ?? (typeof b.listId === 'string' ? b.listId : undefined)
    const taskId = p.taskId ?? (typeof b.taskId === 'string' ? b.taskId : undefined)

    if (spaceId) {
      const [r] = await this.db
        .select({ w: spaces.workspaceId })
        .from(spaces)
        .where(eq(spaces.id, spaceId))
        .limit(1)
      return r?.w ?? null
    }
    if (projectId) {
      const [r] = await this.db
        .select({ w: spaces.workspaceId })
        .from(projects)
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(eq(projects.id, projectId))
        .limit(1)
      return r?.w ?? null
    }
    if (listId) {
      const [r] = await this.db
        .select({ w: spaces.workspaceId })
        .from(lists)
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(eq(lists.id, listId))
        .limit(1)
      return r?.w ?? null
    }
    if (taskId) {
      const [r] = await this.db
        .select({ w: spaces.workspaceId })
        .from(tasks)
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(eq(tasks.id, taskId))
        .limit(1)
      return r?.w ?? null
    }
    return null
  }
}
