import { AppError, AppHttp, APP_REFUSALS, dateOf, hasTime } from './app-http'
import { oauthToken, person, setting, type AppDef, type AppGrant, type AppProject, type AppReader, type GrantToken } from './app-def'
import { imTask, type ImFieldValue, type ImFolder, type ImList, type ImNode, type ImPerson, type ImPriority, type ImStatus, type ImTask } from './import-tree'
import { htmlToMarkdown } from './rich-text'

/**
 * WRIKE, IMPORTED AS CLICKUP IMPORTS IT (`found-13-oct/importers-by-sign-in-unbuilt`).
 *
 * ClickUp signs in to Wrike "in a pop-up" and matches Wrike's SPACES to
 * Spaces, new or existing. "Top-level folders become ClickUp Folders, and
 * nested folders with tasks and projects are converted to Lists inside the
 * Folder"; a project "imports as a List", in a folder or not. "Workflows in
 * Wrike are equivalent to statuses in ClickUp. We will scan all tasks in a
 * List and add those flows as statuses on the List level." Comments,
 * assignees, attachments and "all subtasks and nested subtasks" come in;
 * formula and percentage fields do not. (Help centre, "Import from Wrike",
 * read through search excerpts, 13 October.)
 *
 * Over Wrike's API v4 (developers.wrike.com): OAuth 2.0 at
 * login.wrike.com, whose token answer names the HOST the account lives on —
 * the API is that host's, and only a host of wrike.com is taken
 * (`WRIKE_API_URL` stands in for it on a lane). `account`, `contacts`,
 * `spaces`, a space's `folders` tree, `workflows`, `customfields`, a folder's
 * `tasks` (paged by `nextPageToken`), a task's `comments` and `attachments`.
 */

const authUrl = () => setting('WRIKE_AUTH_URL', 'https://login.wrike.com/oauth2/authorize/v4')
const tokenUrl = () => setting('WRIKE_TOKEN_URL', 'https://login.wrike.com/oauth2/token')

/** The API of the host the account lives on: a wrike.com host, or the one configured. */
export function wrikeApi(host: unknown): string {
  if (process.env.WRIKE_API_URL) return setting('WRIKE_API_URL', '')
  const h = typeof host === 'string' ? host.trim().toLowerCase() : ''
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.wrike\.com$/.test(h)) throw new AppError(APP_REFUSALS.elsewhere('Wrike'))
  return `https://${h}/api/v4`
}

type WrFolder = { id: string; title: string; childIds?: string[]; scope?: string; project?: unknown }
type WrTask = {
  id: string
  title?: string
  description?: string
  status?: string
  importance?: string
  customStatusId?: string
  createdDate?: string
  completedDate?: string | null
  dates?: { start?: string; due?: string }
  responsibleIds?: string[]
  subTaskIds?: string[]
  superTaskIds?: string[]
  customFields?: Array<{ id: string; value?: string }>
  attachmentCount?: number
}

const PRIORITY: Record<string, ImPriority> = { High: 'high', Normal: 'normal', Low: 'low' }
const GROUP: Record<string, ImStatus['category']> = { Active: 'open', Deferred: 'open', Completed: 'closed', Cancelled: 'closed' }

