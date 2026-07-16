/**
 * ClickUp REST API client (Plan §12.5 gap-closer).
 *
 * The CSV export cannot carry comments or file attachments, so the CSV importer
 * honestly reports them as NOT imported. This client fetches exactly those two
 * things from the ClickUp API (v2) using a caller-supplied personal/OAuth token
 * so an import can be *enriched* with the data the CSV omits.
 *
 * Design notes:
 *  - Pure HTTP + parsing, no DB. Kept separate from the service so the request
 *    building, pagination, rate-limit backoff and payload parsing are unit
 *    testable with an injected `fetchImpl` (no real network).
 *  - Defensive: comment pagination is capped, 429s are retried with bounded
 *    backoff, and `downloadAttachment` never throws — a single bad file returns
 *    `null` so one failure can't sink an entire enrichment batch.
 */

/** ClickUp REST API v2 base. Auth header is `Authorization: <token>` (raw). */
export const CLICKUP_API_BASE = 'https://api.clickup.com/api/v2'

/** ClickUp returns at most 25 comments per page. */
export const COMMENT_PAGE_SIZE = 25

export type ClickUpUser = {
  id?: number
  username?: string
  email?: string
}

/** Shape of a comment from `GET /task/{id}/comment` (fields we consume). */
export type ClickUpComment = {
  id: string
  /** Plain concatenated text. */
  comment_text?: string
  /** Rich-text segments; used as a fallback when `comment_text` is absent. */
  comment?: Array<{ text?: string }>
  user?: ClickUpUser
  /** Epoch milliseconds, as a string. */
  date?: string
}

/** Shape of an attachment from `attachments[]` on `GET /task/{id}`. */
export type ClickUpAttachment = {
  id: string
  title?: string
  date?: string
  extension?: string
  mimetype?: string
  size?: number
  /** Direct (often pre-signed) download URL. */
  url?: string
  /** Download URL carrying auth query params; preferred when present. */
  url_w_query?: string
}

/** The subset the importer depends on — lets tests pass a plain fake. */
export interface ClickUpClientLike {
  getTaskComments(taskId: string): Promise<ClickUpComment[]>
  getTaskAttachments(taskId: string): Promise<ClickUpAttachment[]>
  downloadAttachment(att: ClickUpAttachment): Promise<{ buffer: Buffer; contentType: string } | null>
}

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>

export type ClickUpApiClientOptions = {
  apiToken: string
  baseUrl?: string
  fetchImpl?: FetchLike
  /** Safety cap on comment pages so a bad cursor can't loop forever. */
  maxPages?: number
  /** How many times to retry a 429 before giving up. */
  maxRetries?: number
  timeoutMs?: number
  downloadTimeoutMs?: number
  /** Injectable so tests don't actually wait during backoff. */
  sleep?: (ms: number) => Promise<void>
}

/** Join a ClickUp comment's text, preferring the flat field, then segments. */
export function extractCommentText(c: ClickUpComment): string {
  if (typeof c.comment_text === 'string' && c.comment_text.trim() !== '') return c.comment_text
  if (Array.isArray(c.comment)) return c.comment.map((s) => s?.text ?? '').join('')
  return ''
}

/** Parse a ClickUp epoch-milliseconds string into a Date (undefined if bad). */
export function clickupDate(raw?: string): Date | undefined {
  if (!raw) return undefined
  const ms = Number(raw)
  if (!Number.isFinite(ms) || ms <= 0) return undefined
  const d = new Date(ms)
  return Number.isNaN(d.getTime()) ? undefined : d
}

/** Filesystem/URL-safe attachment name (mirrors the email-ingest convention). */
export function safeAttachmentName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 100) || 'attachment'
}

function urlHost(u: string): string {
  try {
    return new URL(u).hostname
  } catch {
    return ''
  }
}

const isClickUpHost = (host: string): boolean => /(^|\.)clickup\.com$/i.test(host)

export class ClickUpApiClient implements ClickUpClientLike {
  private readonly apiToken: string
  private readonly baseUrl: string
  private readonly fetchImpl: FetchLike
  private readonly maxPages: number
  private readonly maxRetries: number
  private readonly timeoutMs: number
  private readonly downloadTimeoutMs: number
  private readonly sleep: (ms: number) => Promise<void>

