import { safeFetch } from '../../../common/http/safe-fetch'

/**
 * ANOTHER TOOL'S API, ASKED WITH ONE PERSON'S GRANT (`found-13-oct/importers-by-sign-in-unbuilt`).
 *
 * ClickUp imports Asana, Jira, Trello, Todoist, Wrike and Monday by signing in
 * to them and reading them over their APIs. Each is asked here the way
 * Basecamp's importer asks Basecamp (`basecamp-api.ts`):
 *
 *   · ONLY ITS OWN ADDRESSES carry the grant. The tool's origins come from
 *     configuration (the real service's by default, the lane's stub on a
 *     lane); an address a response names anywhere else — a next page, a
 *     redirect — is refused, so a grant cannot point this server at anything.
 *   · A FILE may live elsewhere: Asana and Jira hand out a signed address on
 *     their file store. That is fetched only when it is a public address
 *     (`safeFetch`: no private or reserved network, every redirect checked),
 *     and never with the grant.
 *   · A 429 says when to ask again (`Retry-After`), and is waited out a few
 *     times; a 401 is the grant refused, said as such.
 *   · A TOOL THAT COUNTS ITS REQUESTS is not run past its count
 *     (`found-14-oct/clickup-chat-unimported`). ClickUp gives a token 100
 *     requests a minute on most plans and says how many are left of the
 *     window and when it starts again (`X-RateLimit-Remaining`,
 *     `X-RateLimit-Reset`, a Unix time); a token run past it has been reported
 *     shut out for hours. So once a window is spent the next request waits for
 *     its reset, and a 429 is waited out until it — a minute at most a wait,
 *     five times — rather than a moment and failed.
 */

export class AppError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const APP_REFUSALS = {
  refused: (label: string) => `${label} refused the grant: sign in to ${label} again`,
  failed: (label: string, status: number) => `${label} answered ${status}: try again`,
  elsewhere: (label: string) => `${label} named an address that is not its own: refused`,
  unreachable: (label: string) => `${label} could not be reached: try again`,
} as const

export type AppFile = { buffer: Buffer; contentType: string }

/** The longest one wait on a tool's count of requests: its minute's window, and a little. */
export const MOST_RATE_WAIT_MS = 65_000

/** When a tool's window of requests starts again, from `X-RateLimit-Reset`: a Unix time in seconds or milliseconds, or seconds from now. */
export function rateResetAt(raw: string | null, now = Date.now()): number | null {
  const n = Number(raw)
  if (raw === null || raw.trim() === '' || !Number.isFinite(n) || n < 0) return null
  if (n > 1e12) return n
  if (n > 1e9) return n * 1000
  return now + n * 1000
}

/** The most one imported file may hold; a larger one is listed as not imported. */
export const MAX_IMPORTED_FILE_BYTES = 100 * 1024 * 1024

type Fetch = typeof fetch

/** An origin from an address, or null when it is not one. */
export function originOf(url: string): string | null {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null
  } catch {
    return null
  }
}

