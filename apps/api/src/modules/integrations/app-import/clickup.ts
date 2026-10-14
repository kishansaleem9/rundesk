import { AppError, AppHttp } from './app-http'
import { person, setting, type AppDef, type AppProject, type AppReader, type AppSource, type GrantToken } from './app-def'
import {
  imTask,
  type ImChecklist,
  type ImComment,
  type ImFieldValue,
  type ImFileRef,
  type ImFolder,
  type ImList,
  type ImNode,
  type ImPerson,
  type ImPriority,
  type ImStatus,
  type ImTask,
} from './import-tree'

/**
 * A CLICKUP WORKSPACE, IMPORTED WHOLE, ITS PEOPLE WITH IT (`found-14-oct/clickup-workspace-import-and-people-unbuilt`).
 *
 * The ClickUp tab imported ClickUp's CSV export, and read its comments and
 * files over the API when a token was given; the people the file named came
 * in only where they were members here already, and nobody was asked to join.
 * Moving a team off ClickUp is the team as well as its tasks. So ClickUp is
 * signed in to as the other tools are, by its PERSONAL API TOKEN ("Settings ›
 * Apps › API Token", sent as `Authorization: <token>`), and read over its API
 * v2 (developer.clickup.com, through search excerpts, 14 October):
 *
 *   `GET /user`                       whose token it is
 *   `GET /team`                       the Workspaces it opens, each with its members
 *                                     (`user.role`: 1 owner, 2 admin, 3 member, 4 guest)
 *   `GET /team/{id}/space`            a Workspace's Spaces, with their statuses
 *   `GET /space/{id}/folder`          its Folders, each with its Lists
 *   `GET /space/{id}/list`            its Lists in no Folder
 *   `GET /list/{id}`                  a List's own statuses, when it overrides its Space's
 *   `GET /list/{id}/task`             its tasks, 100 a page from page 0 until `last_page`,
 *                                     closed ones and subtasks included (`parent` names a
 *                                     subtask's task), descriptions as markdown
 *   `GET /task/{id}/comment`          a task's comments, newest first, 25 a page, the next
 *                                     page asked from the oldest one's `date` and `id`
 *   `GET /task/{id}`                  its attachments, when the page of tasks has none
 *
 * Each Space chosen comes in as a Space: its Folders as Folders, its Lists as
 * Lists, each List with the statuses its tasks are in (the List's own, else
 * its Folder's, else its Space's), in their order, `open` first and `closed`
 * last. A task keeps its description, status, dates, priority, time estimate,
 * assignees, tags, checklists, Custom Fields, subtasks, comments and files,
 * and its dependencies and links as related tasks. Its people are the
 * Workspace's members, matched by email — or invited here, with their ClickUp
 * role, and given their tasks when they join (`TreeWriter`, `import_pending_assignees`).
 */

const apiUrl = () => setting('CLICKUP_API_URL', 'https://api.clickup.com/api/v2')

/** ClickUp's 100 tasks a page; a page short of it, or `last_page`, is the last. */
const TASK_PAGE = 100