export const WRIKE: AppDef = {
  key: 'wrike',
  label: 'Wrike',
  icon: '✳️',
  auth: 'oauth',
  env: ['WRIKE_CLIENT_ID', 'WRIKE_CLIENT_SECRET'],
  options: [],
  notImported: ['Formula and percentage fields, as ClickUp’s Wrike import leaves them', 'Comments on attachments', 'Time logs, dashboards and reports'],
  authorizeUrl: (redirectUri, state) =>
    `${authUrl()}?${new URLSearchParams({ client_id: process.env.WRIKE_CLIENT_ID ?? '', response_type: 'code', redirect_uri: redirectUri, state, scope: 'Default' }).toString()}`,
  exchange: (code, redirectUri) =>
    oauthToken('Wrike', tokenUrl(), {
      client_id: process.env.WRIKE_CLIENT_ID ?? '',
      client_secret: process.env.WRIKE_CLIENT_SECRET ?? '',
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  refresh: async (refreshToken) => {
    const fresh = await oauthToken('Wrike', tokenUrl(), {
      client_id: process.env.WRIKE_CLIENT_ID ?? '',
      client_secret: process.env.WRIKE_CLIENT_SECRET ?? '',
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    })
    return { ...fresh, refreshToken: fresh.refreshToken ?? refreshToken }
  },
  identify: async (token: GrantToken) => {
    const host = token.extra?.host
    const api = wrikeApi(host)
    const http = new AppHttp('Wrike', [api], { Authorization: `Bearer ${token.accessToken}` })
    const me = (await http.json<{ data?: Array<{ id: string; firstName?: string; lastName?: string; profiles?: Array<{ email?: string }> }> }>(`${api}/contacts?me=true`)).data?.[0]
    const account = (await http.json<{ data?: Array<{ id?: string; name?: string }> }>(`${api}/account`)).data?.[0]
    const name = [me?.firstName, me?.lastName].filter(Boolean).join(' ')
    return { name: name || me?.profiles?.[0]?.email || 'Wrike', email: me?.profiles?.[0]?.email ?? null, account: { host: typeof host === 'string' ? host : null, accountName: account?.name ?? 'Wrike' } }
  },
  reader: (grant: AppGrant) => new WrikeReader(grant.accessToken, grant.account),
}

class WrikeReader implements AppReader {
  private readonly http: AppHttp
  private readonly api: string

  constructor(
    token: string,
    private readonly account: Record<string, unknown>,
  ) {
    this.api = wrikeApi(account.host)
    this.http = new AppHttp('Wrike', [this.api], { Authorization: `Bearer ${token}` })
  }

  private async data<T>(path: string): Promise<T[]> {
    return (await this.http.json<{ data?: T[] }>(`${this.api}${path}`)).data ?? []
  }

  async sources() {
    return [{ id: 'wrike', name: String(this.account.accountName ?? 'Wrike') }]
  }

  async projects(): Promise<AppProject[]> {
    return (await this.data<{ id: string; title: string }>('/spaces')).map((s) => ({ id: s.id, name: s.title }))
  }

  async people() {
    const rows = await this.data<{ id: string; firstName?: string; lastName?: string; type?: string; profiles?: Array<{ email?: string }> }>('/contacts')
    return rows.filter((c) => c.type !== 'Group').map((c) => person('wrike', c.id, [c.firstName, c.lastName].filter(Boolean).join(' '), c.profiles?.[0]?.email))
  }

  async read(_source: string, space: AppProject): Promise<ImNode> {
    const tree = await this.data<WrFolder>(`/spaces/${encodeURIComponent(space.id)}/folders`)
    const workflows = await this.data<{ customStatuses?: Array<{ id: string; name: string; group?: string }> }>('/workflows')
    const statusOf = new Map<string, { name: string; group: string; order: number }>()
    let order = 0
    for (const w of workflows) for (const s of w.customStatuses ?? []) statusOf.set(s.id, { name: s.name, group: s.group ?? 'Active', order: order++ })
    const fieldsMeta = new Map((await this.data<{ id: string; title: string; type: string }>('/customfields')).map((f) => [f.id, f]))
    const people = new Map((await this.people()).map((p) => [p.key, p]))

    const byId = new Map(tree.filter((f) => f.id !== space.id).map((f) => [f.id, f]))
    const children = new Set(tree.flatMap((f) => f.childIds ?? []))
    const top = [...byId.values()].filter((f) => !children.has(f.id) || tree.some((p) => p.id === space.id && (p.childIds ?? []).includes(f.id)))
    const descendants = (f: WrFolder, depth = 0): WrFolder[] =>
      depth > 20 ? [] : (f.childIds ?? []).map((id) => byId.get(id)).filter((c): c is WrFolder => !!c).flatMap((c) => [c, ...descendants(c, depth + 1)])

    const ctx = { statusOf, fieldsMeta, people }
    const folders: ImFolder[] = []
    const lists: ImList[] = []
    for (const f of top) {
      if (f.project) {
        // A project at the top is a List, its sub-folders' tasks in it.
        lists.push(await this.list(f, true, ctx))
        continue
      }
      const inner: ImList[] = []
      const own = await this.list(f, false, ctx)
      if (own.tasks.length) inner.push(own)
      for (const d of descendants(f)) {
        const l = await this.list(d, false, ctx)
        if (l.tasks.length || d.project) inner.push(l)
      }
      folders.push({ name: f.title, lists: inner })
    }
    return { kind: 'space', name: space.name, folders, lists }
  }

  /** A folder's or project's tasks as a List, its statuses the workflow statuses its tasks are in. */
  private async list(
    f: WrFolder,
    deep: boolean,
    ctx: { statusOf: Map<string, { name: string; group: string; order: number }>; fieldsMeta: Map<string, { id: string; title: string; type: string }>; people: Map<string, ImPerson> },
  ): Promise<ImList> {
    const rows: WrTask[] = []
    let next: string | null = null
    for (let page = 0; page < 200; page++) {
      const q = new URLSearchParams({
        descendants: deep ? 'true' : 'false',
        subTasks: 'true',
        pageSize: '500',
        fields: JSON.stringify(['responsibleIds', 'description', 'subTaskIds', 'superTaskIds', 'customFields', 'attachmentCount']),
      })
      if (next) q.set('nextPageToken', next)
      const body = await this.http.json<{ data?: WrTask[]; nextPageToken?: string }>(`${this.api}/folders/${encodeURIComponent(f.id)}/tasks?${q.toString()}`)
      rows.push(...(body.data ?? []))
      next = body.nextPageToken ?? null
      if (!next) break
    }
    const tasks = new Map(rows.map((t) => [t.id, this.task(t, ctx)]))
    const top: ImTask[] = []
    for (const t of rows) {
      const parent = (t.superTaskIds ?? []).map((id) => tasks.get(id)).find(Boolean)
      if (parent) parent.subtasks.push(tasks.get(t.id)!)
      else top.push(tasks.get(t.id)!)
    }
    const used = new Map<string, { name: string; group: string; order: number }>()
    for (const t of rows) {
      const s = t.customStatusId ? ctx.statusOf.get(t.customStatusId) : undefined
      if (s) used.set(s.name.toLowerCase(), s)
    }
    const statuses: ImStatus[] = [...used.values()].sort((a, b) => a.order - b.order).map((s) => ({ name: s.name, category: GROUP[s.group] ?? 'open' }))
    return { name: f.title, statuses: statuses.length ? statuses : null, tasks: top }
  }

  private task(
    t: WrTask,
    ctx: { statusOf: Map<string, { name: string; group: string; order: number }>; fieldsMeta: Map<string, { id: string; title: string; type: string }>; people: Map<string, ImPerson> },
  ): ImTask {
    const status = t.customStatusId ? ctx.statusOf.get(t.customStatusId) : undefined
    const fields: ImFieldValue[] = []
    for (const cf of t.customFields ?? []) {
      const meta = ctx.fieldsMeta.get(cf.id)
      if (!meta || cf.value === undefined || cf.value === '') continue
      // Formula and percentage fields do not come in, as ClickUp's import leaves them.
      if (meta.type === 'Formula' || meta.type === 'Percentage') continue
      if (meta.type === 'Numeric' || meta.type === 'Currency') fields.push({ name: meta.title, type: 'number', value: Number(cf.value) })
      else if (meta.type === 'Date') fields.push({ name: meta.title, type: 'date', value: cf.value })
      else if (meta.type === 'Checkbox') fields.push({ name: meta.title, type: 'checkbox', value: cf.value === 'true' })
      else fields.push({ name: meta.title, type: 'text', value: cf.value })
    }
    const who = (id: string): ImPerson => ctx.people.get(`wrike:${id}`) ?? person('wrike', id, null, null)
    return imTask(t.id, t.title ?? '', {
      description: htmlToMarkdown(t.description) || null,
      status: status?.name ?? null,
      done: t.status === 'Completed' || status?.group === 'Completed',
      doneAt: dateOf(t.completedDate),
      due: dateOf(t.dates?.due),
      dueHasTime: hasTime(t.dates?.due) && !/T00:00:00/.test(t.dates?.due ?? ''),
      start: dateOf(t.dates?.start),
      created: dateOf(t.createdDate),
      priority: PRIORITY[t.importance ?? ''] ?? null,
      assignees: (t.responsibleIds ?? []).map(who),
      fields,
      details: async () => {
        const comments = await this.data<{ authorId?: string; text?: string; createdDate?: string }>(`/tasks/${encodeURIComponent(t.id)}/comments`)
        const files = (t.attachmentCount ?? 1) > 0 ? await this.data<{ id: string; name?: string; size?: number }>(`/tasks/${encodeURIComponent(t.id)}/attachments`) : []
        return {
          comments: comments.map((c) => ({ author: c.authorId ? who(c.authorId) : null, text: htmlToMarkdown(c.text) || c.text || '', at: dateOf(c.createdDate) })),
          files: files.map((a) => ({ name: a.name ?? 'file', size: a.size ?? null, fetch: () => this.http.file(`${this.api}/attachments/${encodeURIComponent(a.id)}/download`) })),
        }
      },
    })
  }
}
