import { useAuthStore } from '../store/auth'
import { reconnectRealtime } from './realtime'
import { filenameFromContentDisposition } from './content-disposition'

const API_BASE = '/api/v1'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
    /** Whether `message` is the API's own, from its envelope, rather than one made up here. */
    public readonly said: boolean = false,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * WHAT A REFUSAL SAYS TO ITS READER (`found-30-sep/download-refusals-say-no-reason`).
 * The API's own sentence when it refused the request itself — a 4xx whose
 * envelope said why: a zip past its cap ("This task's files come to … download
 * them one at a time"), a plan that does not include it, a task that is gone —
 * and `fallback` for anything else: a 401 (the session, not the request), a
 * server error, a proxy's page, no answer. A download used to say only that it
 * failed, whatever the server had said.
 */
export function refusalMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError) || !error.said) return fallback
  if (error.status < 400 || error.status >= 500 || error.status === 401) return fallback
  return error.message.trim() || fallback
}

/**
 * A download the API refused, as an `ApiError` carrying the refusal's envelope —
 * its `message` and `details` — or "Download failed (<status>)" when what came
 * back was not the API's envelope.
 */
async function downloadRefused(res: Response): Promise<ApiError> {
  const text = await res.text().catch(() => '')
  let error: { message?: unknown; details?: unknown } | null = null
  try {
    const body = JSON.parse(text) as { error?: { message?: unknown; details?: unknown } | null } | null
    error = body && typeof body === 'object' ? body.error ?? null : null
  } catch {
    /* not the API's envelope: a proxy's page, or no body */
  }
  const said = typeof error?.message === 'string' && error.message.trim() !== ''
  return said
    ? new ApiError(res.status, error!.message as string, error!.details, true)
    : new ApiError(res.status, `Download failed (${res.status})`)
}

/**
 * How long a refusal for too many requests asks to wait, in whole seconds, or
 * null when the error is not one. The rate limiter answers 429 with
 * `details.retryAfter` beside its `Retry-After` header
 * (`found-30-sep/public-pages-read-429-as-gone`); a 429 without it waits five.
 */
export function retryAfterSeconds(error: unknown): number | null {
  if (!(error instanceof ApiError) || error.status !== 429) return null
  const seconds = Number((error.details as { retryAfter?: unknown } | null | undefined)?.retryAfter)
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 5
}

type Envelope<T> = {
  data: T | null
  meta?: Record<string, unknown>
  error: { status: number; message: string; details?: unknown } | null
}

// Methods that mutate state must carry the double-submit CSRF header when the
// session is cookie-authenticated (the server ignores it for Bearer requests).
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const CSRF_COOKIE = 'csrf_token'

/** Read a non-httpOnly cookie value from document.cookie (browser only). */
function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const escaped = name.replace(/([.*+?^${}()|[\]\\])/g, '\\$1')
  const match = document.cookie.match(new RegExp('(?:^|; )' + escaped + '=([^;]*)'))
  return match ? decodeURIComponent(match[1]) : null
}

/** The header the API reads a writer's zone from (`writerZone`, `task-values.ts`). */
const TIME_ZONE_HEADER = 'X-Time-Zone'

/** This browser's IANA zone, or null where the runtime will not say. */
function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

// Single in-flight refresh promise so a burst of 401s doesn't trigger N refreshes.
let refreshInFlight: Promise<string | null> | null = null

async function performRefresh(): Promise<string | null> {
  // During the localStorage→cookie transition a stored refresh token may still
  // exist; send it if present. Otherwise the server reads the refresh_token
  // httpOnly cookie (credentials: 'include'), so cookie-only sessions refresh too.
  const refreshToken = useAuthStore.getState().refreshToken

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const csrf = readCookie(CSRF_COOKIE)
    if (csrf) headers['X-CSRF-Token'] = csrf
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(refreshToken ? { refreshToken } : {}),
    })
    if (!res.ok) return null
    const body = (await res.json()) as Envelope<{
      accessToken: string
      refreshToken: string
      user: { id: string; email: string; displayName: string; role: string }
    }>
    if (!body.data) return null

    useAuthStore.getState().setSession(
      body.data.user,
      body.data.accessToken,
      body.data.refreshToken,
    )
    reconnectRealtime()
    return body.data.accessToken
  } catch {
    return null
  }
}

async function ensureFreshToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

