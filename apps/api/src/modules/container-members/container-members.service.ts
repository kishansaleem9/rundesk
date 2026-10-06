import { isManagerRole } from '../../common/permissions/workspace-roles'
import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common'
import { and, eq, inArray } from 'drizzle-orm'
import { spaceMembers, projectMembers, spaces, projects, lists, workspaceMembers, users } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { assertCanManageContainer } from '../../common/permissions/container-access'
import { allowedBy } from '../../common/permissions/capability'
import { CustomRolesService } from '../custom-roles/custom-roles.service'
import type { WithinStep } from '../../common/permissions/space-default-permission'
import { assertMayShapeStatuses } from '../../common/permissions/status-access'
import { assertMayDefineFields } from '../../common/permissions/field-access'
import { isUuid } from '../../common/validation/uuid'

type ContainerRole = 'admin' | 'edit' | 'comment' | 'view'
const CONTAINER_ROLES: ContainerRole[] = ['admin', 'edit', 'comment', 'view']

function assertRole(role: string): asserts role is ContainerRole {
  if (!CONTAINER_ROLES.includes(role as ContainerRole)) throw new BadRequestException('Invalid role')
}

@Injectable()
export class ContainerMembersService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private roles: CustomRolesService,
  ) {}

  private async isWorkspaceManager(workspaceId: string, userId: string) {
    const [wm] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    return !!wm && isManagerRole(wm.role as string)
  }

  // ── Spaces ─────────────────────────────────────────────────────────────────

  private async spaceCtx(spaceId: string) {
    const [row] = await this.db
      .select({ workspaceId: spaces.workspaceId, visibility: spaces.visibility })
      .from(spaces)
      .where(eq(spaces.id, spaceId))
      .limit(1)
    if (!row) throw new NotFoundException('Space not found')
    return row
  }

  private async assertCanManageSpace(spaceId: string, actorId: string) {
    const [sm] = await this.db
      .select({ role: spaceMembers.role })
      .from(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, actorId)))
      .limit(1)
    if (sm?.role === 'admin') return
    const ctx = await this.spaceCtx(spaceId)
    if (await this.isWorkspaceManager(ctx.workspaceId, actorId)) return
    throw new ForbiddenException('Only a space admin or workspace manager can manage this space')
  }

  async listSpaceMembers(spaceId: string) {
    await this.spaceCtx(spaceId)
    return this.db
      .select({
        userId: spaceMembers.userId,
        role: spaceMembers.role,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(spaceMembers)
      .innerJoin(users, eq(users.id, spaceMembers.userId))
      .where(eq(spaceMembers.spaceId, spaceId))
  }

  async addSpaceMember(spaceId: string, actorId: string, userId: string, role: string = 'edit') {
    assertRole(role)
    await this.assertCanManageSpace(spaceId, actorId)
    await this.db
      .insert(spaceMembers)
      .values({ spaceId, userId, role, addedById: actorId })
      .onConflictDoNothing()
    return { ok: true }
  }

  async updateSpaceMemberRole(spaceId: string, actorId: string, userId: string, role: string) {
    assertRole(role)
    await this.assertCanManageSpace(spaceId, actorId)
    const [row] = await this.db
      .update(spaceMembers)
      .set({ role, updatedAt: new Date() })
      .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)))
      .returning()
    if (!row) throw new NotFoundException('Member not found')
    return row
  }

  async removeSpaceMember(spaceId: string, actorId: string, userId: string) {
    await this.assertCanManageSpace(spaceId, actorId)
    await this.db
      .delete(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)))
    return { ok: true }
  }

  async setSpaceVisibility(spaceId: string, actorId: string, visibility: string) {
    if (visibility !== 'public' && visibility !== 'private') {
      throw new BadRequestException('visibility must be public or private')
    }
    await this.assertCanManageSpace(spaceId, actorId)
    const [row] = await this.db
      .update(spaces)
      .set({ visibility, updatedAt: new Date() })
      .where(eq(spaces.id, spaceId))
      .returning()
    return row
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  private async projectCtx(projectId: string) {
    const [row] = await this.db
      .select({ workspaceId: spaces.workspaceId, spaceId: projects.spaceId })
      .from(projects)
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(projects.id, projectId))
      .limit(1)
    if (!row) throw new NotFoundException('Project not found')
    return row
  }

  private async assertCanManageProject(projectId: string, actorId: string) {
    const [pm] = await this.db
      .select({ role: projectMembers.role })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, actorId)))
      .limit(1)
    if (pm?.role === 'admin') return
    const ctx = await this.projectCtx(projectId)
    // A space admin (of the owning space) can manage its projects too.
    const [sm] = await this.db
      .select({ role: spaceMembers.role })
      .from(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, ctx.spaceId), eq(spaceMembers.userId, actorId)))
      .limit(1)
    if (sm?.role === 'admin') return
    if (await this.isWorkspaceManager(ctx.workspaceId, actorId)) return
    throw new ForbiddenException('Only a project/space admin or workspace manager can manage this project')
  }

  /**
   * WHAT THIS PERSON MAY DO ON A PROJECT'S PAGE, each answered by the rule its
   * own route asks — so the page offers a control only where it would be
   * accepted (`found-24-sep/project-page-offers-guests-its-managers-buttons`):
   *
   *   - `edit` and `archive`: the project's own manage rule (PUT and DELETE
   *     `/projects/:id`, `assertCanManageContainer`), deleting asking
   *     `project.delete` of a project somebody else made, as the route does;
   *   - `members`: who may add, re-role or remove its members, and change its
   *     visibility (`assertCanManageProject`);
   *   - `statuses`: who may shape its statuses (`assertMayShapeStatuses`);
   *   - `fields`: who may define, rename and delete its fields — the define
   *     rule its field routes ask (`assertMayDefineFields`), with the account
   *     role they pass; and for each list the page names, `lists[id].fields`,
   *     the same rule for a field scoped to that list, whose share may decide.
   *     The project page's Custom fields section offered "Add field" and each
   *     field's delete to every reader, and a member of a view-only space was
   *     refused the delete (403) in silence
   *     (`found-6-oct/project-page-offers-field-edits-to-readers`);
   *   - `suggest`: anybody but a guest (the AI routes refuse a guest);
   *   - `lists`: rename and delete for each list the page names (`?lists=`),
   *     by the list's own manage rule, whose creator is part of the answer —
   *     and `list.delete`, for deleting one somebody else made.
   *
   * A refusal is an answer (false); anything else is not, and is thrown.
   */
  async projectCapabilities(projectId: string, actorId: string, listIds: string[], actorRole?: string | null) {
    const [row] = await this.db
      .select({ workspaceId: spaces.workspaceId, spaceId: projects.spaceId, createdById: projects.createdById, folderId: projects.folderId })
      .from(projects)
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(projects.id, projectId))
      .limit(1)
    if (!row) throw new NotFoundException('Project not found')
    const allowed = allowedBy
    // The same chain each route passes: a grant on the list, the project or its folder decides first.
    const above: WithinStep[] = [{ type: 'project', id: projectId }, ...(row.folderId ? [{ type: 'folder' as const, id: row.folderId }] : [])]
    const manage = (createdById: string | null, kind: 'project' | 'list', action: 'manage' | 'delete', listId?: string) =>
      assertCanManageContainer(this.db, {
        workspaceId: row.workspaceId, createdById, actorId, kind, action, spaceId: row.spaceId,
        within: listId ? [{ type: 'list', id: listId }, ...above] : above,
        // The keys the DELETE routes ask of what somebody else made.
        roles: this.roles,
      })
    const [membership] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, row.workspaceId), eq(workspaceMembers.userId, actorId)))
      .limit(1)
    const ids = [...new Set(listIds.filter((id) => isUuid(id)))].slice(0, 200)
    const listRows = ids.length
      ? await this.db
          .select({ id: lists.id, createdById: lists.createdById })
          .from(lists)
          .where(and(inArray(lists.id, ids), eq(lists.projectId, projectId)))
      : []
    // The field routes' own rule, asked as they ask it (`custom-fields.controller.ts` passes the account role).
    const defineFields = (listId?: string) =>
      allowed(assertMayDefineFields(this.db, { workspaceId: row.workspaceId, projectId, reader: { id: actorId, role: actorRole }, listId }))
    const [edit, archive, members, statuses, fields] = await Promise.all([
      allowed(manage(row.createdById, 'project', 'manage')),
      allowed(manage(row.createdById, 'project', 'delete')),
      allowed(this.assertCanManageProject(projectId, actorId)),
      allowed(assertMayShapeStatuses(this.db, { owner: 'project', ownerId: projectId, actorId })),
      defineFields(),
    ])
    const perList: Record<string, { rename: boolean; delete: boolean; fields: boolean }> = {}
    for (const list of listRows) {
      const [rename, remove, listFields] = await Promise.all([
        allowed(manage(list.createdById, 'list', 'manage', list.id)),
        allowed(manage(list.createdById, 'list', 'delete', list.id)),
        defineFields(list.id),
      ])
      perList[list.id] = { rename, delete: remove, fields: listFields }
    }
    return { edit, archive, members, statuses, fields, suggest: membership?.role !== 'guest', lists: perList }
  }

  async listProjectMembers(projectId: string) {
    await this.projectCtx(projectId)
    return this.db
      .select({
        userId: projectMembers.userId,
        role: projectMembers.role,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(eq(projectMembers.projectId, projectId))
  }

  async addProjectMember(projectId: string, actorId: string, userId: string, role: string = 'edit') {
    assertRole(role)
    await this.assertCanManageProject(projectId, actorId)
    await this.db
      .insert(projectMembers)
      .values({ projectId, userId, role, addedById: actorId })
      .onConflictDoNothing()
    return { ok: true }
  }

  async updateProjectMemberRole(projectId: string, actorId: string, userId: string, role: string) {
    assertRole(role)
    await this.assertCanManageProject(projectId, actorId)
    const [row] = await this.db
      .update(projectMembers)
      .set({ role, updatedAt: new Date() })
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .returning()
    if (!row) throw new NotFoundException('Member not found')
    return row
  }

  async removeProjectMember(projectId: string, actorId: string, userId: string) {
    await this.assertCanManageProject(projectId, actorId)
    await this.db
      .delete(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    return { ok: true }
  }

  async setProjectVisibility(projectId: string, actorId: string, visibility: string | null) {
    if (visibility !== null && visibility !== 'public' && visibility !== 'private') {
      throw new BadRequestException('visibility must be public, private or null (inherit)')
    }
    await this.assertCanManageProject(projectId, actorId)
    const [row] = await this.db
      .update(projects)
      .set({ visibility, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
      .returning()
    return row
  }
}