type CuUser = { id?: number | string; username?: string | null; email?: string | null; role?: number | null }
type CuStatus = { status?: string; type?: string; orderindex?: number | string }
type CuOption = { id?: string; name?: string; label?: string; orderindex?: number | string }
type CuField = { id?: string; name?: string; type?: string; type_config?: { options?: CuOption[] } | null; value?: unknown }
type CuAttachment = { id?: string; title?: string; url?: string; url_w_query?: string; size?: number | string | null }
type CuTask = {
  id: string
  name?: string
  description?: string | null
  text_content?: string | null
  markdown_description?: string | null
  status?: CuStatus | null
  date_created?: string | null
  date_closed?: string | null
  date_done?: string | null
  start_date?: string | null
  due_date?: string | null
  due_date_time?: boolean | null
  time_estimate?: number | string | null
  priority?: { id?: string | number; priority?: string } | null
  assignees?: CuUser[]
  tags?: Array<{ name?: string }>
  checklists?: Array<{ name?: string; items?: CuChecklistItem[] }>
  custom_fields?: CuField[]
  parent?: string | null
  dependencies?: Array<{ task_id?: string; depends_on?: string }>
  linked_tasks?: Array<{ task_id?: string; link_id?: string }>
  attachments?: CuAttachment[]
  archived?: boolean
}
type CuChecklistItem = { name?: string; resolved?: boolean; children?: CuChecklistItem[] }
type CuList = { id: string; name?: string; content?: string | null; override_statuses?: boolean; statuses?: CuStatus[] }
type CuFolder = { id: string; name?: string; hidden?: boolean; override_statuses?: boolean; statuses?: CuStatus[]; lists?: CuList[] }
type CuSpace = { id: string; name?: string; private?: boolean; statuses?: CuStatus[] }
type CuComment = { id?: string; comment_text?: string; comment?: Array<{ text?: string }>; user?: CuUser | null; date?: string | null }

const ROLE: Record<number, ImPerson['role']> = { 1: 'admin', 2: 'admin', 3: 'member', 4: 'guest' }
const PRIORITY: Record<string, ImPriority> = { '1': 'urgent', '2': 'high', '3': 'normal', '4': 'low', urgent: 'urgent', high: 'high', normal: 'normal', low: 'low' }

/** A ClickUp moment — milliseconds since 1970, as a string or a number — as a date. */
export function msDate(v: unknown): Date | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN
  if (!Number.isFinite(n) || n <= 0) return null
  const d = new Date(n)
  return Number.isNaN(d.getTime()) ? null : d
}

/** A ClickUp person, with the role their Workspace gives them when it is known. */
const cuPerson = (u: CuUser | null | undefined): ImPerson | null => {
  if (!u || u.id === undefined || u.id === null) return null
  const p = person('clickup', u.id, u.username, u.email)
  const role = typeof u.role === 'number' ? ROLE[u.role] : undefined
  return role ? { ...p, role } : p
}

