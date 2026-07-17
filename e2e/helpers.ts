import { APIRequestContext, Page, expect } from '@playwright/test'

export const BASE = process.env.PW_BASE_URL || 'https://rundesk.theaura.agency'
export const API = `${BASE}/api/v1`
export const EMAIL = process.env.E2E_EMAIL || 'test@yopmail.com'
export const PASSWORD = process.env.E2E_PASSWORD || 'Test@123456'
export const MEMBER_EMAIL = process.env.E2E_MEMBER_EMAIL || ''
export const MEMBER_PASSWORD = process.env.E2E_MEMBER_PASSWORD || ''

let counter = 0
export const uniq = (p: string) => `zz-e2e ${p} ${Date.now().toString(36)}-${counter++}`

// ── API helpers (used for fast, reliable setup + teardown) ───────────────────
const unwrap = (j: any) => (j && typeof j === 'object' && 'data' in j ? j.data : j)

type LoginResult = { token: string; workspaces: Array<{ id: string; name: string; role: string }> }
// Memoise per credential: the suite logs in from ONE IP across many specs, and
// the API enforces a per-IP login rate limit (10/min). Re-using the token keeps
// the whole run well under the limit instead of tripping 429s.
const loginCache = new Map<string, LoginResult>()

export async function apiLogin(request: APIRequestContext, email = EMAIL, password = PASSWORD): Promise<LoginResult> {
  const cacheKey = `${email}::${password}`
  const cached = loginCache.get(cacheKey)
  if (cached) return cached
  // Retry transient 5xx/connection errors (API warming up after a deploy) AND a
  // 429 (per-IP login rate limit) — for 429 we wait out the ~60s window.
  let res = await request.post(`${API}/auth/login`, { data: { email, password } })
  for (let attempt = 0; attempt < 8 && !res.ok() && [0, 429, 500, 502, 503, 504].includes(res.status()); attempt++) {
    await new Promise((r) => setTimeout(r, res.status() === 429 ? 62_000 : 2000))
    res = await request.post(`${API}/auth/login`, { data: { email, password } })
  }
  expect(res.ok(), `API login failed (${res.status()}) for ${email}`).toBeTruthy()
  const d = unwrap(await res.json())
  const out: LoginResult = { token: d.accessToken as string, workspaces: (d.workspaces ?? []) as LoginResult['workspaces'] }
  loginCache.set(cacheKey, out)
  return out
}

const h = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' })

export async function apiGet(request: APIRequestContext, token: string, path: string) {
  return unwrap(await (await request.get(`${API}${path}`, { headers: h(token) })).json())
}
export async function apiPost(request: APIRequestContext, token: string, path: string, data: any) {
  const res = await request.post(`${API}${path}`, { headers: h(token), data })
  expect(res.ok(), `POST ${path} → ${res.status()}`).toBeTruthy()
  return unwrap(await res.json())
}
export async function apiDelete(request: APIRequestContext, token: string, path: string) {
  await request.delete(`${API}${path}`, { headers: h(token) }).catch(() => undefined)
}

export type Tree = { wsId: string; spaceId: string; projectId: string; listId: string }

export async function createTree(request: APIRequestContext, token: string, wsId: string): Promise<Tree> {
  const space = await apiPost(request, token, '/spaces', { workspaceId: wsId, name: uniq('space') })
  const project = await apiPost(request, token, '/projects', { spaceId: space.id, name: uniq('project') })
  const list = await apiPost(request, token, '/lists', { projectId: project.id, name: uniq('list') })
  return { wsId, spaceId: space.id, projectId: project.id, listId: list.id }
}
export async function deleteTree(request: APIRequestContext, token: string, t: Partial<Tree>) {
  if (t.spaceId) await apiDelete(request, token, `/spaces/${t.spaceId}`) // cascades projects/lists/tasks
}

export const boardUrl = (t: Tree) => `/app/${t.wsId}/${t.spaceId}/${t.projectId}/${t.listId}`

// ── UI helpers ───────────────────────────────────────────────────────────────
export async function uiLogin(page: Page, email = EMAIL, password = PASSWORD) {
  // Retry the UI login if it doesn't navigate — the usual cause on a shared-IP
  // run is the per-IP login rate limit (429), which the login page surfaces as
  // an error instead of navigating. Wait out the ~60s window and retry.
  for (let attempt = 0; ; attempt++) {
    await page.goto('/login')
    await page.locator('#email').fill(email)
    await page.locator('#password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    try {
      await page.waitForURL(/\/app(\/|$)/, { timeout: 30_000 })
      return
    } catch (err) {
      if (attempt >= 3) throw err
      await page.waitForTimeout(62_000)
    }
  }
}
