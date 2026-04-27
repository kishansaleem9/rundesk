import { Injectable, Inject, NotFoundException } from '@nestjs/common'
import { and, eq, desc } from 'drizzle-orm'
import * as crypto from 'crypto'
import { webhooks, webhookDeliveries } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

const WEBHOOK_EVENTS = [
  'task.created',
  'task.updated',
  'task.deleted',
  'task.status_changed',
  'task.assigned',
  'comment.created',
  'project.created',
  'project.updated',
  'member.invited',
  'member.removed',
  'form.submitted',
]

@Injectable()
export class WebhooksService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  getAvailableEvents() {
    return WEBHOOK_EVENTS
  }

  async list(workspaceId: string) {
    return this.db
      .select()
      .from(webhooks)
      .where(eq(webhooks.workspaceId, workspaceId))
      .orderBy(desc(webhooks.createdAt))
  }

  async create(
    workspaceId: string,
    userId: string,
    dto: { name: string; url: string; events: string[]; secret?: string },
  ) {
    const secret = dto.secret || crypto.randomBytes(20).toString('hex')
    const [row] = await this.db
      .insert(webhooks)
      .values({ workspaceId, createdById: userId, ...dto, secret })
      .returning()
    return row
  }

  private async assertOwnership(workspaceId: string, webhookId: string) {
    const [row] = await this.db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.id, webhookId), eq(webhooks.workspaceId, workspaceId)))
      .limit(1)
    if (!row) throw new NotFoundException('Webhook not found')
    return row
  }

  async update(
    workspaceId: string,
    webhookId: string,
    patch: { name?: string; url?: string; events?: string[]; isEnabled?: boolean },
  ) {
    await this.assertOwnership(workspaceId, webhookId)
    const [row] = await this.db
      .update(webhooks)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(webhooks.id, webhookId))
      .returning()
    if (!row) throw new NotFoundException('Webhook not found')
    return row
  }

  async delete(workspaceId: string, webhookId: string) {
    await this.assertOwnership(workspaceId, webhookId)
    await this.db.delete(webhooks).where(eq(webhooks.id, webhookId))
    return { ok: true }
  }

  async listDeliveries(workspaceId: string, webhookId: string) {
    await this.assertOwnership(workspaceId, webhookId)
    return this.db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.webhookId, webhookId))
      .orderBy(desc(webhookDeliveries.deliveredAt))
      .limit(50)
  }

  // ─── Fire event to all matching webhooks ──────────────────────────────────
  async fire(workspaceId: string, event: string, payload: object): Promise<void> {
    const hooks = await this.db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.workspaceId, workspaceId), eq(webhooks.isEnabled, true)))

    const matching = hooks.filter((h) => {
      const events = h.events as string[]
      return events.includes(event) || events.includes('*')
    })

    await Promise.allSettled(matching.map((hook) => this.deliver(hook, event, payload)))
  }

  private async deliver(
    hook: typeof webhooks.$inferSelect,
    event: string,
    payload: object,
  ): Promise<void> {
    const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() })
    const signature = hook.secret
      ? `sha256=${crypto.createHmac('sha256', hook.secret).update(body).digest('hex')}`
      : undefined

    const start = Date.now()
    let statusCode: number | undefined
    let responseBody: string | undefined
    let success = false

    try {
      const res = await fetch(hook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Rundesk-Event': event,
          ...(signature ? { 'X-Rundesk-Signature': signature } : {}),
        },
        body,
        signal: AbortSignal.timeout(10_000),
      })
      statusCode = res.status
      responseBody = await res.text().catch(() => '')
      success = res.ok

      // Update stats
      if (success) {
        await this.db
          .update(webhooks)
          .set({ successCount: hook.successCount + 1, lastDeliveredAt: new Date(), updatedAt: new Date() })
          .where(eq(webhooks.id, hook.id))
      } else {
        await this.db
          .update(webhooks)
          .set({ failureCount: hook.failureCount + 1, updatedAt: new Date() })
          .where(eq(webhooks.id, hook.id))
      }
    } catch (err: any) {
      responseBody = err?.message ?? 'Delivery failed'
    }

    await this.db.insert(webhookDeliveries).values({
      webhookId: hook.id,
      event,
      payload,
      statusCode,
      responseBody: responseBody?.slice(0, 1000),
      duration: Date.now() - start,
      success,
    })
  }

  async testWebhook(workspaceId: string, webhookId: string) {
    const hook = await this.assertOwnership(workspaceId, webhookId)
    await this.deliver(hook, 'webhook.test', { message: 'Test delivery from Rundesk' })
    return { ok: true }
  }
}