/** Statuses in ClickUp's order, `open` first and `closed` last, as categories here. */
export function cuStatuses(all: CuStatus[] | undefined): ImStatus[] {
  const sorted = [...(all ?? [])].filter((s) => typeof s.status === 'string' && s.status.trim()).sort((a, b) => Number(a.orderindex ?? 0) - Number(b.orderindex ?? 0))
  const seen = new Set<string>()
  const out: ImStatus[] = []
  for (const s of sorted) {
    const name = s.status!.trim()
    if (seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    out.push({ name, category: s.type === 'closed' || s.type === 'done' ? 'closed' : s.type === 'open' ? 'open' : 'in_progress' })
  }
  return out
}

/** A checklist's items, its nested ones under it in order. */
const flatItems = (items: CuChecklistItem[] | undefined): Array<{ name: string; done: boolean }> =>
  (items ?? []).flatMap((i) => [
    ...(typeof i.name === 'string' && i.name.trim() ? [{ name: i.name.trim(), done: i.resolved === true }] : []),
    ...flatItems(i.children),
  ])

const optionName = (o: CuOption | undefined) => (o ? (o.name ?? o.label ?? '').trim() : '')

/**
 * A Custom Field's value as a field here: text, number, date, checkbox, link or
 * dropdown. A dropdown names its option by its place (`orderindex`) or its id;
 * Labels name several, which come in as text. People, task, relationship,
 * formula, file and other fields have nothing to hold them here, and are left out.
 */
export function cuField(f: CuField): ImFieldValue | null {
  const name = (f.name ?? '').trim()
  const v = f.value
  if (!name || v === undefined || v === null || v === '') return null
  const options = f.type_config?.options ?? []
  switch (f.type) {
    case 'text':
    case 'short_text':
    case 'email':
    case 'phone':
      return typeof v === 'string' || typeof v === 'number' ? { name, type: 'text', value: String(v) } : null
    case 'location': {
      const at = (v as { formatted_address?: string })?.formatted_address
      return typeof at === 'string' && at.trim() ? { name, type: 'text', value: at.trim() } : null
    }
    case 'number':
    case 'currency':
    case 'emoji': {
      const n = Number(v)
      return Number.isFinite(n) ? { name, type: 'number', value: n } : null
    }
    case 'date': {
      const d = msDate(v)
      return d ? { name, type: 'date', value: d.toISOString() } : null
    }
    case 'checkbox':
      return { name, type: 'checkbox', value: v === true || v === 'true' }
    case 'url':
      return typeof v === 'string' ? { name, type: 'url', value: v } : null
    case 'drop_down': {
      const hit =
        options.find((o) => o.id !== undefined && String(o.id) === String(v)) ??
        options.find((o) => o.orderindex !== undefined && String(o.orderindex) === String(v)) ??
        (typeof v === 'object' ? options.find((o) => o.id === (v as { id?: string }).id) : undefined)
      const value = optionName(hit)
      return value ? { name, type: 'dropdown', value, options: options.map(optionName).filter(Boolean) } : null
    }
    case 'labels': {
      const ids = Array.isArray(v) ? v.map((x) => (typeof x === 'object' && x ? String((x as { id?: string }).id) : String(x))) : []
      const names = ids.map((id) => optionName(options.find((o) => String(o.id) === id))).filter(Boolean)
      return names.length ? { name, type: 'text', value: names.join(', ') } : null
    }
    default:
      return null
  }
}

export const CLICKUP: AppDef = {
  key: 'clickup',
  label: 'ClickUp',
  icon: '🚀',
  auth: 'token',
  env: [],
  options: [],
  notImported: [
    'Docs, Whiteboards, Chat, Goals, Dashboards and views',
    'Tracked time and reminders',
    'People, task and relationship fields, formulas and files in fields',
  ],
  identify: async (token: GrantToken) => {
    const me = await new ClickUpApi(token.accessToken).get<{ user?: CuUser }>('/user')
    const name = me.user?.username || me.user?.email || 'ClickUp'
    return { name, email: typeof me.user?.email === 'string' ? me.user.email : null, account: { id: me.user?.id ?? null } }
  },
  reader: (grant) => new ClickUpReader(new ClickUpApi(grant.accessToken)),
}

/** ClickUp's API with one token: its own addresses only, and its words when it refuses. */
export class ClickUpApi {
  private readonly http: AppHttp

  constructor(token: string, fetchImpl?: typeof fetch) {
    this.http = new AppHttp('ClickUp', [apiUrl()], { Authorization: token }, fetchImpl)
  }

  get<T>(path: string, query: Record<string, string | number | boolean> = {}): Promise<T> {
    const url = new URL(apiUrl() + path)
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v))
    return this.http.json<T>(url.toString())
  }

  file(url: string) {
    return this.http.file(url)
  }
}

export class ClickUpReader implements AppReader {
  private teams: Promise<Array<{ id: string; name?: string; members?: Array<{ user?: CuUser }> }>> | null = null

  constructor(private readonly api: ClickUpApi) {}

  private allTeams() {
    this.teams ??= this.api.get<{ teams?: Array<{ id: string; name?: string; members?: Array<{ user?: CuUser }> }> }>('/team').then((b) => b.teams ?? [])
    return this.teams
  }

  private async team(source: string) {
    const t = (await this.allTeams()).find((x) => String(x.id) === source)
    if (!t) throw new AppError('That ClickUp Workspace is not one this token opens')
    return t
  }

  async sources(): Promise<AppSource[]> {
    return (await this.allTeams()).map((t) => ({ id: String(t.id), name: t.name || 'ClickUp Workspace' }))
  }

