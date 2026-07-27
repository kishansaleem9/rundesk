import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
import { eq, and, or, inArray, sql } from 'drizzle-orm'
import { projects, spaces, projectMembers, spaceMembers, folders } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { assertCanManageContainer } from '../../common/permissions/container-access'
import { isWorkspaceManager } from '../../common/permissions/container-access.guard-helper'
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
    const base = and(eq(projects.spaceId, spaceId), eq(projects.isArchived, false))
    if (!actorId || (await this.canSeeAllProjects(spaceId, actorId))) {
      return this.db.select().from(projects).where(base)
    }
    // Otherwise: non-private projects (public/inherit) plus the private ones the
    // caller is a member of.
    return this.db
      .select()
      .from(projects)
      .where(
        and(
          base,
          or(
            sql`${projects.visibility} is distinct from 'private'`,
            inArray(
              projects.id,
              this.db.select({ id: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.userId, actorId)),
            ),
          ),
        ),
      )
  }

  /** Managers and admins of the owning space see every project in it. */
  private async canSeeAllProjects(spaceId: string, actorId: string): Promise<boolean> {
    const [sp] = await this.db.select({ workspaceId: spaces.workspaceId }).from(spaces).where(eq(spaces.id, spaceId)).limit(1)
    if (sp && (await isWorkspaceManager(this.db, sp.workspaceId, actorId))) return true
    const [sm] = await this.db
      .select({ role: spaceMembers.role })
      .from(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, actorId)))
      .limit(1)
    return sm?.role === 'admin'
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
    if (actorId) await this.assertManageable(projectId, actorId)
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
    }

    // A folder target must actually live in the destination space, otherwise the
    // project would be grouped under a folder from a different space.
    if (target.folderId) {
      const [folder] = await this.db
        .select({ spaceId: folders.spaceId, isArchived: folders.isArchived })
        .from(folders)
        .where(eq(folders.id, target.folderId))
        .limit(1)
      if (!folder) throw new NotFoundException('Target folder not found')
      if (folder.isArchived) throw new BadRequestException('Cannot move into a deleted folder')
      if (folder.spaceId !== destSpaceId) {
        throw new BadRequestException('That folder does not belong to the destination space')
      }
    }

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

  private async assertManageable(projectId: string, actorId: string, action: 'manage' | 'delete' = 'manage') {
    const [row] = await this.db
      .select({
        createdById: projects.createdById,
        workspaceId: spaces.workspaceId,
        name: projects.name,
        spaceId: projects.spaceId,
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
    })
    return row
  }
}
