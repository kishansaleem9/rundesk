import { AppHttp, dateOf, hasTime } from './app-http'
import { oauthToken, person, setting, type AppDef, type AppProject, type AppReader, type GrantToken } from './app-def'
import { imTask, type ImList, type ImNode, type ImPerson, type ImPriority, type ImTask } from './import-tree'

/**
 * TODOIST, IMPORTED AS CLICKUP IMPORTS IT (`found-13-oct/importers-by-sign-in-unbuilt`).
 *
 * ClickUp signs in to Todoist and maps each project to a FOLDER in the Space
 * chosen for it. Tags, priority, assignees (only those mapped to a person
 * here), due and creation dates, comments and subtasks come in; closed tasks
 * when the importer asks for them; "due to Todoist limitations, we are unable
 * to import attachments". (Help centre, "Import from Todoist", read through
 * search excerpts, 13 October.) A project's sections are its Folder's Lists,
 * its tasks outside any section a List named for the project.
 *
 * Over Todoist's API v1 (developer.todoist.com): OAuth at `oauth/authorize`
 * and `oauth/access_token` (a token that does not run out); `user`,
 * `projects`, `sections`, `tasks`, a project's `collaborators`, a task's
 * `comments`, and the completed tasks by completion date, which Todoist
 * answers three months at a time. Every list is paged by `next_cursor`.
 */

const authUrl = () => setting('TODOIST_AUTH_URL', 'https://todoist.com/oauth/authorize')
const tokenUrl = () => setting('TODOIST_TOKEN_URL', 'https://todoist.com/oauth/access_token')
const apiUrl = () => setting('TODOIST_API_URL', 'https://api.todoist.com/api/v1')

type TdProject = { id: string; name: string; parent_id?: string | null; created_at?: string; inbox_project?: boolean }
type TdTask = {
  id: string
  content?: string
  description?: string
  project_id?: string
  section_id?: string | null
  parent_id?: string | null
  labels?: string[]
  priority?: number
  due?: { date?: string; datetime?: string | null } | null
  responsible_uid?: string | null
  added_at?: string
  completed_at?: string | null
  checked?: boolean
  child_order?: number
}

/** Todoist's priority 4 is its p1, the most urgent; 1 is p4. */
const PRIORITY: Record<number, ImPriority> = { 4: 'urgent', 3: 'high', 2: 'normal', 1: 'low' }
const QUARTER_MS = 90 * 24 * 60 * 60 * 1000

export const TODOIST: AppDef = {
  key: 'todoist',
  label: 'Todoist',
  icon: '✅',
  auth: 'oauth',
  env: ['TODOIST_CLIENT_ID', 'TODOIST_CLIENT_SECRET'],
  options: [{ key: 'closed', choices: ['no', 'yes'], default: 'no' }],
  notImported: ['Attachments: Todoist does not give them to an import, as ClickUp says', 'Recurring due dates come in as their next date', 'Reminders and filters'],
  authorizeUrl: (_redirectUri, state) =>
    `${authUrl()}?${new URLSearchParams({ client_id: process.env.TODOIST_CLIENT_ID ?? '', scope: 'data:read', state }).toString()}`,
  exchange: (code) =>
    oauthToken('Todoist', tokenUrl(), { client_id: process.env.TODOIST_CLIENT_ID ?? '', client_secret: process.env.TODOIST_CLIENT_SECRET ?? '', code }),
  identify: async (token: GrantToken) => {
    const http = new AppHttp('Todoist', [apiUrl()], { Authorization: `Bearer ${token.accessToken}` })
    const me = await http.json<{ id?: string; full_name?: string; email?: string }>(`${apiUrl()}/user`)
    return { name: me.full_name || me.email || 'Todoist', email: me.email ?? null, account: { id: me.id ?? null } }
  },
  reader: (grant) => new TodoistReader(grant.accessToken),
}

class TodoistReader implements AppReader {
  private readonly http: AppHttp
  private projectsById = new Map<string, TdProject>()

  constructor(token: string) {
    this.http = new AppHttp('Todoist', [apiUrl()], { Authorization: `Bearer ${token}` })
  }

  /** Every page of a list, following `next_cursor`. */
  private async all<T>(url: string, maxPages = 500): Promise<T[]> {
    const out: T[] = []
    let cursor: string | null = null
    for (let page = 0; page < maxPages; page++) {
      const u = new URL(url)
      if (cursor) u.searchParams.set('cursor', cursor)
      const body: { results?: T[]; items?: T[]; next_cursor?: string | null } = await this.http.json(u.toString())
      out.push(...(body.results ?? body.items ?? []))
      cursor = body.next_cursor ?? null
      if (!cursor) break
    }
    return out
  }

  async sources() {
    return [{ id: 'todoist', name: 'Todoist' }]
  }