  async projects(source: string): Promise<AppProject[]> {
    await this.team(source)
    const body = await this.api.get<{ spaces?: CuSpace[] }>(`/team/${encodeURIComponent(source)}/space`, { archived: false })
    return (body.spaces ?? []).map((s) => ({ id: String(s.id), name: s.name || 'Space', detail: s.private ? 'Private' : null }))
  }

  /** Everyone in the Workspace, with their role there: whom its tasks name, and whom the importer may invite. */
  async people(source: string): Promise<ImPerson[]> {
    const t = await this.team(source)
    const out: ImPerson[] = []
    const seen = new Set<string>()
    for (const m of t.members ?? []) {
      const p = cuPerson(m.user)
      if (!p || seen.has(p.key)) continue
      seen.add(p.key)
      out.push(p)
    }
    return out
  }

  async read(source: string, project: AppProject): Promise<ImNode> {
    const members = new Map((await this.people(source)).map((p) => [p.key, p]))
    const space = await this.api.get<CuSpace>(`/space/${encodeURIComponent(project.id)}`)
    const spaceStatuses = space.statuses ?? []
    const folders = (await this.api.get<{ folders?: CuFolder[] }>(`/space/${encodeURIComponent(project.id)}/folder`, { archived: false })).folders ?? []
    const loose = (await this.api.get<{ lists?: CuList[] }>(`/space/${encodeURIComponent(project.id)}/list`, { archived: false })).lists ?? []
    const outFolders: ImFolder[] = []
    for (const f of folders) {
      if (f.hidden) continue
      const lists: ImList[] = []
      for (const l of f.lists ?? []) lists.push(await this.list(l, f.override_statuses && f.statuses?.length ? f.statuses : spaceStatuses, members))
      outFolders.push({ name: f.name || 'Folder', lists })
    }
    const outLists: ImList[] = []
    for (const l of loose) outLists.push(await this.list(l, spaceStatuses, members))
    return { kind: 'space', name: space.name || project.name, folders: outFolders, lists: outLists }
  }

  /** A List: its statuses (its own when it overrides its Folder's or Space's) and every page of its tasks. */
  private async list(l: CuList, inherited: CuStatus[], members: Map<string, ImPerson>): Promise<ImList> {
    let own = l.statuses
    if (l.override_statuses && !own?.length) own = (await this.api.get<CuList>(`/list/${encodeURIComponent(l.id)}`)).statuses
    const statuses = cuStatuses(l.override_statuses && own?.length ? own : inherited)
    const all: CuTask[] = []
    for (let page = 0; page < 10_000; page++) {
      const body = await this.api.get<{ tasks?: CuTask[]; last_page?: boolean }>(`/list/${encodeURIComponent(l.id)}/task`, {
        page,
        archived: false,
        include_closed: true,
        subtasks: true,
        include_markdown_description: true,
      })
      const rows = body.tasks ?? []
      all.push(...rows)
      if (body.last_page === true || rows.length === 0 || (body.last_page === undefined && rows.length < TASK_PAGE)) break
    }
    // A subtask is a task whose `parent` is one of this List's; the rest are its tasks, in ClickUp's order.
    const byId = new Map(all.map((t) => [t.id, t]))
    const children = new Map<string, CuTask[]>()
    for (const t of all) if (t.parent && byId.has(t.parent)) children.set(t.parent, [...(children.get(t.parent) ?? []), t])
    const closedNames = new Set(statuses.filter((s) => s.category === 'closed').map((s) => s.name.toLowerCase()))
    const build = (t: CuTask): ImTask => this.task(t, (children.get(t.id) ?? []).map(build), closedNames, members)
    return {
      name: l.name || 'List',
      description: typeof l.content === 'string' && l.content.trim() ? l.content : null,
      statuses,
      tasks: all.filter((t) => !t.archived && !(t.parent && byId.has(t.parent))).map(build),
    }
  }

