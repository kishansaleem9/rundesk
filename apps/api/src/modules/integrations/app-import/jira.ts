import { AppHttp, dateOf, hasTime } from './app-http'
import { oauthToken, person, setting, type AppDef, type AppProject, type AppReader, type GrantToken } from './app-def'
import { imTask, type ImFieldValue, type ImList, type ImNode, type ImPriority, type ImStatus, type ImTask } from './import-tree'
import { adfToMarkdown } from './rich-text'

/**
 * JIRA, IMPORTED AS CLICKUP IMPORTS IT (`found-13-oct/importers-by-sign-in-unbuilt`).
 *
 * ClickUp signs in to Jira and reads a site's projects. Before it imports, it
 * asks how the hierarchy comes in: EPICS AS TASKS with their stories as
 * subtasks, or each kept as its own task, in Lists of their own, "linked by
 * relationships"; and it can make each ISSUE TYPE ITS OWN LIST. Statuses are
 * mapped per List; Jira's custom fields to Custom Fields; attachments come
 * with their authors, up to 1 GB; users are mapped to people here.
 * (Help centre, "Import from Jira" and its legacy article, read through search
 * excerpts, 13 October.)
 *
 * Over Atlassian's own API (developer.atlassian.com): OAuth 2.0 (3LO) at
 * auth.atlassian.com with `offline_access` for a refresh token; the sites a
 * grant opens at `oauth/token/accessible-resources`; each site's REST API v3
 * at `api.atlassian.com/ex/jira/{cloudId}`: `project/search`, a project's
 * `statuses` per issue type, `field`, issues by `search/jql` (paged by
 * `nextPageToken`), an issue's `comment` pages, and a file's
 * `attachment/content/{id}`, which redirects to Atlassian's media store.
 */

const authBase = () => setting('ATLASSIAN_AUTH_URL', 'https://auth.atlassian.com')
const apiBase = () => setting('ATLASSIAN_API_URL', 'https://api.atlassian.com')
const SCOPES = 'read:jira-work read:jira-user offline_access'

type JiraStatus = { name?: string; statusCategory?: { key?: string } }
type JiraType = { id?: string; name?: string; subtask?: boolean; hierarchyLevel?: number }
type JiraUser = { accountId?: string; displayName?: string; emailAddress?: string }
type JiraIssue = {
  id: string
  key: string
  fields: Record<string, any> & {
    summary?: string
    description?: unknown
    status?: JiraStatus
    issuetype?: JiraType
    parent?: { key?: string }
    assignee?: JiraUser | null
    priority?: { name?: string } | null
    labels?: string[]
    duedate?: string | null
    created?: string
    resolutiondate?: string | null
    attachment?: Array<{ id: string; filename?: string; size?: number }>
    comment?: { comments?: JiraComment[]; total?: number }
  }
}
type JiraComment = { author?: JiraUser; body?: unknown; created?: string }
type JiraField = { id: string; name: string; custom?: boolean; schema?: { type?: string; items?: string; custom?: string } }

const CATEGORY: Record<string, ImStatus['category']> = { new: 'open', indeterminate: 'in_progress', done: 'closed' }
const PRIORITY: Record<string, ImPriority> = { highest: 'urgent', blocker: 'urgent', critical: 'urgent', high: 'high', medium: 'normal', low: 'low', lowest: 'low', trivial: 'low', minor: 'low', major: 'high' }

export const JIRA: AppDef = {
  key: 'jira',
  label: 'Jira',
  icon: '🧩',
  auth: 'oauth',
  env: ['JIRA_CLIENT_ID', 'JIRA_CLIENT_SECRET'],
  options: [
    { key: 'lists', choices: ['types', 'one'], default: 'types' },
    { key: 'epics', choices: ['subtasks', 'linked'], default: 'subtasks' },
  ],
  notImported: ['Sprints, boards and workflows’ transitions', 'Watchers, votes and work logs'],
  authorizeUrl: (redirectUri, state) =>
    `${authBase()}/authorize?${new URLSearchParams({
      audience: 'api.atlassian.com',
      client_id: process.env.JIRA_CLIENT_ID ?? '',
      scope: SCOPES,
      redirect_uri: redirectUri,
      state,
      response_type: 'code',
      prompt: 'consent',
    }).toString()}`,
  exchange: (code, redirectUri) =>
    oauthToken(
      'Jira',
      `${authBase()}/oauth/token`,
      { grant_type: 'authorization_code', client_id: process.env.JIRA_CLIENT_ID ?? '', client_secret: process.env.JIRA_CLIENT_SECRET ?? '', code, redirect_uri: redirectUri },
      'json',
    ),
  // Atlassian rotates the refresh token: the new one is kept.
  refresh: (refreshToken) =>
    oauthToken(
      'Jira',
      `${authBase()}/oauth/token`,
      { grant_type: 'refresh_token', client_id: process.env.JIRA_CLIENT_ID ?? '', client_secret: process.env.JIRA_CLIENT_SECRET ?? '', refresh_token: refreshToken },
      'json',
    ),
  identify: async (token: GrantToken) => {
    const http = new AppHttp('Jira', [apiBase()], { Authorization: `Bearer ${token.accessToken}` })
    const me = await http.json<{ account_id?: string; email?: string; name?: string }>(`${apiBase()}/me`)
    const sites = await http.json<Array<{ id: string; name?: string; url?: string }>>(`${apiBase()}/oauth/token/accessible-resources`)
    return { name: me.name || me.email || 'Jira', email: me.email ?? null, account: { id: me.account_id ?? null, sites: sites.map((s) => ({ id: s.id, name: s.name ?? s.url ?? s.id })) } }
  },
  reader: (grant) => new JiraReader(grant.accessToken),
}