  async projects(): Promise<AppProject[]> {
    const rows = await this.all<TdProject>(`${apiUrl()}/projects?limit=200`)
    this.projectsById = new Map(rows.map((p) => [p.id, p]))
    const path = (p: TdProject, depth = 0): string => {
      const parent = p.parent_id ? this.projectsById.get(p.parent_id) : undefined
      return parent && depth < 10 ? `${path(parent, depth + 1)} › ${p.name}` : p.name
    }
    return rows.map((p) => ({ id: p.id, name: path(p), detail: p.inbox_project ? 'Inbox' : null }))
  }

  async people(_source: string, projectIds: string[]) {
    const seen = new Map<string, ImPerson>()
    const me = await this.http.json<{ id?: string; full_name?: string; email?: string }>(`${apiUrl()}/user`).catch(() => null)
    if (me?.id) seen.set(`todoist:${me.id}`, person('todoist', me.id, me.full_name, me.email))
    for (const id of projectIds) {
      const rows = await this.all<{ id: string; name?: string; email?: string }>(`${apiUrl()}/projects/${encodeURIComponent(id)}/collaborators?limit=200`).catch(() => [])
      for (const c of rows) seen.set(`todoist:${c.id}`, person('todoist', c.id, c.name, c.email))
    }
    return [...seen.values()]
  }

  async read(source: string, project: AppProject, options: Record<string, string>): Promise<ImNode> {
    const id = encodeURIComponent(project.id)
    const people = new Map((await this.people(source, [project.id])).map((p) => [p.key, p]))
    const sections = await this.all<{ id: string; name: string; section_order?: number }>(`${apiUrl()}/sections?project_id=${id}&limit=200`)
    const active = await this.all<TdTask>(`${apiUrl()}/tasks?project_id=${id}&limit=200`)
    const closed = options.closed === 'yes' ? await this.completed(project.id) : []
    const all = [...active, ...closed.filter((c) => !active.some((a) => a.id === c.id))]

    const who = (uid: string | null | undefined): ImPerson | null => (uid ? people.get(`todoist:${uid}`) ?? person('todoist', uid, null, null) : null)
    const tasks = new Map<string, ImTask>()
    for (const t of all.sort((a, b) => (a.child_order ?? 0) - (b.child_order ?? 0))) {
      const assignee = who(t.responsible_uid)
      tasks.set(
        t.id,
        imTask(t.id, t.content ?? '', {
          description: t.description?.trim() || null,
          done: t.checked === true || !!t.completed_at,
          doneAt: dateOf(t.completed_at),
          due: dateOf(t.due?.datetime ?? t.due?.date),
          dueHasTime: hasTime(t.due?.datetime),
          created: dateOf(t.added_at),
          priority: PRIORITY[t.priority ?? 1] ?? null,
          assignees: assignee ? [assignee] : [],
          tags: t.labels ?? [],
          details: async () => {
            const rows = await this.all<{ content?: string; posted_at?: string; posted_uid?: string }>(`${apiUrl()}/comments?task_id=${encodeURIComponent(t.id)}&limit=200`)
            return { comments: rows.map((c) => ({ author: who(c.posted_uid), text: c.content ?? '', at: dateOf(c.posted_at) })), files: [] }
          },
        }),
      )
    }
    const top: TdTask[] = []
    for (const t of all) {
      const parent = t.parent_id ? tasks.get(t.parent_id) : undefined
      if (parent) parent.subtasks.push(tasks.get(t.id)!)
      else top.push(t)
    }
    const lists: ImList[] = []
    const loose = top.filter((t) => !t.section_id || !sections.some((s) => s.id === t.section_id))
    if (loose.length || !sections.length) lists.push({ name: project.name.split(' › ').pop() || project.name, statuses: null, tasks: loose.map((t) => tasks.get(t.id)!) })
    for (const s of [...sections].sort((a, b) => (a.section_order ?? 0) - (b.section_order ?? 0))) {
      lists.push({ name: s.name, statuses: null, tasks: top.filter((t) => t.section_id === s.id).map((t) => tasks.get(t.id)!) })
    }
    return { kind: 'folder', folder: { name: project.name.split(' › ').pop() || project.name, lists } }
  }

  /** The project's completed tasks, a quarter at a time back to when it was made (ten years at most). */
  private async completed(projectId: string): Promise<TdTask[]> {
    if (!this.projectsById.size) await this.projects()
    const made = dateOf(this.projectsById.get(projectId)?.created_at)?.getTime() ?? Date.now() - 4 * QUARTER_MS
    const out: TdTask[] = []
    let until = Date.now()
    for (let n = 0; n < 40 && until > made - QUARTER_MS; n++) {
      const since = until - QUARTER_MS
      const q = new URLSearchParams({ project_id: projectId, since: new Date(since).toISOString(), until: new Date(until).toISOString(), limit: '200' })
      out.push(...(await this.all<TdTask>(`${apiUrl()}/tasks/completed/by_completion_date?${q.toString()}`)))
      until = since
    }
    return out.map((t) => ({ ...t, checked: true }))
  }
}
