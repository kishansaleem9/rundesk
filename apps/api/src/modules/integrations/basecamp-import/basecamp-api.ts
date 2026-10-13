/**
 * BASECAMP 3, READ FOR AN IMPORT (`commit-log/log-601eacc-2`).
 *
 * ClickUp imports Basecamp by signing in to it — "in the pop-up, log in to
 * your Basecamp account", Basecamp 3 only — and reads its projects and teams,
 * their to-do lists, to-dos and comments (help centre, "Import from Basecamp",
 * read through search excerpts, 13 October). This is that reading, over
 * Basecamp's own API (github.com/basecamp/bc3-api):
 *
 *   · Launchpad signs the person in: `authorization/new` (type=web_server),
 *     the code exchanged at `authorization/token`, refreshed there with
 *     type=refresh; `authorization.json` says whose grant it is and which
 *     Basecamp accounts it opens (product `bc3`, each with its API `href`);
 *   · each account: `projects.json` (a project's or team's "dock" names its
 *     to-do set), the to-do set's `todolists_url`, each list's `todos_url`
 *     (open to-dos, and `?completed=true` for the done ones) and
 *     `groups_url`, and a to-do's `comments_url`.
 *
 * Every list is paged: Basecamp says where the next page is in a `Link`
 * header, `rel="next"`, which is followed to the end. A 429 says when to ask
 * again (`Retry-After`), and is waited out a few times. Basecamp asks every
 * caller to say who it is in `User-Agent`.
 *
 * WHERE IT IS ASKED IS CHECKED: Launchpad names each account's API address,
 * and only an address on Basecamp's API origin (`BASECAMP_API_ORIGIN`, set to
 * the stub on a lane) is followed, so a grant cannot point this server at
 * anything else.
 */

export const BASECAMP_REFUSALS = {
  notConfigured: (missing: string[]) => `Basecamp is not set up on this server — missing backend configuration: ${missing.join(', ')}`,
  refused: 'Basecamp refused the grant: sign in to Basecamp again',
  notConnected: 'Sign in to Basecamp first',
  noAccount: 'That Basecamp account is not one this grant opens',
  elsewhere: 'Basecamp named an address that is not its API: refused',
  failed: (status: number) => `Basecamp answered ${status}: try again`,
} as const

export class BasecampError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message)
    this.name = 'BasecampError'
  }
}

export type BasecampToken = { accessToken: string; refreshToken: string | null; expiresAt: Date | null }
export type BasecampAccount = { id: string; name: string; href: string }
export type BasecampIdentity = { id: string; name: string; email: string | null; accounts: BasecampAccount[] }

type Fetch = typeof fetch

export const basecampEnvMissing = (): string[] => ['BASECAMP_CLIENT_ID', 'BASECAMP_CLIENT_SECRET'].filter((k) => !process.env[k])
export const launchpadUrl = (): string => (process.env.BASECAMP_LAUNCHPAD_URL ?? 'https://launchpad.37signals.com').replace(/\/$/, '')
export const apiOrigin = (): string => new URL(process.env.BASECAMP_API_ORIGIN ?? 'https://3.basecampapi.com').origin
const userAgent = (): string => process.env.BASECAMP_USER_AGENT ?? 'Rundesk importer (https://rundesk.app)'

/** Where the person signs in to Basecamp, carrying the signed state back. */
export function basecampAuthorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({ type: 'web_server', client_id: process.env.BASECAMP_CLIENT_ID ?? '', redirect_uri: redirectUri, state })
  return `${launchpadUrl()}/authorization/new?${params.toString()}`
}

