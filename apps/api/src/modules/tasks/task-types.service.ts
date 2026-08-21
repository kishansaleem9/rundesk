import { Injectable, Inject, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common'
import { eq, asc, and, sql, ne } from 'drizzle-orm'
import { taskTypes, tasks, lists, projects, spaces, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

const MAX_NAME = 80
/** Emoji, or a couple of characters. Long enough for "🚀", short enough not to be a label. */
const MAX_ICON = 8

/**
 * Task Types — what a row *is*, not what state it is in. "Task", "Campaign",
 * "Invoice", "Bug". ClickUp puts these beside the title; a team's vocabulary
 * for its own work matters more than the settings furniture around it.
 *
 * Workspace-scoped, and every route re-checks membership: the types hang off a
 * workspace, but they are applied from a task, so there is no single resource a
 * guard could key on across both.
 */
@Injectable()
export class TaskTypesService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  private async assertMember(workspaceId: string, userId: string) {
    const [m] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    if (!m) throw new ForbiddenException('Workspace membership required')
    return m
  }

  private async assertAdmin(workspaceId: string, userId: string) {
    const m = await this.assertMember(workspaceId, userId)
    // Editing the vocabulary is an admin act; applying a type is not.
    if (m.role !== 'workspace_admin' && m.role !== 'manager') {
      throw new ForbiddenException('Only workspace admins can manage task types')
    }
  }

  /** The workspace a task belongs to, walking list → project → space. */
  private async workspaceOfTask(taskId: string) {
    const [row] = await this.db
      .select({ workspaceId: spaces.workspaceId })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(tasks.id, taskId))
      .limit(1)
    if (!row) throw new NotFoundException('Task not found')
    return row.workspaceId
  }

  private clean(body: { name?: string; icon?: string | null; color?: string | null }) {
    const name = (body.name ?? '').trim()
    if (!name) throw new BadRequestException('name is required')
    if (name.length > MAX_NAME) throw new BadRequestException(`name must be ${MAX_NAME} characters or fewer`)
    const icon = (body.icon ?? '').trim().slice(0, MAX_ICON) || null
    const color = (body.color ?? '').trim() || null
    return { name, icon, color }
  }

  async list(workspaceId: string, userId: string) {
    await this.assertMember(workspaceId, userId)
    return this.db
      .select()
      .from(taskTypes)
      .where(eq(taskTypes.workspaceId, workspaceId))
      .orderBy(asc(taskTypes.position), asc(taskTypes.createdAt))
  }

  async create(
    workspaceId: string,
    userId: string,
    body: { name: string; icon?: string | null; color?: string | null; isDefault?: boolean },
  ) {
    await this.assertAdmin(workspaceId, userId)
    const fields = this.clean(body)
    // Append: a new type goes to the end of the picker rather than the top.
    const [{ next } = { next: 0 }] = await this.db
      .select({ next: sql<number>`coalesce(max(${taskTypes.position}), -1) + 1` })
      .from(taskTypes)
      .where(eq(taskTypes.workspaceId, workspaceId))
    if (body.isDefault) await this.clearDefault(workspaceId)
    const [row] = await this.db
      .insert(taskTypes)
      .values({ workspaceId, ...fields, position: Number(next) || 0, isDefault: body.isDefault === true })
      .returning()
    return row
  }

  /**
   * The partial unique index allows exactly one default per workspace, so a new
   * default has to unset the old one first or the insert/update is rejected by
   * the database. That rejection is the point — the constraint is real, and this
   * is the one place allowed to satisfy it.
   */
  private async clearDefault(workspaceId: string, exceptId?: string) {
    await this.db
      .update(taskTypes)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(
        exceptId
          ? and(eq(taskTypes.workspaceId, workspaceId), eq(taskTypes.isDefault, true), ne(taskTypes.id, exceptId))
          : and(eq(taskTypes.workspaceId, workspaceId), eq(taskTypes.isDefault, true)),
      )
  }

  async update(
    workspaceId: string,
    typeId: string,
    userId: string,
    body: { name?: string; icon?: string | null; color?: string | null; isDefault?: boolean; position?: number },
  ) {
    await this.assertAdmin(workspaceId, userId)
    const existing = await this.byId(workspaceId, typeId)
    const set: Record<string, unknown> = { updatedAt: new Date() }
    if (body.name !== undefined || body.icon !== undefined || body.color !== undefined) {
      const fields = this.clean({ name: body.name ?? existing.name, icon: body.icon, color: body.color })
      set.name = fields.name
      if (body.icon !== undefined) set.icon = fields.icon
      if (body.color !== undefined) set.color = fields.color
    }
    if (body.position !== undefined && Number.isInteger(body.position)) set.position = body.position
    if (body.isDefault === true) await this.clearDefault(workspaceId, typeId)
    if (body.isDefault !== undefined) set.isDefault = body.isDefault === true
    const [row] = await this.db
      .update(taskTypes)
      .set(set)
      .where(and(eq(taskTypes.workspaceId, workspaceId), eq(taskTypes.id, typeId)))
      .returning()
    return row
  }

  /**
   * Deleting a type does not delete the work filed under it — the column is
   * `ON DELETE SET NULL`, so those tasks come back untyped. The count is
   * returned so the UI can say how many were affected rather than doing it
   * silently.
   */
  async remove(workspaceId: string, typeId: string, userId: string) {
    await this.assertAdmin(workspaceId, userId)
    await this.byId(workspaceId, typeId)
    const [{ count } = { count: 0 }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(eq(tasks.taskTypeId, typeId))
    await this.db.delete(taskTypes).where(and(eq(taskTypes.workspaceId, workspaceId), eq(taskTypes.id, typeId)))
    return { ok: true, untypedTasks: Number(count) || 0 }
  }

  /** Scoped by workspace, so a valid id from another tenant reads as missing. */
  private async byId(workspaceId: string, typeId: string) {
    const [row] = await this.db
      .select()
      .from(taskTypes)
      .where(and(eq(taskTypes.workspaceId, workspaceId), eq(taskTypes.id, typeId)))
      .limit(1)
    if (!row) throw new NotFoundException('Task type not found')
    return row
  }

  /** Apply a type to a task, or clear it with `null`. */
  async setForTask(taskId: string, typeId: string | null, userId: string) {
    const workspaceId = await this.workspaceOfTask(taskId)
    await this.assertMember(workspaceId, userId)
    const type = typeId ? await this.byId(workspaceId, typeId) : null
    // §1.1 — the type is what a person sets; tasks.isMilestone is what the
    // timeline, list badges and the client portal render from. Moving onto a
    // milestone type has to draw the diamond, and moving off one has to stop
    // drawing it — otherwise the two disagree and the app shows a milestone the
    // Milestone filter cannot find.
    const [row] = await this.db
      .update(tasks)
      .set({ taskTypeId: typeId, isMilestone: !!type?.isMilestone, updatedAt: new Date() })
      .where(eq(tasks.id, taskId))
      .returning({ id: tasks.id, taskTypeId: tasks.taskTypeId, isMilestone: tasks.isMilestone })
    return row
  }
}
