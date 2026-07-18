import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common'
import { and, asc, desc, eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import {
  clientPortals,
  projects,
  spaces,
  workspaces,
  workspaceMembers,
  clients,
  lists,
  tasks,
  listStatuses,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import type { StatusCategory } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { checkContainerAccess } from '../../common/permissions/container-access.guard-helper'

/**
 * A row of the SAFE task projection fetched for the public view. The SQL only
 * ever selects these columns — internal fields (assignees, description,
 * comments, priority, estimates, creator, list/space ids) are never queried.
 */
export type ClientPortalTaskRow = {
  id: string
  title: string
  status: string
  statusCategory: StatusCategory
  statusLabel: string | null
  statusColor: string | null
  dueDate: Date | null
  completedAt: Date | null
  isMilestone: boolean
}

export type ClientPortalTask = {
  id: string
  title: string
  status: string
  statusCategory: StatusCategory
  statusColor: string | null
  dueDate: string | null
  isMilestone: boolean
}

/** Humanise a raw status key when no list_status row resolves its label. */
export function humanizeStatusKey(key: string): string {
  const s = (key ?? '').replace(/[_-]+/g, ' ').trim()
  if (!s) return 'Status'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Pure, allow-list projection of a task down to client-safe fields. Even if the
 * caller hands a row carrying internal fields, only the whitelisted keys are
 * emitted — a second guard behind the already-narrowed SQL select.
 */
export function toClientTask(row: ClientPortalTaskRow): ClientPortalTask {
  return {
    id: row.id,
    title: row.title,
    status: row.statusLabel && row.statusLabel.trim() ? row.statusLabel : humanizeStatusKey(row.status),
    statusCategory: row.statusCategory,
    statusColor: row.statusColor ?? null,
    dueDate: row.dueDate ? new Date(row.dueDate).toISOString() : null,
    isMilestone: !!row.isMilestone,
  }
}

@Injectable()
export class ClientPortalService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  // ─── Admin: resolve + authorize ────────────────────────────────────────────

  /** Resolve a project's owning workspace + container visibility chain. */
  private async resolveProject(projectId: string) {
    const [row] = await this.db
      .select({
        projectId: projects.id,
        projectName: projects.name,
        projectVisibility: projects.visibility,
        spaceId: spaces.id,
        spaceVisibility: spaces.visibility,
        workspaceId: spaces.workspaceId,
      })
      .from(projects)
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(projects.id, projectId))
      .limit(1)
    return row ?? null
  }

  /**
   * Assert the actor may manage portals for a project: workspace member with
   * container (private space/project) access. Reuses the same helper the
   * ResourceMemberGuard applies to project routes.
   */
  private async assertProjectManageAccess(projectId: string, userId: string) {
    const proj = await this.resolveProject(projectId)
    if (!proj) throw new NotFoundException('Project not found')
    const [member] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, proj.workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    if (!member) throw new ForbiddenException('You are not a member of this workspace')
    const ok = await checkContainerAccess(
      this.db,
      {
        spaceId: proj.spaceId,
        spaceVisibility: proj.spaceVisibility,
        projectId: proj.projectId,
        projectVisibility: proj.projectVisibility,
      },
      { userId, workspaceRole: member.role as string },
    )
    if (!ok) throw new ForbiddenException('This space or project is private')
    return proj
  }

  private async getPortalOr404(portalId: string) {
    const [portal] = await this.db.select().from(clientPortals).where(eq(clientPortals.id, portalId)).limit(1)
    if (!portal) throw new NotFoundException('Portal not found')
    return portal
  }

  private toAdminView(p: typeof clientPortals.$inferSelect) {
    return {
      id: p.id,
      projectId: p.projectId,
      clientId: p.clientId,
      token: p.token,
      url: `/portal/${p.token}`,
      name: p.name,
      isEnabled: p.isEnabled,
      showCompleted: p.showCompleted,
      createdById: p.createdById,
      createdAt: p.createdAt,
      lastViewedAt: p.lastViewedAt,
    }
  }

  // ─── Admin: CRUD ───────────────────────────────────────────────────────────

  async create(
    projectId: string,
    userId: string,
    body: { name?: string | null; clientId?: string | null; showCompleted?: boolean } = {},
  ) {
    const proj = await this.assertProjectManageAccess(projectId, userId)

    let clientId: string | null = null
    if (body.clientId) {
      const [client] = await this.db
        .select({ id: clients.id })
        .from(clients)
        .where(and(eq(clients.id, body.clientId), eq(clients.workspaceId, proj.workspaceId)))
        .limit(1)
      if (!client) throw new BadRequestException('Client not found in this workspace')
      clientId = client.id
    }

    // Unguessable token; retry on the (astronomically unlikely) unique clash.
    for (let attempt = 0; attempt < 5; attempt++) {
      const token = randomBytes(18).toString('base64url') // 24 chars
      const [row] = await this.db
        .insert(clientPortals)
        .values({
          workspaceId: proj.workspaceId,
          projectId,
          clientId,
          token,
          name: typeof body.name === 'string' ? body.name.trim() || null : null,
          showCompleted: body.showCompleted ?? true,
          createdById: userId,
        })
        .onConflictDoNothing({ target: clientPortals.token })
        .returning()
      if (row) return this.toAdminView(row)
    }
    throw new BadRequestException('Could not allocate a portal token, please retry')
  }

  async listForProject(projectId: string, userId: string) {
    await this.assertProjectManageAccess(projectId, userId)
    const rows = await this.db
      .select()
      .from(clientPortals)
      .where(eq(clientPortals.projectId, projectId))
      .orderBy(desc(clientPortals.createdAt))
    return rows.map((r) => this.toAdminView(r))
  }

  async update(
    portalId: string,
    userId: string,
    body: { name?: string | null; isEnabled?: boolean; showCompleted?: boolean },
  ) {
    const portal = await this.getPortalOr404(portalId)
    await this.assertProjectManageAccess(portal.projectId, userId)

    const patch: Partial<typeof clientPortals.$inferInsert> = {}
    if (body.name !== undefined) patch.name = typeof body.name === 'string' ? body.name.trim() || null : null
    if (body.isEnabled !== undefined) patch.isEnabled = body.isEnabled
    if (body.showCompleted !== undefined) patch.showCompleted = body.showCompleted
    if (Object.keys(patch).length === 0) return this.toAdminView(portal)

    const [row] = await this.db.update(clientPortals).set(patch).where(eq(clientPortals.id, portalId)).returning()
    return this.toAdminView(row)
  }

  async remove(portalId: string, userId: string) {
    const portal = await this.getPortalOr404(portalId)
    await this.assertProjectManageAccess(portal.projectId, userId)
    await this.db.delete(clientPortals).where(eq(clientPortals.id, portalId))
    return { ok: true }
  }

  // ─── Public: token-only, read-only, strictly one-project projection ─────────

  /**
   * SECURITY-CRITICAL. Anonymous read by token. Returns ONLY:
   *   - workspace branding (name, logo, primary/accent color)
   *   - the linked project's display name (+ optional portal/client name)
   *   - that ONE project's tasks, projected to client-safe fields only
   *   - a coarse progress summary
   * Nothing internal (assignee emails, comments, notes, priority, estimates,
   * other projects) is ever queried or returned. Disabled portal → 404;
   * `show_completed=false` hides closed tasks from the list.
   */
  async getPublicView(token: string) {
    if (!token || token.length > 64) throw new NotFoundException('Portal not found')
    const [portal] = await this.db.select().from(clientPortals).where(eq(clientPortals.token, token)).limit(1)
    // Missing OR disabled → the same opaque 404 (never reveal a disabled link).
    if (!portal || !portal.isEnabled) throw new NotFoundException('Portal not found')

    const [meta] = await this.db
      .select({
        projectName: projects.name,
        workspaceName: workspaces.name,
        workspaceLogoUrl: workspaces.logoUrl,
        workspacePrimaryColor: workspaces.primaryColor,
        workspaceAccentColor: workspaces.accentColor,
      })
      .from(projects)
      .innerJoin(workspaces, eq(workspaces.id, portal.workspaceId))
      .where(eq(projects.id, portal.projectId))
      .limit(1)
    if (!meta) throw new NotFoundException('Portal not found')

    let clientName: string | null = null
    if (portal.clientId) {
      const [client] = await this.db
        .select({ name: clients.name })
        .from(clients)
        .where(eq(clients.id, portal.clientId))
        .limit(1)
      clientName = client?.name ?? null
    }

    // Tasks scoped to THIS project only (via its lists), non-archived. The
    // select is the security boundary: client-safe columns exclusively.
    const rows = (await this.db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        statusCategory: tasks.statusCategory,
        statusLabel: listStatuses.name,
        statusColor: listStatuses.color,
        dueDate: tasks.dueDate,
        completedAt: tasks.completedAt,
        isMilestone: tasks.isMilestone,
      })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .leftJoin(
        listStatuses,
        and(eq(listStatuses.listId, tasks.listId), eq(listStatuses.key, tasks.status)),
      )
      .where(and(eq(lists.projectId, portal.projectId), eq(tasks.isArchived, false), eq(lists.isArchived, false)))
      .orderBy(asc(tasks.position))) as ClientPortalTaskRow[]

    // Progress is computed over ALL non-archived tasks so the bar stays honest
    // even when completed tasks are hidden from the visible list.
    const total = rows.length
    const completed = rows.filter((r) => r.statusCategory === 'closed').length
    const percent = total === 0 ? 0 : Math.round((completed / total) * 100)

    const visible = portal.showCompleted ? rows : rows.filter((r) => r.statusCategory !== 'closed')
    const clientTasks = visible.map(toClientTask)

    // Best-effort view stamp; never block or fail the read on it.
    void (async () => {
      try {
        await this.db.update(clientPortals).set({ lastViewedAt: new Date() }).where(eq(clientPortals.id, portal.id))
      } catch {
        /* ignore */
      }
    })()

    return {
      portal: { name: portal.name || meta.projectName },
      project: { name: meta.projectName },
      client: clientName ? { name: clientName } : null,
      workspace: {
        name: meta.workspaceName,
        logoUrl: meta.workspaceLogoUrl,
        primaryColor: meta.workspacePrimaryColor,
        accentColor: meta.workspaceAccentColor,
      },
      showCompleted: portal.showCompleted,
      progress: { total, completed, percent },
      tasks: clientTasks,
    }
  }
}