  private task(t: CuTask, subtasks: ImTask[], closedNames: Set<string>, members: Map<string, ImPerson>): ImTask {
    const status = t.status?.status?.trim() || null
    const done = t.status?.type === 'closed' || t.status?.type === 'done' || (!!status && closedNames.has(status.toLowerCase()))
    const who = (u: CuUser) => members.get(`clickup:${String(u.id)}`) ?? cuPerson(u)
    const estimateMs = Number(t.time_estimate)
    const links = [
      ...(t.dependencies ?? []).map((d) => (d.task_id === t.id ? d.depends_on : d.task_id)),
      ...(t.linked_tasks ?? []).map((d) => (d.task_id === t.id ? d.link_id : d.task_id)),
    ].filter((x): x is string => typeof x === 'string' && !!x && x !== t.id)
    return imTask(t.id, t.name ?? '', {
      description: t.markdown_description?.trim() || t.description?.trim() || t.text_content?.trim() || null,
      status,
      done,
      doneAt: done ? (msDate(t.date_done) ?? msDate(t.date_closed)) : null,
      start: msDate(t.start_date),
      due: msDate(t.due_date),
      dueHasTime: t.due_date_time === true,
      created: msDate(t.date_created),
      priority: t.priority ? (PRIORITY[String(t.priority.priority ?? t.priority.id ?? '').toLowerCase()] ?? null) : null,
      estimateSeconds: Number.isFinite(estimateMs) && estimateMs > 0 ? Math.round(estimateMs / 1000) : null,
      assignees: (t.assignees ?? []).map(who).filter((p): p is ImPerson => !!p),
      tags: (t.tags ?? []).map((x) => (x.name ?? '').trim()).filter(Boolean),
      checklists: (t.checklists ?? []).map((c): ImChecklist => ({ name: (c.name ?? '').trim() || 'Checklist', items: flatItems(c.items) })),
      fields: (t.custom_fields ?? []).map(cuField).filter((f): f is ImFieldValue => !!f),
      subtasks,
      links: [...new Set(links)],
      details: async () => ({ comments: await this.comments(t.id, who), files: await this.files(t) }),
    })
  }

  /** Every comment, oldest first: ClickUp gives 25 a page, newest first, the next page asked from the oldest one's moment. */
  private async comments(taskId: string, who: (u: CuUser) => ImPerson | null): Promise<ImComment[]> {
    const out: CuComment[] = []
    const seen = new Set<string>()
    let start: string | null = null
    let startId: string | null = null
    for (let page = 0; page < 400; page++) {
      const body: { comments?: CuComment[] } = await this.api.get(`/task/${encodeURIComponent(taskId)}/comment`, start && startId ? { start, start_id: startId } : {})
      const rows = (body.comments ?? []).filter((c) => !c.id || !seen.has(c.id))
      for (const c of rows) if (c.id) seen.add(c.id)
      out.push(...rows)
      if (rows.length < 25) break
      const oldest = rows[rows.length - 1]
      if (!oldest.date || !oldest.id) break
      start = String(oldest.date)
      startId = String(oldest.id)
    }
    return out
      .map((c) => ({
        author: c.user ? who(c.user) : null,
        text: (c.comment_text ?? (c.comment ?? []).map((s) => s.text ?? '').join('')).trim(),
        at: msDate(c.date),
      }))
      .filter((c) => c.text)
      .sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0))
  }

  /** A task's files: those its page of tasks names, else those its own page does. */
  private async files(t: CuTask): Promise<ImFileRef[]> {
    const all = t.attachments ?? (await this.api.get<CuTask>(`/task/${encodeURIComponent(t.id)}`)).attachments ?? []
    return all
      .filter((a) => typeof (a.url_w_query ?? a.url) === 'string')
      .map((a) => ({
        name: (a.title ?? '').trim() || 'attachment',
        size: Number.isFinite(Number(a.size)) ? Number(a.size) : null,
        fetch: () => this.api.file((a.url_w_query ?? a.url)!),
      }))
  }
}