class JiraReader implements AppReader {
  private readonly http: AppHttp
  private readonly keys = new Map<string, string>()

  constructor(token: string) {
    this.http = new AppHttp('Jira', [apiBase()], { Authorization: `Bearer ${token}` })
  }

  private base(site: string) {
    return `${apiBase()}/ex/jira/${encodeURIComponent(site)}/rest/api/3`
  }

  async sources() {
    const sites = await this.http.json<Array<{ id: string; name?: string; url?: string }>>(`${apiBase()}/oauth/token/accessible-resources`)
    return sites.map((s) => ({ id: s.id, name: s.name ?? s.url ?? s.id }))
  }

  async projects(site: string): Promise<AppProject[]> {
    const out: AppProject[] = []
    for (let startAt = 0, page = 0; page < 200; page++) {
      const body = await this.http.json<{ values?: Array<{ id: string; key: string; name: string }>; isLast?: boolean }>(
        `${this.base(site)}/project/search?startAt=${startAt}&maxResults=50`,
      )
      const rows = body.values ?? []
      for (const p of rows) {
        this.keys.set(p.id, p.key)
        out.push({ id: p.id, name: p.name, detail: p.key })
      }
      startAt += rows.length
      if (body.isLast !== false || rows.length === 0) break
    }
    return out
  }

  async people(site: string, projectIds: string[]) {
    if (!this.keys.size) await this.projects(site)
    const keys = projectIds.map((id) => this.keys.get(id)).filter(Boolean).join(',')
    if (!keys) return []
    const users = await this.http.json<JiraUser[]>(`${this.base(site)}/user/assignable/multiProjectSearch?projectKeys=${encodeURIComponent(keys)}&maxResults=1000`)
    return users.filter((u) => u.accountId).map((u) => person('jira', u.accountId, u.displayName, u.emailAddress))
  }

