import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
import { eq, and, or, asc, getTableColumns } from 'drizzle-orm'
import { projects, spaces, projectMembers, folders, clients } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { isUuid } from '../../common/validation/uuid'
import { assertCanManageContainer, assertCanCreateInSpace, assertCanPlaceIn } from '../../common/permissions/container-access'
import { containerVisibilityFilter, isWorkspaceManager } from '../../common/permissions/container-access.guard-helper'
import { WebhooksService } from '../webhooks/webhooks.service'
import { SlackService } from '../integrations/slack/slack.service'
import { PlansService } from '../plans/plans.service'
import { SecurityService } from '../security/security.service'

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private webhooks: WebhooksService,
    private slack: SlackService,
    private plans: PlansService,
    private security: SecurityService,
  ) {}

  /**
   * Best-effort fan-out of a project lifecycle event to webhooks + Slack
   * (Plan §12.1 project update alerts, §12.4 webhooks). Mirrors
   * TasksService.fireTaskEvent: the workspace is resolved via the project's
   * space, delivery is non-blocking, and any failure is logged but never
   * propagated so a downed webhook/Slack channel can't break the mutation.
   */
  private async fireProjectEvent(
    eventType: 'project.created' | 'project.updated',
    project: { id: string; name: string; spaceId: string },
    actorId?: string,
  ) {
    const [space] = await this.db
      .select({ workspaceId: spaces.workspaceId })
      .from(spaces)
      .where(eq(spaces.id, project.spaceId))
      .limit(1)
    if (!space) return
    const workspaceId = space.workspaceId
    const payload = {
      project: { id: project.id, name: project.name, spaceId: project.spaceId, workspaceId },
      actorId: actorId ?? null,
    }
    try {
      await this.webhooks.fire(workspaceId, eventType, payload)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[webhooks.fire] ${eventType} failed:`, e)
    }
    try {
      const message =
        eventType === 'project.created'
          ? `:file_folder: New project created: *${project.name}*`
          : `:pencil2: Project updated: *${project.name}*`
      // Routes through the same per-channel routing rules task events use —
      // rules are keyed by event filter (+ optional project scope), so
      // project events are eligible without any routing-model change.
      await this.slack.notify(workspaceId, eventType, message, { projectId: project.id })
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[slack.notify] ${eventType} failed:`, e)
    }
  }

  async createProject(
    spaceId: string,
    data: { name: string; description?: string; color?: string; icon?: string; folderId?: string },
    actorId?: string,
  ) {
    // Plan §14.1: enforce the plan's project cap. Resolve the owning workspace via
    // the space, then check. No-op for enterprise (unlimited) — every existing
    // workspace by default.
    const [space] = await this.db
      .select({ workspaceId: spaces.workspaceId })
      .from(spaces)
      .where(eq(spaces.id, spaceId))
      .limit(1)
    if (space) await this.plans.assertCanCreateProjects(space.workspaceId)
    // §V2-06 `06:52` — and the space's own Default permission, which the plan
    // cap above says nothing about: one is "how many may exist", the other is
    // "may YOU add one here".
    await assertCanCreateInSpace(this.db, { spaceId, actorId, kind: 'project' })
    if (data.folderId) await this.assertFolderOfSpace(data.folderId, spaceId)

    const result = await this.db
      .insert(projects)
      .values({
        spaceId,
        name: data.name,
        description: data.description,
        color: data.color || '#354fb0',
        icon: data.icon,
        folderId: data.folderId ?? null,
        createdById: actorId ?? null,
      })
      .returning()

    const project = result[0]
    // Seed the creator as an admin member (mirrors the 0035 backfill).
    if (actorId && project) {
      await this.db
        .insert(projectMembers)
        .values({ projectId: project.id, userId: actorId, role: 'admin', addedById: actorId })
        .onConflictDoNothing()
    }
    if (project) void this.fireProjectEvent('project.created', project, actorId)
    return project
  }

  /** List only the archived projects of a space (for the restore UI). */
  async getArchivedProjectsBySpace(spaceId: string) {
    return this.db
      .select()
      .from(projects)
      .where(and(eq(projects.spaceId, spaceId), eq(projects.isArchived, true)))
  }

  async getProjectsBySpace(spaceId: string, actorId?: string) {
    /*
     * §G15-10 — the space's hidden container is never listed.
     *
     * Fourteen surfaces in the web app render a space's projects, and every one
     * of them reads this endpoint. Excluding the container HERE hides it from
     * all fourteen at once — the tree, the Move dialog, the palette's Location
     * filter, every project picker — which is the difference between one
     * decision and fourteen chances to forget.
     */
    const base = and(
      eq(projects.spaceId, spaceId),
      eq(projects.isArchived, false),
      eq(projects.isDefaultContainer, false),
    )
    // In the order they were put in (`position`, then age), for every reader:
    // the sidebar sorted for itself, and the fourteen other surfaces that read
    // this took whatever order the database answered in
    // (`ledger-rows/defect-projects-position-unordered`).
    const order = [asc(projects.position), asc(projects.createdAt)] as const
    if (!actorId) return this.db.select().from(projects).where(base).orderBy(...order)
    /*
     * THE SHARED CONTAINER RULE, not a copy of its project half: a private
     * project is its members' and its space's admins', and a private FOLDER is
     * its maker's. This kept its own copy, which never learnt the folder, so a
     * member refused a private folder was listed its projects
     * (`found-24-sep/private-folders-unenforced`).
     */
    const [sp] = await this.db.select({ workspaceId: spaces.workspaceId }).from(spaces).where(eq(spaces.id, spaceId)).limit(1)
    const isManager = sp ? await isWorkspaceManager(this.db, sp.workspaceId, actorId) : false
    return this.db
      .select(getTableColumns(projects))
      .from(projects)
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(base, containerVisibilityFilter(this.db, actorId, isManager)))
      .orderBy(...order)
  }

  async getProject(projectId: string) {
    const [project] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
    return project ?? null
  }

  async updateProject(
    projectId: string,
    data: Partial<{ name: string; description: string; color: string; icon: string; folderId: string | null; defaultBillable: boolean; clientId: string | null }>,
    actorId?: string,
  ) {
    const managed = actorId ? await this.assertManageable(projectId, actorId) : null
    if (data.clientId !== undefined && data.clientId !== null) {
      await this.assertClientOfWorkspace(projectId, data.clientId, managed?.workspaceId)
    }
    if (data.folderId !== undefined && data.folderId !== null) {
      const [own] = await this.db.select({ spaceId: projects.spaceId }).from(projects).where(eq(projects.id, projectId)).limit(1)
      if (!own) throw new NotFoundException('Project not found')
      await this.assertFolderOfSpace(data.folderId, own.spaceId)
    }
    // Whitelist the updatable columns instead of spreading the raw body: the
    // controller body is untyped at runtime, so a stray field like `position: true`
    // would otherwise reach the integer column (500) and any real column could be
    // mass-assigned. Only copy a field when it was actually provided.
    const set: Record<string, unknown> = { updatedAt: new Date() }
    for (const key of ['name', 'description', 'color', 'icon', 'folderId', 'defaultBillable', 'clientId'] as const) {
      if (data[key] !== undefined) set[key] = data[key]
    }
    const result = await this.db
      .update(projects)
      .set(set)
      .where(eq(projects.id, projectId))
      .returning()

    if (result[0]) void this.fireProjectEvent('project.updated', result[0], actorId)
    return result[0]
  }

  async deleteProject(projectId: string, actorId?: string, ipAddress?: string) {
    const ctx = actorId ? await this.assertManageable(projectId, actorId, 'delete') : null
    await this.db
      .update(projects)
      .set({ isArchived: true, archivedAt: new Date(), archivedById: actorId ?? null, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
    if (actorId && ctx) {
      // §13.3 — audit the container deletion (project archival).
      await this.security.logAuditEvent({
        workspaceId: ctx.workspaceId,
        actorId,
        action: 'project.deleted',
        resourceType: 'project',
        resourceId: projectId,
        description: `Archived project "${ctx.name}"`,
        ipAddress,
      })
    }
  }

  /** Restore an archived project (Plan §2.4 / §13.4). */
  async restoreProject(projectId: string, actorId?: string) {
    if (actorId) await this.assertManageable(projectId, actorId)
    const [row] = await this.db
      .update(projects)
      .set({ isArchived: false, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
      .returning()
    if (!row) throw new NotFoundException('Project not found')
    return row
  }

  /**
   * Move a project to another space and/or folder. Its lists and tasks follow
   * automatically because they hang off the project.
   *
   * `folderId: null` moves the project out of its folder to sit directly under
   * the space (the client's "move back"). A folder target must belong to the
   * destination space, and the destination must be in the same workspace.
   */
  async moveProject(
    projectId: string,
    target: { spaceId?: string; folderId?: string | null },
    actorId?: string,
    ipAddress?: string,
  ) {
    const [src] = await this.db
      .select({ name: projects.name, spaceId: projects.spaceId, workspaceId: spaces.workspaceId })
      .from(projects)
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(projects.id, projectId))
      .limit(1)
    if (!src) throw new NotFoundException('Project not found')
    if (actorId) await this.assertManageable(projectId, actorId)

    const destSpaceId = target.spaceId ?? src.spaceId
    if (destSpaceId !== src.spaceId) {
      const [dest] = await this.db
        .select({ workspaceId: spaces.workspaceId, isArchived: spaces.isArchived })
        .from(spaces)
        .where(eq(spaces.id, destSpaceId))
        .limit(1)
      if (!dest) throw new NotFoundException('Target space not found')
      if (dest.workspaceId !== src.workspaceId) {
        throw new BadRequestException('A project can only be moved within its own workspace')
      }
      if (dest.isArchived) throw new BadRequestException('Cannot move into a deleted space')
      // Into a DIFFERENT space: that space's create gate, and one the actor
      // can see. See assertCanPlaceIn.
      await assertCanPlaceIn(this.db, { spaceId: destSpaceId, actorId, kind: 'project' })
    }

    // A folder target must actually live in the destination space, otherwise the
    // project would be grouped under a folder from a different space.
    if (target.folderId) await this.assertFolderOfSpace(target.folderId, destSpaceId)

    // Resolve the destination folder explicitly so it can be both persisted and
    // audited without reading back through an untyped record.
    let destFolderId: string | null | undefined
    if (target.folderId !== undefined) destFolderId = target.folderId
    // Moving to a different space must clear a stale folder reference.
    else if (destSpaceId !== src.spaceId) destFolderId = null

    const set: Record<string, unknown> = { spaceId: destSpaceId, updatedAt: new Date() }
    if (destFolderId !== undefined) set.folderId = destFolderId

    const [row] = await this.db.update(projects).set(set).where(eq(projects.id, projectId)).returning()

    if (actorId) {
      await this.security.logAuditEvent({
        workspaceId: src.workspaceId,
        actorId,
        action: 'project.moved',
        resourceType: 'project',
        resourceId: projectId,
        description: `Moved project "${src.name}"`,
        ipAddress,
        metadata: { fromSpaceId: src.spaceId, toSpaceId: destSpaceId, toFolderId: destFolderId ?? null },
      })
    }
    return row
  }

  /**
   * A PROJECT'S TIME IS BILLED ONLY TO A CLIENT OF ITS OWN WORKSPACE. The foreign
   * key asks only that the client exist, so any workspace's client could be set,
   * and the time report then printed another workspace's client name while
   * invoicing refused the project. The portal already asked this
   * (`client-portal.service.ts`); the project's own update did not.
   */
  /**
   * A project's folder is one of its own space's, not deleted. Moving asked
   * this; making a project with a `folderId` and `PUT /projects/:id` did not,
   * and accepted a folder of another space or another workspace (200 each),
   * leaving the project in one space under a folder in another
   * (`found-28-sep/project-folder-unchecked-across-workspaces`).
   */
  private async assertFolderOfSpace(folderId: unknown, spaceId: string) {
    if (typeof folderId !== 'string' || !isUuid(folderId)) throw new BadRequestException('That folder does not belong to this space')
    const [folder] = await this.db
      .select({ spaceId: folders.spaceId, isArchived: folders.isArchived })
      .from(folders)
      .where(eq(folders.id, folderId))
      .limit(1)
    if (!folder || folder.spaceId !== spaceId) throw new BadRequestException('That folder does not belong to this space')
    if (folder.isArchived) throw new BadRequestException('Cannot move into a deleted folder')
  }

  private async assertClientOfWorkspace(projectId: string, clientId: unknown, workspaceId?: string) {
    if (typeof clientId !== 'string' || !isUuid(clientId)) throw new BadRequestException('Client not found in this workspace')
    let ws = workspaceId
    if (!ws) {
      const [row] = await this.db
        .select({ workspaceId: spaces.workspaceId })
        .from(projects)
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(eq(projects.id, projectId))
        .limit(1)
      if (!row) throw new NotFoundException('Project not found')
      ws = row.workspaceId
    }
    const [client] = await this.db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.workspaceId, ws)))
      .limit(1)
    if (!client) throw new BadRequestException('Client not found in this workspace')
  }

  private async assertManageable(projectId: string, actorId: string, action: 'manage' | 'delete' = 'manage') {
    const [row] = await this.db
      .select({
        createdById: projects.createdById,
        workspaceId: spaces.workspaceId,
        name: projects.name,
        spaceId: projects.spaceId,
        folderId: projects.folderId,
      })
      .from(projects)
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(projects.id, projectId))
      .limit(1)
    if (!row) throw new NotFoundException('Project not found')
    await assertCanManageContainer(this.db, {
      workspaceId: row.workspaceId,
      createdById: row.createdById,
      actorId,
      kind: 'project',
      action,
      // Managers may delete a project only within a space they belong to.
      spaceId: row.spaceId,
      // A grant on the project, or its folder, decides before the space.
      within: [{ type: 'project', id: projectId }, ...(row.folderId ? [{ type: 'folder' as const, id: row.folderId }] : [])],
    })
    return row
  }
}
