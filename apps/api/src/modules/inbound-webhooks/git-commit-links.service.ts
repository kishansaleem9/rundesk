import { Inject, Injectable, Logger } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import {
  tasks,
  lists,
  projects,
  spaces,
  taskExternalLinks,
  workspaceIntegrationConnections,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import {
  buildCommitLinkFields,
  normalizePushCommits,
  parseTaskRefsFromMessage,
  type GitProvider,
} from './git-commit-links.util'

export interface PushIngestSummary {
  ok: boolean
  provider: GitProvider
  commitsScanned: number
  referencesFound: number
  linked: number
  skippedExisting: number
  skippedNoConnection: number
  skippedUnknownTask: number
}

/**
 * §12.8 — scan inbound GitHub/GitLab **push** events for commit messages that
 * reference a Rundesk task, and auto-create a `task_external_links` row
 * (kind:'commit') linking each such commit to its task.
 *
 * Env-gated on the *relevant provider connection*: a commit is only linked when
 * the referenced task's workspace has that provider (github/gitlab) connected.
 * Unconnected workspaces are skipped silently — the feature degrades to a no-op
 * rather than erroring. Idempotent: a commit already linked to a task (same
 * `external_id`) is never linked twice.
 */
@Injectable()
export class GitCommitLinksService {
  private readonly logger = new Logger(GitCommitLinksService.name)

  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async ingestPush(provider: GitProvider, payload: unknown): Promise<PushIngestSummary> {
    const summary: PushIngestSummary = {
      ok: true,
      provider,
      commitsScanned: 0,
      referencesFound: 0,
      linked: 0,
      skippedExisting: 0,
      skippedNoConnection: 0,
      skippedUnknownTask: 0,
    }

    const commits = normalizePushCommits(provider, payload)
    summary.commitsScanned = commits.length

    // Cache per-task workspace resolution + per-workspace connection status so a
    // push touching many commits/tasks does at most one lookup of each.
    const workspaceByTask = new Map<string, string | null>()
    const connectedByWorkspace = new Map<string, boolean>()

    for (const commit of commits) {
      const taskIds = parseTaskRefsFromMessage(commit.message)
      for (const taskId of taskIds) {
        summary.referencesFound += 1

        let workspaceId = workspaceByTask.get(taskId)
        if (workspaceId === undefined) {
          workspaceId = await this.resolveWorkspaceForTask(taskId)
          workspaceByTask.set(taskId, workspaceId)
        }
        if (!workspaceId) {
          summary.skippedUnknownTask += 1
          continue
        }

        let connected = connectedByWorkspace.get(workspaceId)
        if (connected === undefined) {
          connected = await this.isProviderConnected(workspaceId, provider)
          connectedByWorkspace.set(workspaceId, connected)
        }
        if (!connected) {
          summary.skippedNoConnection += 1
          continue
        }

        const created = await this.linkCommit(provider, workspaceId, taskId, commit)
        if (created) summary.linked += 1
        else summary.skippedExisting += 1
      }
    }

    if (summary.linked > 0) {
      this.logger.log(
        `Linked ${summary.linked} ${provider} commit(s) to tasks (scanned ${summary.commitsScanned})`,
      )
    }
    return summary
  }

  /** Resolve a task's owning workspace via list → project → space, or null. */
  private async resolveWorkspaceForTask(taskId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ workspaceId: spaces.workspaceId })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(tasks.id, taskId))
      .limit(1)
    return row?.workspaceId ?? null
  }

  /** True when the workspace has the given VCS provider connected. */
  private async isProviderConnected(workspaceId: string, provider: GitProvider): Promise<boolean> {
    const [conn] = await this.db
      .select({ status: workspaceIntegrationConnections.status })
      .from(workspaceIntegrationConnections)
      .where(
        and(
          eq(workspaceIntegrationConnections.workspaceId, workspaceId),
          eq(workspaceIntegrationConnections.provider, provider),
        ),
      )
      .limit(1)
    return Boolean(conn && conn.status === 'connected')
  }

  /**
   * Insert a kind:'commit' link if one doesn't already exist for this task+commit.
   * Returns true when a new row was created, false when it already existed
   * (idempotent — a repo pushing the same commit twice never double-links).
   */
  private async linkCommit(
    provider: GitProvider,
    workspaceId: string,
    taskId: string,
    commit: { sha: string; message: string; url: string | null; repoSlug: string | null; authorName: string | null },
  ): Promise<boolean> {
    const fields = buildCommitLinkFields(provider, commit.repoSlug, commit.sha)

    const [existing] = await this.db
      .select({ id: taskExternalLinks.id })
      .from(taskExternalLinks)
      .where(
        and(
          eq(taskExternalLinks.taskId, taskId),
          eq(taskExternalLinks.kind, 'commit'),
          eq(taskExternalLinks.externalId, fields.externalId),
        ),
      )
      .limit(1)
    if (existing) return false

    // A commit URL is preferred; fall back to a synthesised one so the link is
    // always openable even if the payload omitted `url`.
    const url = commit.url ?? this.fallbackCommitUrl(provider, commit.repoSlug, commit.sha)

    await this.db.insert(taskExternalLinks).values({
      taskId,
      workspaceId,
      provider,
      kind: 'commit',
      url,
      externalId: fields.externalId,
      title: fields.title,
      status: null,
      metadata: {
        ref: fields.ref,
        source: 'push_webhook',
        autoLinked: true,
        message: commit.message.split('\n')[0]?.slice(0, 500) ?? null,
        author: commit.authorName,
      },
      // No owning user — the link was created by an inbound webhook, not a member.
      createdById: null,
    })
    return true
  }

  private fallbackCommitUrl(provider: GitProvider, repoSlug: string | null, sha: string): string {
    if (!repoSlug) return sha
    return provider === 'github'
      ? `https://github.com/${repoSlug}/commit/${sha}`
      : `https://gitlab.com/${repoSlug}/-/commit/${sha}`
  }
}