  async read(site: string, project: AppProject, options: Record<string, string>): Promise<ImNode> {
    const base = this.base(site)
    const key = project.detail || this.keys.get(project.id) || project.id
    const types = await this.http.json<Array<JiraType & { statuses?: JiraStatus[] }>>(`${base}/project/${encodeURIComponent(project.id)}/statuses`)
    const fieldsMeta = (await this.http.json<JiraField[]>(`${base}/field`)).filter((f) => f.custom)
    const issues: JiraIssue[] = []
    let next: string | null = null
    for (let page = 0; page < 500; page++) {
      const q = new URLSearchParams({ jql: `project = "${key.replace(/"/g, '')}" ORDER BY created ASC`, fields: '*all', maxResults: '100' })
      if (next) q.set('nextPageToken', next)
      const body = await this.http.json<{ issues?: JiraIssue[]; nextPageToken?: string; isLast?: boolean }>(`${base}/search/jql?${q.toString()}`)
      issues.push(...(body.issues ?? []))
      next = body.nextPageToken ?? null
      if (!next || body.isLast) break
    }

    // A dropdown's options are every value its issues hold.
    const optionsOf = new Map<string, Set<string>>()
    for (const i of issues) {
      for (const f of fieldsMeta) {
        const v = i.fields[f.id]
        if (f.schema?.type === 'option' && v?.value) (optionsOf.get(f.id) ?? optionsOf.set(f.id, new Set()).get(f.id)!).add(String(v.value))
      }
    }

    const isEpic = (t?: JiraType) => (t?.hierarchyLevel ?? 0) >= 1 || /^epic$/i.test(t?.name ?? '')
    const byKey = new Map(issues.map((i) => [i.key, i]))
    const tasks = new Map<string, ImTask>()
    for (const i of issues) tasks.set(i.key, this.task(base, i, fieldsMeta, optionsOf))

    // Where each issue goes: under its parent (a subtask; a story under its epic when epics are tasks), or a task of its own.
    const linked = options.epics === 'linked'
    const top: JiraIssue[] = []
    for (const i of issues) {
      const parent = i.fields.parent?.key ? byKey.get(i.fields.parent.key) : undefined
      const t = tasks.get(i.key)!
      if (parent && (i.fields.issuetype?.subtask || !linked || !isEpic(parent.fields.issuetype))) {
        tasks.get(parent.key)!.subtasks.push(t)
      } else {
        if (parent && linked) t.links.push(parent.key)
        top.push(i)
      }
    }

    const statusesOf = (typeNames: Set<string>): ImStatus[] => {
      const seen = new Map<string, ImStatus>()
      for (const t of types) {
        if (!typeNames.has(t.name ?? '')) continue
        for (const s of t.statuses ?? []) {
          const name = s.name ?? ''
          if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), { name, category: CATEGORY[s.statusCategory?.key ?? 'new'] ?? 'open' })
        }
      }
      const order = { open: 0, in_progress: 1, closed: 2 }
      return [...seen.values()].sort((a, b) => order[a.category] - order[b.category])
    }

    // A List's statuses are those of every issue type in it, its subtasks' included.
    const typeOf = new Map(issues.map((i) => [i.key, i.fields.issuetype?.name ?? '']))
    const typesIn = (ts: ImTask[], into = new Set<string>()): Set<string> => {
      for (const t of ts) {
        into.add(typeOf.get(t.ref) ?? '')
        typesIn(t.subtasks, into)
      }
      return into
    }
    let lists: ImList[]
    if (options.lists === 'one') {
      const all = top.map((i) => tasks.get(i.key)!)
      lists = [{ name: 'Issues', statuses: statusesOf(typesIn(all)), tasks: all }]
    } else {
      const order = types.filter((t) => !t.subtask).map((t) => t.name ?? '')
      for (const i of top) if (!order.includes(i.fields.issuetype?.name ?? '')) order.push(i.fields.issuetype?.name ?? 'Issues')
      lists = order
        .map((name) => {
          const mine = top.filter((i) => (i.fields.issuetype?.name ?? 'Issues') === name).map((i) => tasks.get(i.key)!)
          return { name, statuses: statusesOf(typesIn(mine)), tasks: mine }
        })
        .filter((l) => l.tasks.length > 0)
    }
    return { kind: 'folder', folder: { name: project.name, lists } }
  }

  private task(base: string, i: JiraIssue, fieldsMeta: JiraField[], optionsOf: Map<string, Set<string>>): ImTask {
    const f = i.fields
    const fields: ImFieldValue[] = []
    for (const meta of fieldsMeta) {
      const v = f[meta.id]
      if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) continue
      const t = meta.schema?.type
      if (t === 'number' && typeof v === 'number') fields.push({ name: meta.name, type: 'number', value: v })
      else if ((t === 'date' || t === 'datetime') && typeof v === 'string') fields.push({ name: meta.name, type: 'date', value: v })
      else if (t === 'option' && v?.value) fields.push({ name: meta.name, type: 'dropdown', value: String(v.value), options: [...(optionsOf.get(meta.id) ?? [])] })
      else if (t === 'string') fields.push({ name: meta.name, type: 'text', value: typeof v === 'string' ? v : adfToMarkdown(v) })
      else if (t === 'array' && Array.isArray(v)) {
        const text = v.map((x) => (typeof x === 'string' ? x : (x?.value ?? x?.name ?? x?.displayName ?? ''))).filter(Boolean).join(', ')
        if (text) fields.push({ name: meta.name, type: 'text', value: text })
      } else if (t === 'user' && v?.displayName) fields.push({ name: meta.name, type: 'text', value: String(v.displayName) })
    }
    const done = f.status?.statusCategory?.key === 'done'
    return imTask(i.key, `${f.summary ?? i.key}`, {
      description: adfToMarkdown(f.description) || null,
      status: f.status?.name ?? null,
      done,
      doneAt: dateOf(f.resolutiondate),
      due: dateOf(f.duedate),
      dueHasTime: hasTime(f.duedate),
      created: dateOf(f.created),
      priority: PRIORITY[(f.priority?.name ?? '').toLowerCase()] ?? null,
      assignees: f.assignee?.accountId ? [person('jira', f.assignee.accountId, f.assignee.displayName, f.assignee.emailAddress)] : [],
      tags: f.labels ?? [],
      fields,
      details: async () => {
        const comments: JiraComment[] = [...(f.comment?.comments ?? [])]
        // An issue holds its first comments; the rest are paged from its own route.
        for (let page = 0; comments.length < (f.comment?.total ?? 0) && page < 100; page++) {
          const body = await this.http.json<{ comments?: JiraComment[] }>(`${base}/issue/${encodeURIComponent(i.key)}/comment?startAt=${comments.length}&maxResults=100`)
          if (!body.comments?.length) break
          comments.push(...body.comments)
        }
        return {
          comments: comments.map((c) => ({
            author: c.author?.accountId ? person('jira', c.author.accountId, c.author.displayName, c.author.emailAddress) : null,
            text: adfToMarkdown(c.body),
            at: dateOf(c.created),
          })),
          files: (f.attachment ?? []).map((a) => ({ name: a.filename ?? 'file', size: a.size ?? null, fetch: () => this.http.file(`${base}/attachment/content/${encodeURIComponent(a.id)}`) })),
        }
      },
    })
  }
}
