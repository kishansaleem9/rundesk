import { AppError, APP_REFUSALS, formBody, FORM, JSON_BODY, originOf } from './app-http'
import type { ImExtras, ImNode, ImPerson } from './import-tree'

/**
 * ONE TOOL, AS ITS IMPORTER SIGNS IN TO IT AND READS IT
 * (`found-13-oct/importers-by-sign-in-unbuilt`).
 */

export const APP_KEYS = ['asana', 'jira', 'trello', 'todoist', 'wrike', 'monday', 'clickup'] as const
export type AppKey = (typeof APP_KEYS)[number]
export const isAppKey = (v: unknown): v is AppKey => typeof v === 'string' && (APP_KEYS as readonly string[]).includes(v)

export type GrantToken = { accessToken: string; refreshToken: string | null; expiresAt: Date | null; extra?: Record<string, unknown> }
export type AppGrant = { accessToken: string; account: Record<string, unknown> }
export type AppSource = { id: string; name: string }
export type AppProject = { id: string; name: string; detail?: string | null }
/** A choice the import page offers, as ClickUp's wizard does: its key, the values it takes, and the one it starts on. */
export type AppOption = { key: string; choices: string[]; default: string }

export interface AppReader {
  /** Where the tool keeps what may be imported: Asana's workspaces, Jira's sites, Trello's Workspaces… */
  sources(): Promise<AppSource[]>
  /** What may be chosen in one of them: projects, boards, spaces. */
  projects(source: string): Promise<AppProject[]>
  /** Who is in them, for the importer to map to members here. */
  people(source: string, projectIds: string[]): Promise<ImPerson[]>
  /** One chosen project, read into the shape Rundesk writes. */
  read(source: string, project: AppProject, options: Record<string, string>): Promise<ImNode>
  /** What the tool keeps for the whole account, not in a project — ClickUp's Workspace Docs and Goals — read once a run, after its projects. */
  extras?(source: string, options: Record<string, string>): Promise<ImExtras>
}

export type AppDef = {
  key: AppKey
  label: string
  /** A new Space's icon. */
  icon: string
  /** How the person signs in: OAuth's way there and back, Trello's token on the way back, or a pasted token (Monday). */
  auth: 'oauth' | 'trello' | 'token'
  /** The settings the server needs before anyone may sign in. */
  env: string[]
  options: AppOption[]
  /** What the tool holds that does not come in, in words — as ClickUp's import of it leaves it. */
  notImported: string[]
  authorizeUrl?(redirectUri: string, state: string): string
  exchange?(code: string, redirectUri: string): Promise<GrantToken>
  refresh?(refreshToken: string, redirectUri: string): Promise<GrantToken>
  /** Whose grant it is, and what of the tool it opens (kept with the grant). */
  identify(token: GrantToken): Promise<{ name: string; email: string | null; account: Record<string, unknown> }>
  reader(grant: AppGrant): AppReader
}

/** A setting, or the real service's address when none is set. */
export const setting = (name: string, fallback: string): string => (process.env[name] || fallback).replace(/\/$/, '')
export const envMissing = (names: string[]): string[] => names.filter((k) => !process.env[k])

/**
 * A code (or a refresh token) exchanged at the tool's token endpoint. A 400 or
 * 401 there is the grant refused, said as such; anything else, the tool's.
 */
export async function oauthToken(
  label: string,
  url: string,
  fields: Record<string, string>,
  how: 'form' | 'json' = 'form',
  fetchImpl: typeof fetch = fetch,
): Promise<GrantToken> {
  if (!originOf(url)) throw new AppError(APP_REFUSALS.elsewhere(label))
  let res: Response
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { Accept: 'application/json', ...(how === 'json' ? JSON_BODY : FORM) },
      body: how === 'json' ? JSON.stringify(fields) : formBody(fields),
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new AppError(APP_REFUSALS.unreachable(label), 502)
  }
  if (res.status === 400 || res.status === 401) throw new AppError(APP_REFUSALS.refused(label), 401)
  if (!res.ok) throw new AppError(APP_REFUSALS.failed(label, res.status), 502)
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>
  const accessToken = typeof raw.access_token === 'string' ? raw.access_token : ''
  if (!accessToken) throw new AppError(APP_REFUSALS.refused(label), 401)
  const expiresIn = Number(raw.expires_in)
  return {
    accessToken,
    refreshToken: typeof raw.refresh_token === 'string' ? raw.refresh_token : null,
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null,
    extra: raw,
  }
}

/** A column, group or status whose name says the work in it is finished. */
export const doneLike = (name: string | null | undefined): boolean =>
  /^(done|complete|completed|finished|closed|resolved|shipped)$/i.test(String(name ?? '').trim())

/** Who someone is, from a tool's person: a key of the tool's own, their name and their email when it shows it. */
export const person = (app: AppKey, id: unknown, name: unknown, email: unknown): ImPerson => ({
  key: `${app}:${String(id)}`,
  name: typeof name === 'string' && name.trim() ? name.trim() : null,
  email: typeof email === 'string' && email.includes('@') ? email.trim().toLowerCase() : null,
})