async function fetchWithAuth(path: string, init: RequestInit, token: string | null) {
  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json')
  }
  // Bearer is still sent when a token is available (transition + API clients).
  if (token) headers.set('Authorization', `Bearer ${token}`)

  // Attach the CSRF header for unsafe methods so cookie-authenticated mutations
  // pass the server's double-submit check. Harmless for Bearer requests (the
  // server exempts them). Skipped when no csrf_token cookie is present.
  const method = (init.method ?? 'GET').toUpperCase()
  if (UNSAFE_METHODS.has(method) && !headers.has('X-CSRF-Token')) {
    const csrf = readCookie(CSRF_COOKIE)
    if (csrf) headers.set('X-CSRF-Token', csrf)
  }
  // Every write says the zone its dates were read in, which is this browser's:
  // the app shows every date in it (`task-dates.ts`), and the server orders a
  // day with no time beside a moment as the writer sees them
  // (`found-30-sep/a-task-starts-after-it-is-due`, `startsAfterDue`).
  if (UNSAFE_METHODS.has(method) && !headers.has(TIME_ZONE_HEADER)) {
    const zone = browserTimeZone()
    if (zone) headers.set(TIME_ZONE_HEADER, zone)
  }

  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })
}

type ApiOptions = Omit<RequestInit, 'body'> & {
  body?: unknown
  skipAuth?: boolean
}

/**
 * Download a file from an authenticated API route as a Blob and save it.
 * Browser <a download> navigations can't send the Authorization header (the JWT
 * is header-only), so file exports must go through fetch with the bearer token.
 *
 * Without a `filename`, it is saved under the name the response gives
 * (`Content-Disposition`), so a name the server works out — a task's "Download
 * all" is named after the task, a list's export after the list, a doc's after
 * the doc — is not worked out a second time here
 * (`found-30-sep/list-export-saved-as-list-csv`).
 *
 * Refused, it throws the refusal's own words (`refusalMessage` shows them).
 */
export async function downloadFile(path: string, filename?: string): Promise<void> {
  const token = useAuthStore.getState().accessToken
  let res = await fetchWithAuth(path, { method: 'GET' }, token)
  if (res.status === 401 && useAuthStore.getState().isAuthenticated()) {
    const newToken = await ensureFreshToken()
    if (newToken) res = await fetchWithAuth(path, { method: 'GET' }, newToken)
    else useAuthStore.getState().clear()
  }
  if (!res.ok) throw await downloadRefused(res)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? filenameFromContentDisposition(res.headers.get('content-disposition')) ?? 'download'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Like downloadFile, but POSTs a JSON body (e.g. a report definition → PDF). */
export async function downloadFilePost(path: string, body: unknown, filename: string): Promise<void> {
  const token = useAuthStore.getState().accessToken
  const init: RequestInit = { method: 'POST', body: JSON.stringify(body) }
  let res = await fetchWithAuth(path, init, token)
  if (res.status === 401 && useAuthStore.getState().isAuthenticated()) {
    const newToken = await ensureFreshToken()
    if (newToken) res = await fetchWithAuth(path, init, newToken)
    else useAuthStore.getState().clear()
  }
  if (!res.ok) throw await downloadRefused(res)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function api<T = unknown>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const { skipAuth, body, ...init } = options

  // Serialize body — accept pre-stringified strings (legacy callers) or plain objects
  const rawInit: RequestInit = { ...init }
  if (body !== undefined) {
    rawInit.body = typeof body === 'string' ? body : JSON.stringify(body)
  }

  const token = skipAuth ? null : useAuthStore.getState().accessToken
  let res = await fetchWithAuth(path, rawInit, token)

  if (!skipAuth && res.status === 401 && useAuthStore.getState().isAuthenticated() && !path.startsWith('/auth/')) {
    const newToken = await ensureFreshToken()
    if (newToken) {
      res = await fetchWithAuth(path, rawInit, newToken)
    } else {
      useAuthStore.getState().clear()
    }
  }

  const text = await res.text()
  let parsed: Envelope<T>
  if (!text) {
    parsed = { data: null, error: null }
  } else {
    try {
      const raw = JSON.parse(text)
      if (
        raw === null ||
        typeof raw !== 'object' ||
        !('data' in raw) ||
        !('error' in raw)
      ) {
        throw new ApiError(
          res.ok ? 502 : res.status,
          'Unexpected API response (not JSON from Rundesk API). Check that the Nest server is running and that Vite proxies /api to the correct origin (VITE_DEV_API_ORIGIN, default port 3001).',
          { status: res.status, snippet: text.slice(0, 240) },
        )
      }
      parsed = raw as Envelope<T>
    } catch (e) {
      if (e instanceof ApiError) throw e
      throw new ApiError(
        res.ok ? 502 : res.status,
        `Invalid JSON from API: ${e instanceof Error ? e.message : String(e)}`,
        { status: res.status, snippet: text.slice(0, 240) },
      )
    }
  }

  if (!res.ok || parsed.error) {
    const err = parsed.error ?? { status: res.status, message: res.statusText }
    throw new ApiError(err.status, err.message, err.details, !!parsed.error)
  }
  return parsed.data as T
}
