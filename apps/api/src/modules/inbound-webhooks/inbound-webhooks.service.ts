import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common'
import { and, asc, eq } from 'drizzle-orm'
import * as crypto from 'crypto'
import { inboundWebhooks } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { TasksService } from '../tasks/tasks.service'

const PRIORITIES = new Set(['urgent', 'high', 'normal', 'low'])

@Injectable()
export class InboundWebhooksService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private tasks: TasksService,
  ) {}

  listForList(listId: string) {
    return this.db
      .select()
      .from(inboundWebhooks)
      .where(eq(inboundWebhooks.listId, listId))
      .orderBy(asc(inboundWebhooks.createdAt))
  }

  async create(listId: string, name: string, createdById: string) {
    const token = crypto.randomBytes(24).toString('hex')
    const [row] = await this.db
      .insert(inboundWebhooks)
      .values({ listId, name: name?.trim() || 'Inbound webhook', token, createdById })
      .returning()
    return row
  }

  async remove(id: string, listId: string) {
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
