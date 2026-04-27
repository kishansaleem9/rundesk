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
  const parsed: Envelope<T> = text ? JSON.parse(text) : { data: null, error: null }

  if (!res.ok || parsed.error) {
    const err = parsed.error ?? { status: res.status, message: res.statusText }
    throw new ApiError(err.status, err.message, err.details)
  }
  return parsed.data as T
}
