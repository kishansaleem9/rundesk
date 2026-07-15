import { useAuthStore } from '../store/auth'
import { reconnectRealtime } from './realtime'

const API_BASE = '/api/v1'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type Envelope<T> = {
  data: T | null
  meta?: Record<string, unknown>
  error: { status: number; message: string; details?: unknown } | null
}

// Single in-flight refresh promise so a burst of 401s doesn't trigger N refreshes.
let refreshInFlight: Promise<string | null> | null = null

async function performRefresh(): Promise<string | null> {
  const refreshToken = useAuthStore.getState().refreshToken
  if (!refreshToken) return null

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
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
  if (token) headers.set('Authorization', `Bearer ${token}`)

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
 */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const token = useAuthStore.getState().accessToken
  let res = await fetchWithAuth(path, { method: 'GET' }, token)
  if (res.status === 401 && useAuthStore.getState().refreshToken) {
    const newToken = await ensureFreshToken()
    if (newToken) res = await fetchWithAuth(path, { method: 'GET' }, newToken)
    else useAuthStore.getState().clear()
  }
  if (!res.ok) throw new ApiError(res.status, `Download failed (${res.status})`)
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

/** Like downloadFile, but POSTs a JSON body (e.g. a report definition → PDF). */
export async function downloadFilePost(path: string, body: unknown, filename: string): Promise<void> {
  const token = useAuthStore.getState().accessToken
  const init: RequestInit = { method: 'POST', body: JSON.stringify(body) }
  let res = await fetchWithAuth(path, init, token)
  if (res.status === 401 && useAuthStore.getState().refreshToken) {
    const newToken = await ensureFreshToken()
    if (newToken) res = await fetchWithAuth(path, init, newToken)
    else useAuthStore.getState().clear()
  }
  if (!res.ok) throw new ApiError(res.status, `Download failed (${res.status})`)
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

  if (!skipAuth && res.status === 401 && useAuthStore.getState().refreshToken && !path.startsWith('/auth/')) {
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
    throw new ApiError(err.status, err.message, err.details)
  }
  return parsed.data as T
}
