import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { slackIntegrations } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../../common/database/database.module'

@Injectable()
export class SlackService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  async get(workspaceId: string) {
    const [row] = await this.db
      .select()
      .from(slackIntegrations)
      .where(eq(slackIntegrations.workspaceId, workspaceId))
      .limit(1)
    if (!row) return null
    // Don't leak the full URL to the UI — just show the host fragment.
    return {
      id: row.id,
      isEnabled: row.isEnabled,
      channelName: row.channelName,
      eventFilters: row.eventFilters,
      successCount: row.successCount,
      failureCount: row.failureCount,
      lastNotifiedAt: row.lastNotifiedAt,
      webhookUrlHint: this.hint(row.webhookUrl),
      createdAt: row.createdAt,
    }
  }

  async connect(
    workspaceId: string,
    userId: string,
    dto: { webhookUrl: string; channelName?: string; eventFilters?: string[] },
  ) {
    if (!/^https:\/\/hooks\.slack\.com\//.test(dto.webhookUrl)) {
      throw new BadRequestException('Invalid Slack incoming webhook URL')
    }
    // Upsert: a workspace has exactly one Slack integration.
    const existing = await this.db
      .select()
      .from(slackIntegrations)
      .where(eq(slackIntegrations.workspaceId, workspaceId))
      .limit(1)

    if (existing[0]) {
      const [row] = await this.db
        .update(slackIntegrations)
        .set({
          webhookUrl: dto.webhookUrl,
          channelName: dto.channelName,
          eventFilters: dto.eventFilters ?? [],
          isEnabled: true,
          updatedAt: new Date(),
        })
        .where(eq(slackIntegrations.id, existing[0].id))
        .returning()
      return this.shape(row)
    }

    const [row] = await this.db
      .insert(slackIntegrations)
      .values({
        workspaceId,
        webhookUrl: dto.webhookUrl,
        channelName: dto.channelName,
        eventFilters: dto.eventFilters ?? [],
        createdById: userId,
      })
      .returning()
    return this.shape(row)
  }

  async update(
    workspaceId: string,
    patch: { isEnabled?: boolean; channelName?: string; eventFilters?: string[] },
  ) {
    const existing = await this.db
      .select()
      .from(slackIntegrations)
      .where(eq(slackIntegrations.workspaceId, workspaceId))
      .limit(1)
    if (!existing[0]) throw new NotFoundException('Slack integration not configured')

    const [row] = await this.db
      .update(slackIntegrations)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(slackIntegrations.id, existing[0].id))
      .returning()
    return this.shape(row)
  }

  async disconnect(workspaceId: string) {
    await this.db.delete(slackIntegrations).where(eq(slackIntegrations.workspaceId, workspaceId))
    return { ok: true }
  }

  async test(workspaceId: string) {
    const [row] = await this.db
      .select()
      .from(slackIntegrations)
      .where(eq(slackIntegrations.workspaceId, workspaceId))
      .limit(1)
    if (!row) throw new NotFoundException('Slack integration not configured')
    await this.post(row.webhookUrl, {
      text: ':white_check_mark: Test message from Rundesk — your Slack integration is working.',
    })
    return { ok: true }
  }

  /**
   * Public entry point: called by other modules (TasksService) when an
   * event is worth notifying about. Resolves the workspace's Slack
   * integration if any, applies event filters, and posts.
   */
  async notify(workspaceId: string, event: string, message: string) {
    const [row] = await this.db
      .select()
      .from(slackIntegrations)
      .where(eq(slackIntegrations.workspaceId, workspaceId))
      .limit(1)
    if (!row || !row.isEnabled) return

    const filters = row.eventFilters as string[]
    if (filters.length > 0 && !filters.includes(event) && !filters.includes('*')) return

    try {
      await this.post(row.webhookUrl, { text: message })
      await this.db
        .update(slackIntegrations)
        .set({
          successCount: row.successCount + 1,
          lastNotifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(slackIntegrations.id, row.id))
    } catch {
      await this.db
        .update(slackIntegrations)
        .set({ failureCount: row.failureCount + 1, updatedAt: new Date() })
        .where(eq(slackIntegrations.id, row.id))
    }
  }

  private async post(url: string, body: object) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Slack returned ${res.status}: ${text.slice(0, 200)}`)
    }
  }

  private shape(row: typeof slackIntegrations.$inferSelect) {
    return {
      id: row.id,
      isEnabled: row.isEnabled,
      channelName: row.channelName,
      eventFilters: row.eventFilters,
      successCount: row.successCount,
      failureCount: row.failureCount,
      lastNotifiedAt: row.lastNotifiedAt,
      webhookUrlHint: this.hint(row.webhookUrl),
      createdAt: row.createdAt,
    }
  }

  private hint(url: string) {
    // hooks.slack.com/services/T0XXXX/B0YYYY/abcdef -> mask the secret
    return url.replace(/(\/services\/[^/]+\/[^/]+\/).*/, '$1******')
  }
}
