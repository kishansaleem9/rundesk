import { Injectable, Inject, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { and, asc, eq } from 'drizzle-orm'
import * as crypto from 'crypto'
import { inboundWebhooks, lists, projects, spaces, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { TasksService } from '../tasks/tasks.service'
import { isManagerRole } from '../../common/permissions/item-visibility'
import { checkContainerAccess } from '../../common/permissions/container-access.guard-helper'

const PRIORITIES = new Set(['urgent', 'high', 'normal', 'low'])

@Injectable()
export class InboundWebhooksService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private tasks: TasksService,
  ) {}

  /** The list's workspace and containers, and the person's role in that workspace. */
  private async listContext(listId: string, userId: string) {
    const [ctx] = await this.db
      .select({
        workspaceId: spaces.workspaceId,
        spaceId: spaces.id,
        spaceVisibility: spaces.visibility,
        projectId: projects.id,
        projectVisibility: projects.visibility,
      })
      .from(lists)
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(lists.id, listId))
      .limit(1)
    if (!ctx) return null
    const [member] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, ctx.workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    return { ...ctx, role: (member?.role as string | undefined) ?? null }
  }

  /**
   * A HOOK'S TOKEN IS A STANDING PERMISSION TO ADD TASKS AS ITS CREATOR — the
   * unauthenticated receiver below needs nothing else. So it is shown to the
   * creator and to the people who manage the workspace, and to nobody else:
   * every member who could open the list, guests included, used to read every
   * hook's token, and kept the power after leaving. The rest of a hook — its
   * name, when it was made — is still listed, so nobody is told there is none.
   */
  async listForList(listId: string, viewer: { id: string; role?: string }) {
    const rows = await this.db
      .select()
      .from(inboundWebhooks)
      .where(eq(inboundWebhooks.listId, listId))
      .orderBy(asc(inboundWebhooks.createdAt))
    const ctx = await this.listContext(listId, viewer.id)
    const manages = viewer.role === 'super_admin' || isManagerRole(ctx?.role)
    return rows.map(({ token, ...hook }) => {
      const canManage = manages || hook.createdById === viewer.id
      return { ...hook, canManage, ...(canManage ? { token } : {}) }
    })
  }

  async create(listId: string, name: string, createdById: string) {
    // A hook adds tasks as its creator, so its creator must be somebody who
    // may add tasks here — guests may not (`assertNotGuestInList`).
    const ctx = await this.listContext(listId, createdById)
    if (!ctx) throw new NotFoundException('List not found')
    if (ctx.role === 'guest') throw new ForbiddenException('Guests cannot add inbound webhooks')
    const token = crypto.randomBytes(24).toString('hex')
    const [row] = await this.db
      .insert(inboundWebhooks)
      .values({ listId, name: name?.trim() || 'Inbound webhook', token, createdById })
      .returning()
    return row
  }

  /** The creator, or somebody who manages the workspace — not any member who can see the list. */
  async remove(id: string, listId: string, actor: { id: string; role?: string }) {
    const [hook] = await this.db
      .select({ createdById: inboundWebhooks.createdById })
      .from(inboundWebhooks)
      .where(and(eq(inboundWebhooks.id, id), eq(inboundWebhooks.listId, listId)))
      .limit(1)
    if (!hook) throw new NotFoundException('Webhook not found')
    if (hook.createdById !== actor.id && actor.role !== 'super_admin') {
      const ctx = await this.listContext(listId, actor.id)
      if (!isManagerRole(ctx?.role)) {
        throw new ForbiddenException('Only the webhook’s creator or a workspace admin can delete it')
      }
    }
    await this.db.delete(inboundWebhooks).where(and(eq(inboundWebhooks.id, id), eq(inboundWebhooks.listId, listId)))
    return { ok: true }
  }

  /**
   * Receive an external POST and create a task in the token's list (Plan §12).
   * Accepts { title (required), description?, priority?, dueDate? }.
   */
  async receive(token: string, payload: { title?: string; description?: string; priority?: string; dueDate?: string }) {
    const [hook] = await this.db.select().from(inboundWebhooks).where(eq(inboundWebhooks.token, token)).limit(1)
    if (!hook || !hook.isEnabled) throw new NotFoundException('Webhook not found')

    const title = (payload?.title ?? '').trim()
    if (!title) throw new BadRequestException('title is required')
    const priority = payload?.priority && PRIORITIES.has(payload.priority) ? (payload.priority as any) : undefined
    let dueDate: Date | undefined
    if (payload?.dueDate) {
      const d = new Date(payload.dueDate)
      if (!Number.isNaN(d.getTime())) dueDate = d
    }
    if (!hook.createdById) throw new BadRequestException('Webhook has no owning user')
    // The creator must STILL be somebody who may add tasks to this list — a
    // member (not a guest) who can see it. A hook made by someone who has since
    // left, or lost the list, stops; it does not keep adding tasks in their name.
    const ctx = await this.listContext(hook.listId, hook.createdById)
    const stillMay =
      !!ctx && !!ctx.role && ctx.role !== 'guest' &&
      (await checkContainerAccess(
        this.db,
        { spaceId: ctx.spaceId, spaceVisibility: ctx.spaceVisibility, projectId: ctx.projectId, projectVisibility: ctx.projectVisibility },
        { userId: hook.createdById, workspaceRole: ctx.role },
      ))
    if (!stillMay) throw new ForbiddenException('This webhook’s creator can no longer add tasks to its list')

    const task = await this.tasks.createTask({
      listId: hook.listId,
      title,
      description: payload?.description,
      priority,
      dueDate,
      createdById: hook.createdById,
    })
    return { ok: true, taskId: task?.id }
  }
}
