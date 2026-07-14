import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { spaces, projects, lists, tasks, goals, sprints, taskViews, labels, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../../common/database/database.module'
import {
  checkContainerAccess,
  type ContainerAccessContext,
} from '../../../common/permissions/container-access.guard-helper'

type ResolvedResource = { workspaceId: string; container?: ContainerAccessContext }

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

    const resolved = await this.resolveResource(req.params ?? {}, req.body ?? {})
    if (!resolved) throw new NotFoundException('Resource not found')
    const { workspaceId, container } = resolved

    if (user.role === 'super_admin') return true

    const [member] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, user.id)))
      .limit(1)
    if (!member) throw new ForbiddenException('You are not a member of this workspace')

    // Private-container enforcement: a workspace member still needs container
    // membership to reach a private space/project. Public containers pass.
    if (container) {
      const ok = await checkContainerAccess(this.db, container, {
        userId: user.id,
        workspaceRole: member.role as string,
      })
      if (!ok) throw new ForbiddenException('This space or project is private')
    }

    req.workspaceMember = { ...member, workspaceId, userId: user.id }
    return true
  }

  private async resolveResource(
    p: Record<string, string>,
    b: Record<string, unknown>,
  ): Promise<ResolvedResource | null> {
    // Path params identify the *resource being acted on* and take priority over
    // body fields (which can be attacker-supplied) — e.g. POST /sprints/:id/tasks
    // must be authorized against the sprint's workspace, not the body's taskId.
    // Containers (goal/sprint/view) are checked before taskId so nested task
    // routes still resolve correctly.
    const order: Array<[string | undefined, 'ws' | 'space' | 'project' | 'list' | 'task' | 'goal' | 'sprint' | 'view' | 'label']> = [
      [p.workspaceId, 'ws'],
      [p.spaceId, 'space'],
      [p.projectId, 'project'],
      [p.listId, 'list'],
      [p.goalId, 'goal'],
      [p.sprintId, 'sprint'],
      [p.viewId, 'view'],
      [p.labelId, 'label'],
      [p.taskId, 'task'],
      [typeof b.workspaceId === 'string' ? b.workspaceId : undefined, 'ws'],
      [typeof b.spaceId === 'string' ? b.spaceId : undefined, 'space'],
      [typeof b.projectId === 'string' ? b.projectId : undefined, 'project'],
      [typeof b.listId === 'string' ? b.listId : undefined, 'list'],
      [typeof b.taskId === 'string' ? b.taskId : undefined, 'task'],
    ]
    for (const [id, kind] of order) {
      if (!id) continue
      return this.resolveByKind(kind, id)
    }
    return null
  }

  private async resolveByKind(
    kind: 'ws' | 'space' | 'project' | 'list' | 'task' | 'goal' | 'sprint' | 'view' | 'label',
    id: string,
  ): Promise<ResolvedResource | null> {
    if (kind === 'ws') return { workspaceId: id }
    if (kind === 'label') {
      const [r] = await this.db.select({ w: labels.workspaceId }).from(labels).where(eq(labels.id, id)).limit(1)
      return r ? { workspaceId: r.w } : null
    }
    if (kind === 'goal') {
      const [r] = await this.db.select({ w: goals.workspaceId }).from(goals).where(eq(goals.id, id)).limit(1)
      return r ? { workspaceId: r.w } : null
    }
    if (kind === 'sprint') {
      const [r] = await this.db.select({ w: sprints.workspaceId }).from(sprints).where(eq(sprints.id, id)).limit(1)
      return r ? { workspaceId: r.w } : null
    }

    // Container-nested kinds: resolve the space + (optional) project visibility
    // chain in the same query so private access can be enforced.
    if (kind === 'space') {
      const [r] = await this.db
        .select({ w: spaces.workspaceId, spaceId: spaces.id, sv: spaces.visibility })
        .from(spaces)
        .where(eq(spaces.id, id))
        .limit(1)
      return r
        ? { workspaceId: r.w, container: { spaceId: r.spaceId, spaceVisibility: r.sv } }
        : null
    }
    if (kind === 'project') {
      const [r] = await this.db
        .select({ w: spaces.workspaceId, spaceId: spaces.id, sv: spaces.visibility, projectId: projects.id, pv: projects.visibility })
        .from(projects)
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(eq(projects.id, id))
        .limit(1)
      return r
        ? { workspaceId: r.w, container: { spaceId: r.spaceId, spaceVisibility: r.sv, projectId: r.projectId, projectVisibility: r.pv } }
        : null
    }
    if (kind === 'list') {
      const [r] = await this.db
        .select({ w: spaces.workspaceId, spaceId: spaces.id, sv: spaces.visibility, projectId: projects.id, pv: projects.visibility })
        .from(lists)
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(eq(lists.id, id))
        .limit(1)
      return r
        ? { workspaceId: r.w, container: { spaceId: r.spaceId, spaceVisibility: r.sv, projectId: r.projectId, projectVisibility: r.pv } }
        : null
    }
    if (kind === 'task') {
      const [r] = await this.db
        .select({ w: spaces.workspaceId, spaceId: spaces.id, sv: spaces.visibility, projectId: projects.id, pv: projects.visibility })
        .from(tasks)
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(eq(tasks.id, id))
        .limit(1)
      return r
        ? { workspaceId: r.w, container: { spaceId: r.spaceId, spaceVisibility: r.sv, projectId: r.projectId, projectVisibility: r.pv } }
        : null
    }
    if (kind === 'view') {
      const [r] = await this.db
        .select({ w: spaces.workspaceId, spaceId: spaces.id, sv: spaces.visibility, projectId: projects.id, pv: projects.visibility })
        .from(taskViews)
        .innerJoin(lists, eq(lists.id, taskViews.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(eq(taskViews.id, id))
        .limit(1)
      return r
        ? { workspaceId: r.w, container: { spaceId: r.spaceId, spaceVisibility: r.sv, projectId: r.projectId, projectVisibility: r.pv } }
        : null
    }
    return null
  }
}
