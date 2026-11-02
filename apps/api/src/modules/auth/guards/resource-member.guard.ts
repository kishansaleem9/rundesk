import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'
import { spaces, projects, lists, tasks, goals, sprints, taskViews, labels, workspaceMembers, workspaces } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../../common/database/database.module'
import {
  checkContainerAccess,
  type ContainerAccessContext,
} from '../../../common/permissions/container-access.guard-helper'
import { canSeePrivateItem, isManagerRole } from '../../../common/permissions/item-visibility'
import { guestMayRead } from '../../../common/permissions/guest-reach'
import { readsThroughAddedList } from '../../../common/permissions/read-access'
import { isUuid } from '../../../common/validation/uuid'

// Per-item (list/task) privacy resolved alongside the container chain so the
// guard can block a private list, or a private/foreign task, on by-id access.
type ResolvedItem = {
  listVisibility?: string | null
  listCreatedById?: string | null
  /** Whose Personal List it is, if it is one: theirs alone (`canSeePrivateItem`). */
  listPersonalOf?: string | null
  taskVisibility?: string | null
  taskCreatedById?: string | null
  taskIsAssignee?: boolean
}
/** What a guest must be able to read for the route to be theirs (`guestMayRead`): a task in reach, a container on the way. */
type GuestTarget = { kind: 'space' | 'project' | 'list' | 'task'; id: string }
type ResolvedResource = { workspaceId: string; container?: ContainerAccessContext; item?: ResolvedItem; guestTarget?: GuestTarget }


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

    const resolved = await this.resolveResource(req.params ?? {}, req.body ?? {}, user.id)
    if (!resolved) throw new NotFoundException('Resource not found')
    const { workspaceId, container, item } = resolved

    if (user.role === 'super_admin') {
      // Still populate workspace context so downstream guards/handlers that read
      // req.workspaceMember.workspaceId (e.g. PermissionsGuard) work for a
      // super_admin acting on a route whose workspace is only derivable here.
      req.workspaceMember = { workspaceId, userId: user.id, role: 'super_admin' }
      return true
    }

    const [member] = await this.db
      .select({ role: workspaceMembers.role, isArchived: workspaces.isArchived })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, user.id)))
      .limit(1)
    if (!member) throw new ForbiddenException('You are not a member of this workspace')
    // A deleted (archived) workspace's spaces, lists and tasks go with it, for
    // its members, at once (QA WS-018; `found-02-nov/archived-workspace-still-opens`),
    // as `WorkspaceMemberGuard` refuses the workspace itself.
    if (member.isArchived === true) throw new NotFoundException('Workspace not found')

    // What the resource's place says, refused in the words of the first that refuses.
    let refusal: string | null = null
    // Private-container enforcement: a workspace member still needs container
    // membership to reach a private space/project. Public containers pass.
    if (container) {
      const ok = await checkContainerAccess(this.db, container, {
        userId: user.id,
        workspaceRole: member.role as string,
      })
      if (!ok) refusal = 'This space or project is private'
    }

    // A guest reads what is shared with them, and sees the containers on the
    // way to it (`guest-reach.ts`): nothing else in the workspace is theirs.
    if (!refusal && member.role === 'guest' && resolved.guestTarget) {
      const { kind, id } = resolved.guestTarget
      if (!(await guestMayRead(this.db, user.id, kind, id))) refusal = 'This is not shared with you'
    }

    // Per-item privacy (§2): a private list, or a private/foreign task, is only
    // reachable by its creator, a task assignee, or a workspace manager/admin.
    const isManager = isManagerRole(member.role as string)
    if (
      !refusal &&
      item?.listVisibility !== undefined &&
      !canSeePrivateItem(
        { visibility: item.listVisibility, createdById: item.listCreatedById, personalOf: item.listPersonalOf },
        { userId: user.id, isManager },
      )
    ) {
      refusal = 'This list is private'
    }

    // A task is also where it was added (`readsThroughAddedList`): read there by whoever may read that list.
    if (
      refusal &&
      resolved.guestTarget?.kind === 'task' &&
      (await readsThroughAddedList(this.db, workspaceId, resolved.guestTarget.id, { id: user.id, role: member.role as string }))
    ) {
      refusal = null
    }
    if (refusal) throw new ForbiddenException(refusal)

    if (item) {
      if (
        item.taskVisibility !== undefined &&
        !canSeePrivateItem(
          { visibility: item.taskVisibility, createdById: item.taskCreatedById },
          { userId: user.id, isManager, isAssignee: item.taskIsAssignee },
        )
      ) {
        throw new ForbiddenException('This task is private')
      }
    }

    req.workspaceMember = { ...member, workspaceId, userId: user.id }
    return true
  }

  private async resolveResource(
    p: Record<string, string>,
    b: Record<string, unknown>,
    actorId: string,
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
      /*
       * Every id below addresses a `uuid` column, so a value that cannot be one
       * is a query Postgres will refuse rather than a lookup that misses. It
       * showed up in CI as pages of `invalid input syntax for type uuid:
       * "dashboards"`, from a URL that had fallen through to a route it was
       * never meant to match.
       *
       * Rejected rather than skipped: falling through to the next candidate
       * would let a malformed path param be answered by a body field, which is
       * exactly the precedence this table exists to prevent. The 400 is what
       * the failed query already produced, so no caller sees a new answer.
       */
      if (!isUuid(id)) throw new BadRequestException(`Malformed ${kind} id`)
      return this.resolveByKind(kind, id, actorId)
    }
    return null
  }

  private async resolveByKind(
    kind: 'ws' | 'space' | 'project' | 'list' | 'task' | 'goal' | 'sprint' | 'view' | 'label',
    id: string,
    actorId: string,
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
        ? { workspaceId: r.w, container: { spaceId: r.spaceId, spaceVisibility: r.sv }, guestTarget: { kind: 'space', id } }
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
        ? {
            workspaceId: r.w,
            container: { spaceId: r.spaceId, spaceVisibility: r.sv, projectId: r.projectId, projectVisibility: r.pv },
            guestTarget: { kind: 'project', id },
          }
        : null
    }
    if (kind === 'list') {
      const [r] = await this.db
        .select({ w: spaces.workspaceId, spaceId: spaces.id, sv: spaces.visibility, projectId: projects.id, pv: projects.visibility, lv: lists.visibility, lc: lists.createdById, lp: lists.personalOf })
        .from(lists)
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(eq(lists.id, id))
        .limit(1)
      return r
        ? {
            workspaceId: r.w,
            container: { spaceId: r.spaceId, spaceVisibility: r.sv, projectId: r.projectId, projectVisibility: r.pv },
            item: { listVisibility: r.lv, listCreatedById: r.lc, listPersonalOf: r.lp },
            guestTarget: { kind: 'list', id },
          }
        : null
    }
    if (kind === 'task') {
      const [r] = await this.db
        .select({
          w: spaces.workspaceId, spaceId: spaces.id, sv: spaces.visibility, projectId: projects.id, pv: projects.visibility,
          lv: lists.visibility, lc: lists.createdById, lp: lists.personalOf, tv: tasks.visibility, tc: tasks.createdById,
          isAssignee: sql<boolean>`exists (select 1 from task_assignees ta where ta.task_id = ${tasks.id} and ta.user_id = ${actorId})`,
        })
        .from(tasks)
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(eq(tasks.id, id))
        .limit(1)
      return r
        ? {
            workspaceId: r.w,
            container: { spaceId: r.spaceId, spaceVisibility: r.sv, projectId: r.projectId, projectVisibility: r.pv },
            item: {
              listVisibility: r.lv,
              listCreatedById: r.lc,
              listPersonalOf: r.lp,
              taskVisibility: r.tv,
              taskCreatedById: r.tc,
              taskIsAssignee: Boolean(r.isAssignee),
            },
            guestTarget: { kind: 'task', id },
          }
        : null
    }
    if (kind === 'view') {
      const [r] = await this.db
        .select({ w: spaces.workspaceId, spaceId: spaces.id, sv: spaces.visibility, projectId: projects.id, pv: projects.visibility, lv: lists.visibility, lc: lists.createdById, lp: lists.personalOf, listId: lists.id })
        .from(taskViews)
        .innerJoin(lists, eq(lists.id, taskViews.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(eq(taskViews.id, id))
        .limit(1)
      return r
        ? {
            workspaceId: r.w,
            container: { spaceId: r.spaceId, spaceVisibility: r.sv, projectId: r.projectId, projectVisibility: r.pv },
            item: { listVisibility: r.lv, listCreatedById: r.lc, listPersonalOf: r.lp },
            guestTarget: { kind: 'list', id: r.listId },
          }
        : null
    }
    return null
  }
}