export class AppHttp {
  private readonly origins: Set<string>
  /** Until when the tool has said its window of requests is spent. */
  private pausedUntil = 0
  /** How a wait is waited: the clock's own; a test's, to see it. */
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))

  constructor(
    readonly label: string,
    origins: string[],
    private readonly headers: Record<string, string>,
    private readonly fetchImpl: Fetch = fetch,
  ) {
    this.origins = new Set(origins.map(originOf).filter((o): o is string => !!o))
  }

  /** The address, if it is one of the tool's own. */
  checked(url: string): string {
    const origin = originOf(url)
    if (!origin || !this.origins.has(origin)) throw new AppError(APP_REFUSALS.elsewhere(this.label))
    return new URL(url).toString()
  }

  isOwn(url: string): boolean {
    const origin = originOf(url)
    return !!origin && this.origins.has(origin)
  }

  async request(url: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}): Promise<Response> {
    let target = this.checked(url)
    for (let attempt = 0, hops = 0; ; ) {
      const paused = this.pausedUntil - Date.now()
      if (paused > 0) await this.sleep(Math.min(paused, MOST_RATE_WAIT_MS))
      let res: Response
      try {
        res = await this.fetchImpl(target, {
          method: init.method ?? 'GET',
          headers: { Accept: 'application/json', ...this.headers, ...(init.headers ?? {}) },
          body: init.body,
          redirect: 'manual',
          signal: AbortSignal.timeout(30_000),
        })
      } catch {
        throw new AppError(APP_REFUSALS.unreachable(this.label), 502)
      }
      this.heed(res)
      if (res.status === 429 && attempt < 5) {
        attempt++
        await this.sleep(this.waitAfter429(res))
        continue
      }
      if (res.status >= 300 && res.status < 400 && res.headers.get('location') && hops < 3) {
        hops++
        // A redirect is followed only to the tool's own addresses, with the grant.
        target = this.checked(new URL(res.headers.get('location')!, target).toString())
        continue
      }
      if (res.status === 401) throw new AppError(APP_REFUSALS.refused(this.label), 401)
      if (!res.ok) throw new AppError(APP_REFUSALS.failed(this.label, res.status), 502)
      return res
    }
  }

  /** A window the tool says is spent pauses what is asked of it next, until the window starts again. */
  private heed(res: Response) {
    const left = Number(res.headers.get('x-ratelimit-remaining') ?? NaN)
    const reset = rateResetAt(res.headers.get('x-ratelimit-reset'))
    if (Number.isFinite(left) && left <= 0 && reset !== null) this.pausedUntil = Math.max(this.pausedUntil, Math.min(reset, Date.now() + MOST_RATE_WAIT_MS))
  }

  /** How long a 429 is waited out: as `Retry-After` says, else until the window's reset, else a second. */
  private waitAfter429(res: Response): number {
    const after = Number(res.headers.get('retry-after') ?? NaN)
    if (Number.isFinite(after) && after >= 0) return Math.min(Math.max(after, 0.2) * 1000, MOST_RATE_WAIT_MS)
    const reset = rateResetAt(res.headers.get('x-ratelimit-reset'))
    if (reset !== null) return Math.min(Math.max(reset - Date.now(), 200), MOST_RATE_WAIT_MS)
    return 1000
  }

  async json<T>(url: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}): Promise<T> {
    const res = await this.request(url, init)
    try {
      return (await res.json()) as T
    } catch {
      throw new AppError(APP_REFUSALS.failed(this.label, res.status), 502)
    }
  }

  /**
   * A file's bytes, or null when it could not be had or is larger than
   * `maxBytes`. On the tool's own address it is asked with the grant, and a
   * redirect off it (to a signed address on a file store) is followed only to
   * a public address, without the grant; anywhere else likewise.
   */
  async file(url: string, maxBytes = MAX_IMPORTED_FILE_BYTES): Promise<AppFile | null> {
    if (!this.isOwn(url)) return publicFile(url, maxBytes)
    let res: Response
    try {
      res = await this.fetchImpl(this.checked(url), { headers: this.headers, redirect: 'manual', signal: AbortSignal.timeout(120_000) })
    } catch {
      return null
    }
    if (res.status >= 300 && res.status < 400) {
      const to = res.headers.get('location')
      if (!to) return null
      const next = new URL(to, url).toString()
      return this.isOwn(next) ? this.file(next, maxBytes) : publicFile(next, maxBytes)
    }
    if (!res.ok) return null
    const declared = Number(res.headers.get('content-length') ?? NaN)
    if (Number.isFinite(declared) && declared > maxBytes) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length > maxBytes) return null
    return { buffer, contentType: res.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream' }
  }
}

async function publicFile(url: string, maxBytes: number): Promise<AppFile | null> {
  try {
    const r = await safeFetch(url, { maxBytes, timeoutMs: 120_000, maxRedirects: 3 })
    if (r.status !== 200) return null
    const type = r.headers['content-type']
    return { buffer: r.body, contentType: (Array.isArray(type) ? type[0] : type)?.split(';')[0]?.trim() || 'application/octet-stream' }
  } catch {
    return null
  }
}

/** Form fields as a body, as OAuth's token endpoints take them. */
export const formBody = (fields: Record<string, string>) => new URLSearchParams(fields).toString()
export const FORM = { 'Content-Type': 'application/x-www-form-urlencoded' }
export const JSON_BODY = { 'Content-Type': 'application/json' }

/** A day (`YYYY-MM-DD`) as that day's start, UTC; an instant as itself; anything else, none. */
export function dateOf(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const v = value.trim()
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** True when a value names a time of day as well as a day. */
export const hasTime = (value: unknown): boolean => typeof value === 'string' && /T\d{2}:\d{2}/.test(value)
