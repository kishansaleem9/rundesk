import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { desc, eq } from 'drizzle-orm'
import {
  lists,
  projects,
  spaces,
  taskComments,
  tasks,
  timeEntries,
  users,
  workspaces,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { WebhooksService } from '../webhooks/webhooks.service'

const SAMPLE_LIMIT = 5

/**
 * Zapier REST-Hooks surface (Plan §12.4).
 *
 * A Zapier "subscription" is nothing more than one of the platform's existing
 * outbound {@link WebhooksService webhooks} pointed at a Zapier-provided target
 * URL — so subscribe/unsubscribe delegate straight to that service and reuse its
 * delivery pipeline (retries, HMAC signing, delivery log). No Zapier-specific
 * table is introduced.
 */
@Injectable()
export class ZapierService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly webhooks: WebhooksService,
  ) {}

  /** Zapier calls this to validate the API key and label the connection. */
  async authTest(workspaceId: string, userId: string) {
    const [workspace] = await this.db
      .select({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1)

    let user: { id: string; email: string; displayName: string } | null = null
    if (userId) {
      const [u] = await this.db
        .select({ id: users.id, email: users.email, displayName: users.displayName })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
      user = u ?? null
    }

    return {
      ok: true,
      workspace: workspace ?? { id: workspaceId, name: 'Rundesk', slug: null },
      user,
      // Zapier renders this as the connection label in the account list.
      connectionLabel: workspace ? `Rundesk – ${workspace.name}` : 'Rundesk',
    }
  }

  /**
   * REST-Hook subscribe: create an outbound webhook for `event` aimed at
   * Zapier's `targetUrl`. Returns `{ id }`; Zapier stores it and hands it back
   * to {@link unsubscribe}.
   */
  async subscribe(workspaceId: string, userId: string, dto: { event?: string; targetUrl?: string }) {
    const event = typeof dto?.event === 'string' ? dto.event.trim() : ''
    const targetUrl = typeof dto?.targetUrl === 'string' ? dto.targetUrl.trim() : ''
    if (!event) throw new BadRequestException('event is required')
    if (!targetUrl) throw new BadRequestException('targetUrl is required')

    const known = this.webhooks.getAvailableEvents()
    if (!known.includes(event)) {
      throw new BadRequestException(`Unknown event "${event}". Supported: ${known.join(', ')}`)
    }

    const hook = await this.webhooks.create(workspaceId, userId, {
      name: `Zapier · ${event}`,
      url: targetUrl,
      events: [event],
    })
    return { id: hook.id }
  }

  /** REST-Hook unsubscribe: delete the webhook, scoped to the caller's workspace. */
  async unsubscribe(workspaceId: string, id: string) {
    return this.webhooks.delete(workspaceId, id)
  }

  /**
   * Perform-list / sample data for a trigger: a few recent, REAL, workspace-
   * scoped items wrapped in the exact envelope the live webhook delivers
   * (`{ id, event, payload, timestamp }`), so a Zap built from the sample maps
   * identically to real deliveries.
   */
  async sample(workspaceId: string, event: string) {
    const known = this.webhooks.getAvailableEvents()
    if (!known.includes(event)) throw new BadRequestException(`Unknown event "${event}"`)

    if (event.startsWith('comment.')) return this.sampleComments(workspaceId, event)
    if (event.startsWith('time.')) return this.sampleTimeEntries(workspaceId, event)
    if (event.startsWith('task.')) return this.sampleTasks(workspaceId, event)
    // Other real events (project.*, member.*, form.submitted) have no first-class
    // sample source; an empty list is a valid Zapier perform-list response.
    return []
  }

  private async sampleTasks(workspaceId: string, event: string) {
    const rows = await this.db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        statusCategory: tasks.statusCategory,
        priority: tasks.priority,
        listId: tasks.listId,
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(spaces.workspaceId, workspaceId))
      .orderBy(desc(tasks.createdAt))
      .limit(SAMPLE_LIMIT)

    return rows.map((task) => this.envelope(event, { task }, task.id, task.createdAt))
  }

  private async sampleComments(workspaceId: string, event: string) {
    const rows = await this.db
      .select({
        id: taskComments.id,
        taskId: taskComments.taskId,
        authorId: taskComments.authorId,
        body: taskComments.body,
        createdAt: taskComments.createdAt,
      })
      .from(taskComments)
      .innerJoin(tasks, eq(tasks.id, taskComments.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(spaces.workspaceId, workspaceId))
      .orderBy(desc(taskComments.createdAt))
      .limit(SAMPLE_LIMIT)

    return rows.map((row) =>
      this.envelope(
        event,
        { comment: { id: row.id, taskId: row.taskId, authorId: row.authorId, body: (row.body ?? '').slice(0, 2000) } },
        row.id,
        row.createdAt,
      ),
    )
  }

  private async sampleTimeEntries(workspaceId: string, event: string) {
    const rows = await this.db
      .select({
        id: timeEntries.id,
        taskId: timeEntries.taskId,
        userId: timeEntries.userId,
        durationSec: timeEntries.durationSec,
        isBillable: timeEntries.isBillable,
        createdAt: timeEntries.createdAt,
        taskTitle: tasks.title,
      })
      .from(timeEntries)
      .innerJoin(tasks, eq(tasks.id, timeEntries.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(spaces.workspaceId, workspaceId))
      .orderBy(desc(timeEntries.createdAt))
      .limit(SAMPLE_LIMIT)

    return rows.map((row) =>
      this.envelope(
        event,
        {
          timeEntry: {
            id: row.id,
            taskId: row.taskId,
            userId: row.userId,
            durationSec: row.durationSec ?? 0,
            isBillable: row.isBillable,
          },
          task: { id: row.taskId, title: row.taskTitle },
        },
        row.id,
        row.createdAt,
      ),
    )
  }

  /**
   * Same shape WebhooksService.deliver() POSTs, plus a top-level `id` Zapier
   * uses to de-duplicate polled items.
   */
  private envelope(event: string, payload: Record<string, unknown>, id: string, ts: Date | string | null) {
    const timestamp = ts instanceof Date ? ts : ts ? new Date(ts) : new Date()
    return { id, event, payload, timestamp: timestamp.toISOString() }
  }
}
