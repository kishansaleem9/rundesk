import { Inject, Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { taskExternalLinks, workspaceIntegrationConnections } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../../common/database/database.module'
import type { ExternalLinkRef } from '../../tasks/external-links.util'

/**
 * §12.2 (+ §12.8) — periodic background sync that keeps existing task↔external
 * links current WITHOUT a manual refresh click: it re-fetches metadata/state
 * for links whose provider is connected — Google Drive / Dropbox file names,
 * GitHub / GitLab PR & issue open/merged/closed state.
 *
 * Design notes:
 *   • Only refreshable kinds are considered (PR/issue have live state; files
 *     have a live name). Commits, meetings, recordings and generic links are
 *     immutable / have nothing to poll, so they're excluded.
 *   • Env-gated on the *provider connection*: a link is only refreshed when its
 *     workspace has that provider connected (grouped so each connection is
 *     looked up once per run). Unconnected links are left untouched.
 *   • Rate-limit friendly: at most BATCH_SIZE links per run, processed
 *     sequentially, and each link is only revisited once it's older than
 *     MAX_AGE_HOURS (tracked via `metadata.lastRefreshedAt`, since the table
 *     has no updated_at column and we must not add a migration).
 */

/** Link kinds that have something live to re-fetch. */
export const REFRESHABLE_KINDS = ['pull_request', 'issue', 'file'] as const
/** Providers with a live metadata/state endpoint. */
export const REFRESHABLE_PROVIDERS = ['github', 'gitlab', 'google_drive', 'dropbox'] as const

/** How stale a link must be before it's eligible for a re-fetch. */
const MAX_AGE_HOURS = 6
/** Hard cap on links refreshed per run (rate-limit friendly). */
const BATCH_SIZE = 50
/** Candidate rows pulled from the DB before staleness filtering. */
const CANDIDATE_POOL = 500

type RefreshProvider = (typeof REFRESHABLE_PROVIDERS)[number]

export interface RefreshableLink {
  id: string
  workspaceId: string
  provider: string
  kind: string
  title: string | null
  status: string | null
  createdAt: Date
  metadata: Record<string, unknown> | null
}

export interface RefreshRunSummary {
  scanned: number
  selected: number
  refreshed: number
  skippedNoConnection: number
  failed: number
}

/**
 * Pure selection: from a candidate pool, pick the links that are "stale enough"
 * to re-fetch, oldest-refreshed first, capped at `batchSize`. A link's age is
 * measured from `metadata.lastRefreshedAt` when present, else its `createdAt`.
 * Exported + side-effect free so the cadence/selection is unit-testable without
 * a DB or provider.
 */
export function selectStaleLinks(
  links: RefreshableLink[],
  now: Date,
  maxAgeHours = MAX_AGE_HOURS,
  batchSize = BATCH_SIZE,
): RefreshableLink[] {
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000
  const refreshedAt = (link: RefreshableLink): number => {
    const raw = link.metadata?.lastRefreshedAt
    if (typeof raw === 'string' || raw instanceof Date) {
      const t = new Date(raw).getTime()
      if (!Number.isNaN(t)) return t
    }
    return link.createdAt instanceof Date ? link.createdAt.getTime() : new Date(link.createdAt).getTime()
  }
  return links
    .filter((l) => now.getTime() - refreshedAt(l) >= maxAgeMs)
    .sort((a, b) => refreshedAt(a) - refreshedAt(b))
    .slice(0, batchSize)
}

/** external-link provider → integration-connection provider key. */
function connectionProviderFor(provider: RefreshProvider): 'github' | 'gitlab' | 'google-drive' | 'dropbox' {
  return provider === 'google_drive' ? 'google-drive' : provider
}

@Injectable()
export class ExternalLinkRefreshService {
  private readonly logger = new Logger(ExternalLinkRefreshService.name)

  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'external-link-refresh' })
  async runHourly(): Promise<RefreshRunSummary> {
    return this.refreshStale(new Date())
  }

  /**
   * One sync pass: load a candidate pool, pick the stale batch, group by
   * workspace+provider, and re-fetch each group whose connection is configured.
   */
  async refreshStale(now: Date = new Date()): Promise<RefreshRunSummary> {
    const summary: RefreshRunSummary = {
      scanned: 0,
      selected: 0,
      refreshed: 0,
      skippedNoConnection: 0,
      failed: 0,
    }

    const candidates = (await this.db
      .select({
        id: taskExternalLinks.id,
        workspaceId: taskExternalLinks.workspaceId,
        provider: taskExternalLinks.provider,
        kind: taskExternalLinks.kind,
        title: taskExternalLinks.title,
        status: taskExternalLinks.status,
        createdAt: taskExternalLinks.createdAt,
        metadata: taskExternalLinks.metadata,
      })
      .from(taskExternalLinks)
      .where(
        and(
          inArray(taskExternalLinks.kind, [...REFRESHABLE_KINDS]),
          inArray(taskExternalLinks.provider, [...REFRESHABLE_PROVIDERS]),
        ),
      )
      .orderBy(asc(taskExternalLinks.createdAt))
      .limit(CANDIDATE_POOL)) as RefreshableLink[]
    summary.scanned = candidates.length

    const selected = selectStaleLinks(candidates, now)
    summary.selected = selected.length
    if (selected.length === 0) return summary

    // Resolve each workspace+provider connection token once.
    const tokenCache = new Map<string, string | null>()
    for (const link of selected) {
      const provider = link.provider as RefreshProvider
      const cacheKey = `${link.workspaceId}:${provider}`
      let token = tokenCache.get(cacheKey)
      if (token === undefined) {
        token = await this.loadConnectionToken(link.workspaceId, connectionProviderFor(provider))
        tokenCache.set(cacheKey, token)
      }
      if (!token) {
        summary.skippedNoConnection += 1
        continue
      }

      try {
        const ref = (link.metadata?.ref as ExternalLinkRef | undefined) ?? {}
        const enriched = await this.fetchState(provider, link.kind, ref, token)
        await this.persist(link, enriched, now)
        if (enriched) summary.refreshed += 1
      } catch {
        summary.failed += 1
        // Still stamp lastRefreshedAt so a persistently-failing link doesn't get
        // retried every single run (don't hammer).
        await this.persist(link, null, now).catch(() => undefined)
      }
    }

    if (summary.refreshed > 0) {
      this.logger.log(`Refreshed ${summary.refreshed} external link(s) (scanned ${summary.scanned})`)
    }
    return summary
  }

  /** Write back the refreshed state, always bumping `metadata.lastRefreshedAt`. */
  private async persist(
    link: RefreshableLink,
    enriched: { status: string | null; title: string | null; metadata?: Record<string, unknown> } | null,
    now: Date,
  ): Promise<void> {
    const metadata: Record<string, unknown> = {
      ...(link.metadata ?? {}),
      lastRefreshedAt: now.toISOString(),
    }
    if (enriched?.metadata) Object.assign(metadata, enriched.metadata)
    await this.db
      .update(taskExternalLinks)
      .set({
        status: enriched?.status ?? link.status,
        title: enriched?.title ?? link.title,
        metadata,
      })
      .where(eq(taskExternalLinks.id, link.id))
  }

  /** Stored access token for a connected provider in a workspace, else null. */
  private async loadConnectionToken(
    workspaceId: string,
    connectionProvider: 'github' | 'gitlab' | 'google-drive' | 'dropbox',
  ): Promise<string | null> {
    const [conn] = await this.db
      .select({
        status: workspaceIntegrationConnections.status,
        accessToken: workspaceIntegrationConnections.accessToken,
      })
      .from(workspaceIntegrationConnections)
      .where(
        and(
          eq(workspaceIntegrationConnections.workspaceId, workspaceId),
          eq(workspaceIntegrationConnections.provider, connectionProvider),
        ),
      )
      .limit(1)
    if (!conn || conn.status !== 'connected' || !conn.accessToken) return null
    return conn.accessToken
  }

  /**
   * Env-gated live fetch, mirroring TasksService's per-link enrichment so the
   * cron and the manual "refresh" button produce identical status/title/metadata.
   * Returns null when the kind isn't fetchable or the remote call fails.
   */
  private async fetchState(
    provider: RefreshProvider,
    kind: string,
    ref: ExternalLinkRef,
    token: string,
  ): Promise<{ status: string | null; title: string | null; metadata?: Record<string, unknown> } | null> {
    if (provider === 'github' && (kind === 'pull_request' || kind === 'issue')) {
      return this.fetchGithubState(kind, ref, token)
    }
    if (provider === 'gitlab' && (kind === 'pull_request' || kind === 'issue')) {
      return this.fetchGitlabState(kind, ref, token)
    }
    if (provider === 'google_drive' && kind === 'file') {
      return this.fetchDriveFile(ref, token)
    }
    if (provider === 'dropbox' && kind === 'file') {
      return this.fetchDropboxFile(ref, token)
    }
    return null
  }

  private async fetchGithubState(kind: string, ref: ExternalLinkRef, token: string) {
    if (!ref.owner || !ref.repo || !ref.number) return null
    const base = process.env.GITHUB_API_URL ?? 'https://api.github.com'
    const path = kind === 'pull_request' ? 'pulls' : 'issues'
    const res = await fetch(`${base}/repos/${ref.owner}/${ref.repo}/${path}/${ref.number}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { state?: string; merged?: boolean; merged_at?: string | null; title?: string }
    const status =
      kind === 'pull_request'
        ? body.merged || body.merged_at
          ? 'merged'
          : body.state === 'closed'
            ? 'closed'
            : 'open'
        : body.state === 'closed'
          ? 'closed'
          : 'open'
    return { status, title: body.title ?? null, metadata: { state: body.state ?? null } }
  }

  private async fetchGitlabState(kind: string, ref: ExternalLinkRef, token: string) {
    if (!ref.projectPath || !ref.number) return null
    const apiBase =
      ref.host && ref.host !== 'gitlab.com'
        ? `https://${ref.host}/api/v4`
        : process.env.GITLAB_API_URL ?? 'https://gitlab.com/api/v4'
    const encoded = encodeURIComponent(ref.projectPath)
    const path = kind === 'pull_request' ? 'merge_requests' : 'issues'
    const res = await fetch(`${apiBase}/projects/${encoded}/${path}/${ref.number}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { state?: string; title?: string }
    const status =
      body.state === 'merged'
        ? 'merged'
        : body.state === 'closed' || body.state === 'locked'
          ? 'closed'
          : 'open'
    return { status, title: body.title ?? null, metadata: { state: body.state ?? null } }
  }

  private async fetchDriveFile(ref: ExternalLinkRef, token: string) {
    if (!ref.fileId) return null
    const base = process.env.GOOGLE_DRIVE_API_URL ?? 'https://www.googleapis.com/drive/v3'
    const res = await fetch(
      `${base}/files/${ref.fileId}?fields=id,name,mimeType,thumbnailLink,webViewLink,iconLink`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) },
    )
    if (!res.ok) return null
    const body = (await res.json()) as {
      name?: string
      mimeType?: string
      thumbnailLink?: string
      iconLink?: string
    }
    return {
      status: null,
      title: body.name ?? null,
      metadata: {
        mimeType: body.mimeType ?? null,
        thumbnailLink: body.thumbnailLink ?? null,
        iconLink: body.iconLink ?? null,
      },
    }
  }

  private async fetchDropboxFile(ref: ExternalLinkRef, token: string) {
    if (!ref.sharedUrl) return null
    const base = process.env.DROPBOX_API_URL ?? 'https://api.dropboxapi.com/2'
    const res = await fetch(`${base}/sharing/get_shared_link_metadata`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: ref.sharedUrl }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { name?: string; '.tag'?: string; size?: number }
    return {
      status: null,
      title: body.name ?? null,
      metadata: { dropboxType: body['.tag'] ?? null, size: body.size ?? null },
    }
  }
}