async function tokenRequest(params: Record<string, string>, fetchImpl: Fetch): Promise<BasecampToken> {
  const query = new URLSearchParams({
    ...params,
    client_id: process.env.BASECAMP_CLIENT_ID ?? '',
    client_secret: process.env.BASECAMP_CLIENT_SECRET ?? '',
  })
  const res = await fetchImpl(`${launchpadUrl()}/authorization/token?${query.toString()}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'User-Agent': userAgent() },
    signal: AbortSignal.timeout(20_000),
  })
  if (res.status === 400 || res.status === 401) throw new BasecampError(BASECAMP_REFUSALS.refused, 401)
  if (!res.ok) throw new BasecampError(BASECAMP_REFUSALS.failed(res.status), 502)
  const raw = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number }
  if (!raw.access_token) throw new BasecampError(BASECAMP_REFUSALS.refused, 401)
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token ?? null,
    expiresAt: raw.expires_in ? new Date(Date.now() + raw.expires_in * 1000) : null,
  }
}

export function exchangeBasecampCode(code: string, redirectUri: string, fetchImpl: Fetch = fetch): Promise<BasecampToken> {
  return tokenRequest({ type: 'web_server', code, redirect_uri: redirectUri }, fetchImpl)
}

export async function refreshBasecampToken(refreshToken: string, redirectUri: string, fetchImpl: Fetch = fetch): Promise<BasecampToken> {
  const fresh = await tokenRequest({ type: 'refresh', refresh_token: refreshToken, redirect_uri: redirectUri }, fetchImpl)
  // Launchpad keeps the refresh token across a refresh.
  return { ...fresh, refreshToken: fresh.refreshToken ?? refreshToken }
}

/** Whose grant it is, and the Basecamp 3 accounts it opens. */
export async function basecampIdentity(accessToken: string, fetchImpl: Fetch = fetch): Promise<BasecampIdentity> {
  const res = await fetchImpl(`${launchpadUrl()}/authorization.json`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'User-Agent': userAgent() },
    signal: AbortSignal.timeout(20_000),
  })
  if (res.status === 401) throw new BasecampError(BASECAMP_REFUSALS.refused, 401)
  if (!res.ok) throw new BasecampError(BASECAMP_REFUSALS.failed(res.status), 502)
  const raw = (await res.json()) as {
    identity?: { id?: number | string; first_name?: string; last_name?: string; email_address?: string }
    accounts?: Array<{ product?: string; id?: number | string; name?: string; href?: string }>
  }
  const who = raw.identity ?? {}
  return {
    id: String(who.id ?? ''),
    name: [who.first_name, who.last_name].filter(Boolean).join(' ') || who.email_address || 'Basecamp',
    email: who.email_address?.toLowerCase() ?? null,
    accounts: (raw.accounts ?? [])
      .filter((a) => a.product === 'bc3' && a.href)
      .map((a) => ({ id: String(a.id), name: a.name ?? String(a.id), href: String(a.href).replace(/\/$/, '') })),
  }
}

export type BcPerson = { id?: number; name?: string; email_address?: string }
export type BcProject = { id: number; name: string; description?: string | null; purpose?: string; dock?: Array<{ name?: string; url?: string; enabled?: boolean }> }
export type BcTodolist = { id: number; name?: string; title?: string; description?: string | null; todos_url?: string; groups_url?: string }
export type BcTodo = {
  id: number
  content?: string
  title?: string
  description?: string | null
  completed?: boolean
  due_on?: string | null
  starts_on?: string | null
  assignees?: BcPerson[]
  comments_count?: number
  comments_url?: string
  completion?: { created_at?: string } | null
}
export type BcComment = { id: number; content?: string; created_at?: string; creator?: BcPerson }

/** One Basecamp account's API, read with one person's token. */
export class BasecampClient {
  private readonly origin = apiOrigin()

  constructor(
    private readonly token: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  private checked(url: string): string {
    let u: URL
    try {
      u = new URL(url)
    } catch {
      throw new BasecampError(BASECAMP_REFUSALS.elsewhere)
    }
    if (u.origin !== this.origin) throw new BasecampError(BASECAMP_REFUSALS.elsewhere)
    return u.toString()
  }

  private async request(url: string): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const res = await this.fetchImpl(this.checked(url), {
        headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json', 'User-Agent': userAgent() },
        signal: AbortSignal.timeout(30_000),
      })
      if (res.status === 429 && attempt < 3) {
        const wait = Math.min(Number(res.headers.get('retry-after') ?? 1), 10)
        await new Promise((r) => setTimeout(r, Math.max(wait, 0.2) * 1000))
        continue
      }
      if (res.status === 401) throw new BasecampError(BASECAMP_REFUSALS.refused, 401)
      if (!res.ok) throw new BasecampError(BASECAMP_REFUSALS.failed(res.status), 502)
      return res
    }
  }

  async get<T>(url: string): Promise<T> {
    return (await (await this.request(url)).json()) as T
  }

  /** Every page of a list, following `Link: <…>; rel="next"` to the end. */
  async all<T>(url: string, maxPages = 200): Promise<T[]> {
    const out: T[] = []
    let next: string | null = url
    for (let page = 0; next && page < maxPages; page++) {
      const res = await this.request(next)
      const rows = (await res.json()) as T[]
      if (Array.isArray(rows)) out.push(...rows)
      next = nextLink(res.headers.get('link'))
    }
    return out
  }

  projects(account: BasecampAccount): Promise<BcProject[]> {
    return this.all<BcProject>(`${account.href}/projects.json`)
  }

  /** A project's to-do lists, through the to-do set its dock names; none when its to-dos are switched off. */
  async todolists(project: BcProject): Promise<BcTodolist[]> {
    const dock = (project.dock ?? []).find((d) => d.name === 'todoset' && d.enabled !== false && d.url)
    if (!dock?.url) return []
    const todoset = await this.get<{ todolists_url?: string }>(dock.url)
    return todoset.todolists_url ? this.all<BcTodolist>(todoset.todolists_url) : []
  }

  /** A list's to-dos: the open ones, then the done ones. */
  async todos(todosUrl: string): Promise<BcTodo[]> {
    const open = await this.all<BcTodo>(todosUrl)
    const done = await this.all<BcTodo>(`${todosUrl}${todosUrl.includes('?') ? '&' : '?'}completed=true`)
    return [...open, ...done]
  }

  groups(list: BcTodolist): Promise<BcTodolist[]> {
    return list.groups_url ? this.all<BcTodolist>(list.groups_url) : Promise.resolve([])
  }

  comments(todo: BcTodo): Promise<BcComment[]> {
    return todo.comments_url && (todo.comments_count ?? 1) > 0 ? this.all<BcComment>(todo.comments_url) : Promise.resolve([])
  }
}

/** The `rel="next"` address in a `Link` header. */
export function nextLink(header: string | null): string | null {
  if (!header) return null
  for (const part of header.split(',')) {
    const m = /<([^>]+)>\s*;\s*rel="?next"?/i.exec(part)
    if (m) return m[1]
  }
  return null
}
