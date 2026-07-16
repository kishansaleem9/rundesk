import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
import { and, eq, desc } from 'drizzle-orm'
import * as crypto from 'crypto'
import { webhooks, webhookDeliveries } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { assertSafeUrl, safeFetch, SsrfBlockedError } from '../../common/http/safe-fetch'
import type { CreateWebhookDto, UpdateWebhookDto } from './dto/webhook.dto'

const WEBHOOK_EVENTS = [
  'task.created',
  'task.updated',
  'task.deleted',
  'task.status_changed',
  'task.assigned',
  'task.assignee_changed',
  'comment.created',
  'project.created',
  'project.updated',
  'member.invited',
  'member.joined',
  'member.removed',
  'time.logged',
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

  /**
   * Reject a webhook target URL that is not a public http/https endpoint before
   * it is ever persisted: non-http(s) schemes and literal private/reserved IPs
   * (loopback, link-local incl. the 169.254.169.254 cloud-metadata endpoint,
   * RFC-1918, CGNAT, …) are refused here. Hostnames that resolve to a private
   * address are additionally blocked at delivery time by {@link safeFetch}'s
   * DNS-pinned guard, so DNS-rebinding cannot repoint a "public" host inward.
   */
  private assertPublicHttpUrl(url: string) {
    try {
      assertSafeUrl(url)
    } catch (err) {
      if (err instanceof SsrfBlockedError) {
        throw new BadRequestException(`url is not an allowed webhook target: ${err.message}`)
      }
      throw new BadRequestException('url must be a valid absolute http(s) URL')
    }
  }

  async create(
    workspaceId: string,
    userId: string,
    dto: CreateWebhookDto,
  ) {
    if (typeof dto?.name !== 'string' || !dto.name.trim()) throw new BadRequestException('name is required')
    if (typeof dto?.url !== 'string' || !dto.url.trim()) throw new BadRequestException('url is required')
    this.assertPublicHttpUrl(dto.url)
    if (!Array.isArray(dto.events) || dto.events.length === 0) {
      throw new BadRequestException('events must be a non-empty array')
    }
    const unknown = dto.events.filter((e) => !WEBHOOK_EVENTS.includes(e))
    if (unknown.length) throw new BadRequestException(`Unknown webhook events: ${unknown.join(', ')}`)
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
    patch: UpdateWebhookDto,
  ) {
    await this.assertOwnership(workspaceId, webhookId)
    // Re-validate the target on update too: without this an admin could create a
    // benign webhook and later PATCH `url` to an internal address (SSRF).
    if (typeof patch.url === 'string') this.assertPublicHttpUrl(patch.url)
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

    const { attempts, lastStatus, lastBody, lastError } = await this.postWithRetry(hook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Rundesk-Event': event,
        'X-Rundesk-Delivery-Id': crypto.randomUUID(),
        ...(signature ? { 'X-Rundesk-Signature': signature } : {}),
      },
      body,
    })
    const statusCode = lastStatus
    const responseBody = lastBody ?? lastError
    const success = typeof lastStatus === 'number' && lastStatus >= 200 && lastStatus < 300

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

    await this.db.insert(webhookDeliveries).values({
      webhookId: hook.id,
      event,
      payload,
      statusCode,
      responseBody: responseBody?.slice(0, 1000),
      duration: Date.now() - start,
      attempts,
      success,
    })
  }

  async testWebhook(workspaceId: string, webhookId: string) {
    const hook = await this.assertOwnership(workspaceId, webhookId)
    await this.deliver(hook, 'webhook.test', { message: 'Test delivery from Rundesk' })
    return { ok: true }
  }

  /**
   * Post with retry. Retries on network errors AND on HTTP 5xx responses with
   * exponential backoff (250ms, 750ms, 1.5s). 4xx responses are treated as
   * permanent failures and not retried.
   *
   * All delivery traffic goes through {@link safeFetch}, which enforces
   * http/https only, blocks private/reserved IPs with DNS pinning, and
   * re-validates every redirect hop — so a webhook can never be used to read an
   * internal endpoint (e.g. the cloud-metadata service). A {@link SsrfBlockedError}
   * is a permanent block: it is recorded as a failed delivery and never retried.
   */
  private async postWithRetry(
    url: string,
    init: {
      method: 'POST'
      headers: Record<string, string>
      body: string
    },
  ): Promise<{
    attempts: number
    lastStatus?: number
    lastBody?: string
    lastError?: string
  }> {
    const maxAttempts = 3
    let attempt = 0
    let lastStatus: number | undefined
    let lastBody: string | undefined
    let lastError: string | undefined

    while (attempt < maxAttempts) {
      attempt++
      try {
        const res = await safeFetch(url, {
          method: init.method,
          headers: init.headers,
          body: init.body,
          timeoutMs: 10_000,
        })
        lastStatus = res.status
        lastBody = res.text()
        lastError = undefined
        // Success — done
        if (res.status >= 200 && res.status < 300) return { attempts: attempt, lastStatus, lastBody }
        // 4xx — permanent failure, do not retry
        if (res.status >= 400 && res.status < 500) {
          return { attempts: attempt, lastStatus, lastBody }
        }
        // 5xx — fall through to retry
      } catch (err: any) {
        // SSRF-blocked targets are permanent: don't retry, record the failure.
        if (err instanceof SsrfBlockedError) {
          return { attempts: attempt, lastStatus: undefined, lastBody: undefined, lastError: `Blocked: ${err.message}` }
        }
        lastError = err?.message ?? 'Delivery failed'
        lastStatus = undefined
        lastBody = undefined
      }
      if (attempt < maxAttempts) {
        const backoffMs = 250 * Math.pow(3, attempt - 1)
        await new Promise((resolve) => setTimeout(resolve, backoffMs))
      }
    }
    return { attempts: attempt, lastStatus, lastBody, lastError }
  }
}