  constructor(opts: ClickUpApiClientOptions) {
    this.apiToken = opts.apiToken
    this.baseUrl = (opts.baseUrl ?? CLICKUP_API_BASE).replace(/\/$/, '')
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init))
    this.maxPages = opts.maxPages ?? 40
    this.maxRetries = opts.maxRetries ?? 3
    this.timeoutMs = opts.timeoutMs ?? 20_000
    this.downloadTimeoutMs = opts.downloadTimeoutMs ?? 60_000
    this.sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  }

  /** All comments on a task, oldest-first, following ClickUp's cursor paging. */
  async getTaskComments(taskId: string): Promise<ClickUpComment[]> {
    const out: ClickUpComment[] = []
    let start: string | undefined
    let startId: string | undefined

    for (let page = 0; page < this.maxPages; page++) {
      const qs = new URLSearchParams()
      if (start) qs.set('start', start)
      if (startId) qs.set('start_id', startId)
      const suffix = qs.toString() ? `?${qs.toString()}` : ''
      const res = await this.request(`${this.baseUrl}/task/${encodeURIComponent(taskId)}/comment${suffix}`)
      if (!res.ok) {
        throw new Error(`ClickUp GET comments for task ${taskId} failed: HTTP ${res.status}`)
      }
      const body = (await res.json()) as { comments?: ClickUpComment[] }
      const batch = Array.isArray(body.comments) ? body.comments : []
      out.push(...batch)
      if (batch.length < COMMENT_PAGE_SIZE) break

      const last = batch[batch.length - 1]
      // Cursor is the oldest comment in the page; stop if it can't advance.
      if (!last?.date || !last?.id || (last.date === start && last.id === startId)) break
      start = last.date
      startId = last.id
    }

    // ClickUp returns newest-first; reverse so imported comments read in order.
    return out.reverse()
  }

  /** A task's attachments come back on the task object itself. */
  async getTaskAttachments(taskId: string): Promise<ClickUpAttachment[]> {
    const res = await this.request(
      `${this.baseUrl}/task/${encodeURIComponent(taskId)}?include_subtasks=false`,
    )
    if (!res.ok) {
      throw new Error(`ClickUp GET task ${taskId} failed: HTTP ${res.status}`)
    }
    const body = (await res.json()) as { attachments?: ClickUpAttachment[] }
    return Array.isArray(body.attachments) ? body.attachments : []
  }

  /**
   * Stream an attachment's bytes. Returns `null` (never throws) on any failure
   * so one broken file is skipped, not fatal. The auth header is only sent to
   * clickup.com hosts so the token never leaks to a third-party CDN.
   */
  async downloadAttachment(att: ClickUpAttachment): Promise<{ buffer: Buffer; contentType: string } | null> {
    const url = att.url_w_query ?? att.url
    if (!url) return null
    try {
      const headers: Record<string, string> = {}
      if (isClickUpHost(urlHost(url))) headers.Authorization = this.apiToken
      const res = await this.fetchImpl(url, {
        headers,
        signal: AbortSignal.timeout(this.downloadTimeoutMs),
      })
      if (!res.ok) return null
      const buffer = Buffer.from(await res.arrayBuffer())
      const contentType = att.mimetype || res.headers.get('content-type') || 'application/octet-stream'
      return { buffer, contentType }
    } catch {
      return null
    }
  }

  /** JSON GET with bounded 429 retry/backoff. */
  private async request(url: string): Promise<Response> {
    let attempt = 0
    for (;;) {
      const res = await this.fetchImpl(url, {
        headers: { Authorization: this.apiToken, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      if (res.status === 429 && attempt < this.maxRetries) {
        attempt++
        const reset = res.headers.get('x-ratelimit-reset') ?? res.headers.get('retry-after')
        await this.sleep(this.backoffMs(reset, attempt))
        continue
      }
      return res
    }
  }

  /** Backoff from a rate-limit header (epoch-seconds or delta-seconds), capped. */
  private backoffMs(header: string | null, attempt: number): number {
    const fallback = 200 * 2 ** attempt
    const parsed = header ? Number(header) : NaN
    let ms: number
    if (Number.isFinite(parsed)) {
      ms = parsed > 1e6 ? parsed * 1000 - Date.now() : parsed * 1000
    } else {
      ms = fallback
    }
    if (!Number.isFinite(ms) || ms < 0) ms = fallback
    return Math.min(ms, 5_000)
  }
}
