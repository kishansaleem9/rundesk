import { AppError, AppHttp, type AppFile } from './app-http'
import { person, setting, type AppDef, type AppProject, type AppReader, type AppSource, type GrantToken } from './app-def'
import {
  imTask,
  mentionToken,
  type ImChannel,
  type ImChatMessage,
  type ImChecklist,
  type ImComment,
  type ImDoc,
  type ImDocPage,
  type ImExtras,
  type ImFieldValue,
  type ImFileRef,
  type ImFolder,
  type ImGoal,
  type ImKeyResult,
  type ImList,
  type ImNode,
  type ImPerson,
  type ImPriority,
  type ImStatus,
  type ImTask,
  type ImTime,
  type ImView,
} from './import-tree'
import { slackEmoji } from '../../chat/slack-export'

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
 *
 * AND THE REST OF IT (`found-14-oct/clickup-docs-time-goals-unimported`), as the
 * import page's choices say — each on unless turned off:
 *
 *   `GET /team/{id}/time_entries`     the time tracked in the Space (`space_id`), from
 *                                     ClickUp's first day to now, everyone's (`assignee`,
 *                                     which only a Workspace owner's or admin's token may
 *                                     ask; anyone else's brings their own); a running
 *                                     timer's negative duration is not time yet
 *   v3 `GET /workspaces/{id}/docs`    the Workspace's Docs, a page of them at a time by
 *                                     `cursor`, each with its `parent` (a Space 4, a Folder
 *                                     5, a List 6; the Workspace's own otherwise)
 *   v3 `GET …/docs/{id}/pages`        a Doc's pages, nested, as Markdown
 *                                     (`content_format=text/md`, `max_page_depth=-1`)
 *   `GET /team/{id}/goal`             the Workspace's Goals, those in Goal Folders too
 *   `GET /goal/{id}`                  a Goal with its Targets (`key_results`: number,
 *                                     currency, true/false, percentage, or tasks done)
 *
 * The time comes in under whoever tracked it — a member here, or held for
 * somebody the run invited until they join (`import_pending_time_entries`).
 * A Doc in the Space, its Folders or its Lists comes in in the Space, its first
 * page the Doc's own and the rest nested under it as ClickUp nests them; the
 * Workspace's own Docs only when asked. Goals are the Workspace's, so they come
 * in once a run, the workspace's here.
 *
 * AND ITS CHAT (`found-14-oct/clickup-chat-unimported`), read through ClickUp's
 * v3 Chat API, which ClickUp calls experimental. Its shape was read on 14 October
 * through the owner's own ClickUp account (read only, at their word: a channel's
 * `id`, `name`, `type` CHANNEL or a direct message's, `visibility`; a message's
 * `id`, `content` in Markdown with a mention as `[@Name](#user_mention#<id>)`,
 * `user_id` — `-1` for ClickUp's own posts — `date` in milliseconds and
 * `has_replies`; newest first, a page at a time by `next_cursor`):
 *
 *   v3 `GET /workspaces/{id}/chat/channels`                   its channels
 *   v3 `GET …/chat/channels/{id}/messages`                    a channel's messages
 *   v3 `GET …/chat/messages/{id}/replies`                     a thread's replies
 *   v3 `GET …/chat/channels/{id}/members`                     its members, where it says
 *
 * Each channel — not a direct message, as the Slack import leaves those — comes
 * in as a Chat channel here, private when it was, with its messages at their
 * moments, a thread's replies in its thread, and its people mapped as a task's
 * are; somebody who is not a member here is drawn under the name they wrote as.
 *
 * AND WHAT THE API GIVES OF THE REST (`found-14-oct/clickup-import-rest-unimported`):
 *
 *   `GET /list/{id}/view`                       a List's saved views: type, name, grouping,
 *                                               sorting, pinned, private, protected
 *   v3 `GET …/chat/messages/{id}/reactions`     a message's reactions, by emoji name — one
 *                                               ask a message, as the API has no count of them
 *                                               on the message (ClickUp's own feedback board)
 *
 * A direct message is read as a channel is (`type` DM or GROUP_DM, a token reading
 * only its own), and comes in between the same people here. A file posted in Chat
 * is a link in the message's Markdown to ClickUp's file store
 * (`…clickup-attachments.com/…`), and comes in as the message's file. A channel of
 * a Space, Folder or List — its id `4-<id>-…`, `5-…`, `6-…`, as a Doc's parent is
 * typed — goes into the Space it came into. A Goal in a Goal Folder comes in in a
 * Goal Folder of that name, and a Files field's files as the task's own.
 * Whiteboards, Dashboards and reminders have no endpoint in ClickUp's public API
 * (its feedback board asks for them), so no importer can read them, and the run says so.
 */

const apiUrl = () => setting('CLICKUP_API_URL', 'https://api.clickup.com/api/v2')
/** ClickUp's v3 API — Docs live there — beside its v2. */
const apiV3Url = () => setting('CLICKUP_API_V3_URL', apiUrl().replace(/\/v2$/, '/v3'))
/** ClickUp's own first day: tracked time is asked for from here, as the API asks for a range. */
const CLICKUP_EPOCH = Date.UTC(2017, 0, 1)
/** How many people one ask for their tracked time names, so the address stays short. */
const TIME_ASSIGNEES = 50
/** The most pages of Docs one run brings: a Workspace's worth, and a bound on what one run holds. */
const MAX_DOC_PAGES = 5_000
/** The newest messages of a channel one run brings, as the Slack import brings a channel's. */
const MAX_CHAT_MESSAGES = 10_000
/**
 * The most messages one run asks for their reactions: one ask each, ClickUp's 100 a minute on most
 * plans, so a quarter of an hour of a run's asking at most. Past it the run says how far it went.
 */
const MAX_REACTION_READS = 1_500

/** ClickUp's 100 tasks a page; a page short of it, or `last_page`, is the last. */
const TASK_PAGE = 100

type CuUser = { id?: number | string; username?: string | null; email?: string | null; role?: number | null }
type CuStatus = { status?: string; type?: string; orderindex?: number | string }
type CuOption = { id?: string; name?: string; label?: string; orderindex?: number | string }
type CuField = { id?: string; name?: string; type?: string; type_config?: { options?: CuOption[] } | null; value?: unknown }
type CuView = {
  id?: string
  name?: string | null
  type?: string | null
  visibility?: string | null
  protected?: boolean | null
  pinned?: boolean | null
  creator?: number | string | null
  orderindex?: number | string | null
  grouping?: { field?: string | null } | null
  sorting?: { fields?: Array<{ field?: string | null; dir?: number | string | null }> } | null
}
type CuReaction = { reaction?: string | null; emoji?: string | null; name?: string | null; user_id?: string | number | null; user?: { id?: string | number | null } | null }
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
type CuTimeEntry = {
  id?: string
  task?: { id?: string } | null
  user?: CuUser | null
  billable?: boolean
  start?: string | number | null
  end?: string | number | null
  duration?: string | number | null
  description?: string | null
}
type CuDoc = { id: string; name?: string; parent?: { id?: string | number; type?: string | number } | null; deleted?: boolean; archived?: boolean }
type CuPage = { id: string; name?: string; content?: string | null; pages?: CuPage[]; deleted?: boolean; archived?: boolean }
type CuKeyResult = {
  name?: string
  type?: string
  unit?: string | null
  steps_start?: string | number | null
  steps_end?: string | number | null
  steps_current?: string | number | null
  completed?: boolean
  owners?: CuUser[]
  last_action?: { steps_current?: string | number | null } | null
}
type CuChannel = {
  id: string
  name?: string | null
  description?: string | null
  topic?: string | null
  type?: string | null
  visibility?: string | null
  archived?: boolean | null
  is_archived?: boolean | null
  parent?: { id?: string | number | null; type?: string | number | null } | null
  location?: { id?: string | number | null; type?: string | number | null } | null
}
type CuChatMessage = { id: string; content?: string | null; text?: string | null; user_id?: string | number | null; date?: string | number | null; has_replies?: boolean | null; replies_count?: number | string | null }
type CuChatMember = { id?: string | number | null; user_id?: string | number | null; user?: { id?: string | number | null } | null }
/** A page of a Chat listing: the API gives its rows as `data`; the owner's connector names them. */
type CuChatPage<T> = { data?: T[]; channels?: T[]; messages?: T[]; replies?: T[]; members?: T[]; reactions?: T[]; next_cursor?: string | null }
type CuGoal = {
  id: string
  name?: string
  description?: string | null
  start_date?: string | null
  due_date?: string | null
  owner?: CuUser | null
  owners?: CuUser[]
  percent_completed?: string | number | null
  archived?: boolean
  key_results?: CuKeyResult[]
}

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
 * Labels name several, which come in as text. A People field comes in as its
 * people's names, a Task or Relationship field as its tasks' names, a Formula as
 * its number (or its text), as ClickUp's own imports bring a field they have no
 * like of; a Files field its files, the task's own files too, as a Files field
 * here holds them (`found-14-oct/clickup-import-rest-unimported`). The rest are
 * left out.
 */
export function cuField(f: CuField, fetchFile?: (url: string) => Promise<AppFile | null>): ImFieldValue | null {
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
    case 'users': {
      const names = (Array.isArray(v) ? v : [v])
        .map((u) => (u && typeof u === 'object' ? ((u as CuUser).username ?? (u as CuUser).email ?? '').trim() : ''))
        .filter(Boolean)
      return names.length ? { name, type: 'text', value: names.join(', ') } : null
    }
    case 'tasks':
    case 'list_relationship': {
      const names = (Array.isArray(v) ? v : [v])
        .map((t) => (t && typeof t === 'object' ? String((t as { name?: string }).name ?? '').trim() : ''))
        .filter(Boolean)
      return names.length ? { name, type: 'text', value: names.join(', ') } : null
    }
    case 'formula': {
      const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
      if (Number.isFinite(n)) return { name, type: 'number', value: n }
      return typeof v === 'string' && v.trim() ? { name, type: 'text', value: v.trim() } : null
    }
    case 'attachment': {
      // A Files field: its files, each the task's own file too, as a Files field here keeps them.
      const files = (Array.isArray(v) ? v : [v])
        .map((a) => (a && typeof a === 'object' ? (a as CuAttachment) : null))
        .filter((a): a is CuAttachment => !!a && typeof (a.url_w_query ?? a.url) === 'string')
      if (!files.length || !fetchFile) return null
      return {
        name,
        type: 'files',
        value: files.map((a) => (a.title ?? '').trim() || 'attachment').join(', '),
        files: files.map((a) => ({
          name: (a.title ?? '').trim() || 'attachment',
          size: Number.isFinite(Number(a.size)) ? Number(a.size) : null,
          fetch: () => fetchFile((a.url_w_query ?? a.url)!),
        })),
      }
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
  options: [
    { key: 'docs', choices: ['spaces', 'workspace', 'none'], default: 'spaces' },
    { key: 'time', choices: ['yes', 'no'], default: 'yes' },
    { key: 'goals', choices: ['yes', 'no'], default: 'yes' },
    { key: 'chat', choices: ['yes', 'no'], default: 'yes' },
    { key: 'dms', choices: ['yes', 'no'], default: 'yes' },
  ],
  notImported: [
    'Whiteboards, Dashboards and reminders: ClickUp’s API has no way to read them',
    'Views of a Space, a Folder or Everything (a List’s views come in), and a List’s Doc, Form, Chat and Embed views',
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
    this.http = new AppHttp('ClickUp', [apiUrl(), apiV3Url()], { Authorization: token }, fetchImpl)
  }

  get<T>(path: string, query: Record<string, string | number | boolean> = {}): Promise<T> {
    const url = new URL(apiUrl() + path)
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v))
    return this.http.json<T>(url.toString())
  }

  /** The same, of ClickUp's v3 API. */
  get3<T>(path: string, query: Record<string, string | number | boolean> = {}): Promise<T> {
    const url = new URL(apiV3Url() + path)
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v))
    return this.http.json<T>(url.toString())
  }

  file(url: string) {
    return this.http.file(url)
  }
}

export class ClickUpReader implements AppReader {
  private teams: Promise<Array<{ id: string; name?: string; members?: Array<{ user?: CuUser }> }>> | null = null
  private docsOf: Promise<CuDoc[]> | null = null
  private docPagesRead = 0

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

  async read(source: string, project: AppProject, options: Record<string, string> = {}): Promise<ImNode> {
    const people = await this.people(source)
    const members = new Map(people.map((p) => [p.key, p]))
    const errors: string[] = []
    const space = await this.api.get<CuSpace>(`/space/${encodeURIComponent(project.id)}`)
    const spaceStatuses = space.statuses ?? []
    const folders = (await this.api.get<{ folders?: CuFolder[] }>(`/space/${encodeURIComponent(project.id)}/folder`, { archived: false })).folders ?? []
    const loose = (await this.api.get<{ lists?: CuList[] }>(`/space/${encodeURIComponent(project.id)}/list`, { archived: false })).lists ?? []
    // The Space's tracked time, read once and handed to each of its tasks.
    const time = options.time === 'no' ? new Map<string, ImTime[]>() : await this.timeOf(source, project.id, people, members, errors)
    const outFolders: ImFolder[] = []
    for (const f of folders) {
      if (f.hidden) continue
      const lists: ImList[] = []
      for (const l of f.lists ?? []) lists.push(await this.list(l, f.override_statuses && f.statuses?.length ? f.statuses : spaceStatuses, members, time, errors))
      outFolders.push({ name: f.name || 'Folder', lists, ref: `folder:${f.id}` })
    }
    const outLists: ImList[] = []
    for (const l of loose) outLists.push(await this.list(l, spaceStatuses, members, time, errors))
    // Its Docs: those in it, its Folders and its Lists, hidden Folders' too.
    let docs: ImDoc[] = []
    if (options.docs !== 'none') {
      const places = { space: String(project.id), folders: new Set(folders.map((f) => String(f.id))), lists: new Set([...folders.flatMap((f) => (f.lists ?? []).map((l) => String(l.id))), ...loose.map((l) => String(l.id))]) }
      docs = await this.docsWhere(source, (d) => docIn(d, places), errors)
    }
    return { kind: 'space', name: space.name || project.name, folders: outFolders, lists: outLists, docs, errors, ref: `space:${project.id}` }
  }

  /** The Workspace's own Docs, when asked for, and its Goals and its Chat, once a run. */
  async extras(source: string, options: Record<string, string> = {}): Promise<ImExtras> {
    const errors: string[] = []
    const members = new Map((await this.people(source)).map((p) => [p.key, p]))
    const docs = options.docs === 'workspace' ? await this.docsWhere(source, (d) => docParentKind(d) === 'workspace', errors) : []
    let goals: ImGoal[] = []
    if (options.goals !== 'no') {
      try {
        goals = await this.goals(source, members)
      } catch (e) {
        if (!(e instanceof AppError)) throw e
        errors.push(`Goals could not be read from ClickUp: ${e.message}`)
      }
    }
    const chat = options.chat === 'no' ? [] : await this.chat(source, members, errors, options.dms !== 'no')
    return { docs, goals, chat, errors }
  }

  /** The Workspace's Chat channels, and its direct messages when asked, each with its members and its messages, oldest first. */
  private async chat(team: string, members: Map<string, ImPerson>, errors: string[], dms = true): Promise<ImChannel[]> {
    const who = (id: string) => members.get(`clickup:${id}`) ?? null
    const base = `/workspaces/${encodeURIComponent(team)}/chat`
    let channels: CuChannel[]
    try {
      channels = await this.chatPages<CuChannel>(`${base}/channels`, {}, 'channels', 1_000)
    } catch (e) {
      if (!(e instanceof AppError)) throw e
      errors.push(`Chat could not be read from ClickUp: ${e.message}`)
      return []
    }
    const out: ImChannel[] = []
    const reading = { reactions: 0, said: false }
    for (const c of channels) {
      const type = String(c?.type ?? 'CHANNEL').toUpperCase()
      const dm = type === 'DM' || type === 'GROUP_DM'
      if (!c?.id || (type !== 'CHANNEL' && !dm) || (dm && !dms)) continue
      try {
        const messages = await this.chatMessages(base, String(c.id), who, reading, errors)
        out.push({
          name: (c.name ?? '').trim() || (dm ? 'direct message' : 'channel'),
          description: typeof c.description === 'string' && c.description.trim() ? c.description.trim() : null,
          topic: typeof c.topic === 'string' && c.topic.trim() ? c.topic.trim() : null,
          private: dm || String(c.visibility ?? '').toUpperCase() === 'PRIVATE',
          archived: c.archived === true || c.is_archived === true,
          members: await this.chatMembers(base, String(c.id), who),
          messages,
          dm,
          place: channelPlace(c),
        })
      } catch (e) {
        if (!(e instanceof AppError)) throw e
        errors.push(`The channel "${c.name ?? c.id}" could not be read from ClickUp: ${e.message}`)
      }
    }
    return out
  }

  /** Every page of a Chat listing, up to a bound: ClickUp's 100 a page, the next asked by its cursor. */
  private async chatPages<T>(path: string, query: Record<string, string | number>, key: 'channels' | 'messages' | 'replies' | 'members' | 'reactions', pages: number, most = Infinity): Promise<T[]> {
    const out: T[] = []
    let cursor: string | null = null
    for (let n = 0; n < pages && out.length < most; n++) {
      const body: CuChatPage<T> = await this.api.get3(path, { limit: 100, ...query, ...(cursor ? { cursor } : {}) })
      const rows = body.data ?? body[key] ?? []
      out.push(...rows)
      const next = typeof body.next_cursor === 'string' && body.next_cursor ? body.next_cursor : null
      if (!next || !rows.length || next === cursor) break
      cursor = next
    }
    return out
  }

  /**
   * A channel's newest messages, as Markdown, each thread's replies after its first message, oldest
   * first; each with the files posted in it and, while the run's bound lasts, its reactions.
   */
  private async chatMessages(
    base: string,
    channelId: string,
    who: (id: string) => ImPerson | null,
    reading: { reactions: number; said: boolean },
    errors: string[],
  ): Promise<ImChatMessage[]> {
    const top = (await this.chatPages<CuChatMessage>(`${base}/channels/${encodeURIComponent(channelId)}/messages`, { content_format: 'text/md' }, 'messages', 200, MAX_CHAT_MESSAGES)).slice(0, MAX_CHAT_MESSAGES)
    const raw: Array<{ m: CuChatMessage; parent: string | null }> = []
    for (const m of top) {
      if (!m?.id) continue
      raw.push({ m, parent: null })
      if (m.has_replies !== true && !(Number(m.replies_count) > 0)) continue
      const replies = await this.chatPages<CuChatMessage>(`${base}/messages/${encodeURIComponent(String(m.id))}/replies`, { content_format: 'text/md' }, 'replies', 100)
      for (const r of replies) if (r?.id) raw.push({ m: r, parent: String(m.id) })
    }
    const out: ImChatMessage[] = []
    // The newest first, so a bound on reactions keeps the newest messages' reactions.
    for (const { m, parent } of raw.sort((a, b) => (msDate(b.m.date)?.getTime() ?? 0) - (msDate(a.m.date)?.getTime() ?? 0))) {
      const message = cuChatMessage(m, parent, who, (url) => this.api.file(url))
      if (reading.reactions < MAX_REACTION_READS) {
        reading.reactions++
        message.reactions = await this.reactions(base, String(m.id), who).catch((e) => {
          if (!(e instanceof AppError)) throw e
          return []
        })
      } else if (!reading.said) {
        reading.said = true
        errors.push(`Reactions came in on the newest ${MAX_REACTION_READS} messages of Chat: ClickUp's API is asked once a message for them`)
      }
      out.push(message)
    }
    return out.sort((a, b) => a.at.getTime() - b.at.getTime())
  }

  /** A message's reactions, each by whom and with which emoji, every page of them. */
  private async reactions(base: string, messageId: string, who: (id: string) => ImPerson | null): Promise<NonNullable<ImChatMessage['reactions']>> {
    const rows = await this.chatPages<CuReaction>(`${base}/messages/${encodeURIComponent(messageId)}/reactions`, {}, 'reactions', 20)
    return rows
      .map((r) => {
        const name = String(r?.reaction ?? r?.emoji ?? r?.name ?? '').trim()
        const id = String(r?.user_id ?? r?.user?.id ?? '').trim()
        return name && id ? { person: who(id), emoji: cuEmoji(name) } : null
      })
      .filter((r): r is { person: ImPerson | null; emoji: string } => !!r)
  }

  /** A channel's members where ClickUp says them; where it does not, the channel keeps those it heard from. */
  private async chatMembers(base: string, channelId: string, who: (id: string) => ImPerson | null): Promise<ImPerson[]> {
    try {
      const rows = await this.chatPages<CuChatMember>(`${base}/channels/${encodeURIComponent(channelId)}/members`, {}, 'members', 50)
      return rows.map((r) => who(String(r?.id ?? r?.user_id ?? r?.user?.id ?? ''))).filter((p): p is ImPerson => !!p)
    } catch (e) {
      if (!(e instanceof AppError)) throw e
      return []
    }
  }

  /**
   * The time tracked in a Space, by task: everyone's, asked for a few dozen people at a time — which
   * only a Workspace owner's or admin's token may ask; anyone else's brings only their own, and the run
   * says so. A running timer is not time yet.
   */
  private async timeOf(team: string, space: string, people: ImPerson[], members: Map<string, ImPerson>, errors: string[]): Promise<Map<string, ImTime[]>> {
    const range = { start_date: CLICKUP_EPOCH, end_date: Date.now(), space_id: space }
    const path = `/team/${encodeURIComponent(team)}/time_entries`
    const ids = people.map((p) => p.key.replace(/^clickup:/, '')).filter(Boolean)
    const rows: CuTimeEntry[] = []
    try {
      for (let i = 0; i < Math.max(ids.length, 1); i += TIME_ASSIGNEES) {
        const some = ids.slice(i, i + TIME_ASSIGNEES)
        rows.push(...((await this.api.get<{ data?: CuTimeEntry[] }>(path, { ...range, ...(some.length ? { assignee: some.join(',') } : {}) })).data ?? []))
      }
    } catch (e) {
      if (!(e instanceof AppError)) throw e
      rows.length = 0
      try {
        rows.push(...((await this.api.get<{ data?: CuTimeEntry[] }>(path, range)).data ?? []))
        errors.push('Only a ClickUp Workspace owner’s or admin’s token reads everyone’s tracked time: the time you tracked came in')
      } catch (e2) {
        if (!(e2 instanceof AppError)) throw e2
        errors.push(`Tracked time could not be read from ClickUp: ${e2.message}`)
      }
    }
    const byTask = new Map<string, ImTime[]>()
    const seen = new Set<string>()
    for (const r of rows) {
      const entry = cuTime(r, (u) => members.get(`clickup:${String(u.id)}`) ?? cuPerson(u))
      const taskId = r.task?.id ? String(r.task.id) : null
      if (!entry || !taskId || (r.id && seen.has(String(r.id)))) continue
      if (r.id) seen.add(String(r.id))
      byTask.set(taskId, [...(byTask.get(taskId) ?? []), entry])
    }
    return byTask
  }

  /** Every Doc of the Workspace the token may open, read once a run, a page of them at a time. */
  private allDocs(team: string): Promise<CuDoc[]> {
    this.docsOf ??= (async () => {
      const out: CuDoc[] = []
      let cursor: string | null = null
      for (let n = 0; n < 1_000; n++) {
        const body: { docs?: CuDoc[]; next_cursor?: string | null } = await this.api.get3(`/workspaces/${encodeURIComponent(team)}/docs`, { limit: 100, deleted: false, archived: false, ...(cursor ? { cursor } : {}) })
        const rows = body.docs ?? []
        out.push(...rows)
        if (!rows.length || !body.next_cursor || body.next_cursor === cursor) break
        cursor = body.next_cursor
      }
      return out.filter((d) => d.id && !d.deleted && !d.archived)
    })()
    return this.docsOf
  }

  /** The Docs that pass, each with its pages; what cannot be read is said, and the run goes on. */
  private async docsWhere(team: string, wanted: (d: CuDoc) => boolean, errors: string[]): Promise<ImDoc[]> {
    let all: CuDoc[]
    try {
      all = await this.allDocs(team)
    } catch (e) {
      if (!(e instanceof AppError)) throw e
      errors.push(`Docs could not be read from ClickUp: ${e.message}`)
      return []
    }
    const out: ImDoc[] = []
    for (const d of all.filter(wanted)) {
      if (this.docPagesRead >= MAX_DOC_PAGES) {
        errors.push(`Only the first ${MAX_DOC_PAGES} pages of Docs come in one run: "${d.name ?? 'a Doc'}" and the Docs after it did not`)
        break
      }
      try {
        const body = await this.api.get3<CuPage[] | { pages?: CuPage[] }>(`/workspaces/${encodeURIComponent(team)}/docs/${encodeURIComponent(d.id)}/pages`, { max_page_depth: -1, content_format: 'text/md' })
        const doc = cuDoc(d, Array.isArray(body) ? body : body.pages ?? [])
        this.docPagesRead += doc.pages.length
        out.push(doc)
      } catch (e) {
        if (!(e instanceof AppError)) throw e
        errors.push(`The Doc "${d.name ?? d.id}" could not be read from ClickUp: ${e.message}`)
      }
    }
    return out
  }

  /** The Workspace's Goals, those in Goal Folders too, each read whole for its Targets. */
  private async goals(team: string, members: Map<string, ImPerson>): Promise<ImGoal[]> {
    const body = await this.api.get<{ goals?: CuGoal[]; folders?: Array<{ name?: string | null; goals?: CuGoal[] }> }>(`/team/${encodeURIComponent(team)}/goal`, { include_completed: true })
    // A Goal in a Goal Folder keeps its Folder's name, for the Goal Folder it comes into.
    const folderOf = new Map<string, string>()
    for (const f of body.folders ?? []) for (const g of f.goals ?? []) if (g?.id && f.name?.trim()) folderOf.set(String(g.id), f.name.trim())
    const all = [...(body.goals ?? []), ...(body.folders ?? []).flatMap((f) => f.goals ?? [])]
    const seen = new Set<string>()
    const out: ImGoal[] = []
    const who = (u: CuUser | null | undefined) => (u ? (members.get(`clickup:${String(u.id)}`) ?? cuPerson(u)) : null)
    for (const g of all) {
      if (!g?.id || seen.has(String(g.id)) || g.archived) continue
      seen.add(String(g.id))
      const whole = (await this.api.get<{ goal?: CuGoal }>(`/goal/${encodeURIComponent(String(g.id))}`)).goal ?? g
      out.push({ ...cuGoal({ ...g, ...whole }, who), folder: folderOf.get(String(g.id)) ?? null })
    }
    return out
  }

  /** A List: its statuses (its own when it overrides its Folder's or Space's) and every page of its tasks. */
  private async list(l: CuList, inherited: CuStatus[], members: Map<string, ImPerson>, time: Map<string, ImTime[]> = new Map(), errors: string[] = []): Promise<ImList> {
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
    const build = (t: CuTask): ImTask => ({ ...this.task(t, (children.get(t.id) ?? []).map(build), closedNames, members), time: time.get(t.id) ?? [] })
    return {
      name: l.name || 'List',
      description: typeof l.content === 'string' && l.content.trim() ? l.content : null,
      statuses,
      tasks: all.filter((t) => !t.archived && !(t.parent && byId.has(t.parent))).map(build),
      ref: `list:${l.id}`,
      views: await this.views(l, members, errors),
    }
  }

  /** A List's saved views, those of a kind a List here has, in ClickUp's order; what cannot be read is said. */
  private async views(l: CuList, members: Map<string, ImPerson>, errors: string[]): Promise<ImView[]> {
    let rows: CuView[]
    try {
      const body = await this.api.get<{ views?: CuView[] }>(`/list/${encodeURIComponent(l.id)}/view`)
      rows = body.views ?? []
    } catch (e) {
      if (!(e instanceof AppError) || e.status === 401) throw e
      errors.push(`The views of the List "${l.name ?? l.id}" could not be read from ClickUp: ${e.message}`)
      return []
    }
    const who = (id: string) => members.get(`clickup:${id}`) ?? null
    return rows
      .sort((a, b) => Number(a.orderindex ?? 0) - Number(b.orderindex ?? 0))
      .map((v) => cuView(v, who))
      .filter((v): v is ImView => !!v)
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
      fields: (t.custom_fields ?? []).map((f) => cuField(f, (url) => this.api.file(url))).filter((f): f is ImFieldValue => !!f),
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

/** Where a Doc lives, by its `parent`'s type: a Space (4), a Folder (5), a List (6), or the Workspace itself (Everything, 7; the Workspace, 12). */
export function docParentKind(d: CuDoc): 'space' | 'folder' | 'list' | 'workspace' {
  const type = String(d.parent?.type ?? '').toUpperCase()
  if (type === '4' || type === 'SPACE') return 'space'
  if (type === '5' || type === 'FOLDER') return 'folder'
  if (type === '6' || type === 'LIST') return 'list'
  return 'workspace'
}

/** Whether a Doc is in this Space: in it, or in one of its Folders or Lists. */
export function docIn(d: CuDoc, places: { space: string; folders: Set<string>; lists: Set<string> }): boolean {
  const id = String(d.parent?.id ?? '')
  switch (docParentKind(d)) {
    case 'space':
      return id === places.space
    case 'folder':
      return places.folders.has(id)
    case 'list':
      return places.lists.has(id)
    default:
      return false
  }
}

/**
 * A Doc as Docs here: its first page is the Doc's own body, under the Doc's name;
 * that page's own pages, and the Doc's other pages, are pages under it, each with
 * theirs under them as ClickUp nests them. Archived and deleted pages stay behind.
 */
export function cuDoc(d: CuDoc, pages: CuPage[]): ImDoc {
  const live = (all: CuPage[] | undefined) => (all ?? []).filter((p) => p && p.id && !p.deleted && !p.archived)
  const top = live(pages)
  const root = `doc:${d.id}`
  const first = top[0]
  const title = (d.name ?? '').trim() || (first?.name ?? '').trim() || 'Untitled'
  const out: ImDocPage[] = [{ key: root, parent: null, title, markdown: first?.content ?? '' }]
  const walk = (all: CuPage[], parent: string) => {
    for (const p of live(all)) {
      const key = `page:${p.id}`
      out.push({ key, parent, title: (p.name ?? '').trim() || 'Untitled', markdown: p.content ?? '' })
      walk(p.pages ?? [], key)
    }
  }
  if (first) walk(first.pages ?? [], root)
  walk(top.slice(1), root)
  return { title, pages: out }
}

/** An entry of tracked time, or none: a running timer (a negative duration) or one with no start is not time yet. */
export function cuTime(r: CuTimeEntry, who: (u: CuUser) => ImPerson | null): ImTime | null {
  const ms = Number(r.duration)
  const start = msDate(r.start)
  if (!start || !Number.isFinite(ms) || ms <= 0) return null
  return {
    person: r.user ? who(r.user) : null,
    start,
    end: msDate(r.end) ?? new Date(start.getTime() + ms),
    seconds: Math.round(ms / 1000),
    billable: r.billable === true,
    description: typeof r.description === 'string' && r.description.trim() ? r.description.trim() : null,
  }
}

const numberOf = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

/**
 * A Target as a key result here, which counts from nothing to its target: a
 * number, currency or percentage target from its start to its end (one that
 * counts down, too), a true/false one as one to do, a tasks one as its tasks done
 * of its tasks. Its owner is its first.
 */
export function cuKeyResult(k: CuKeyResult, who: (u: CuUser | null | undefined) => ImPerson | null): ImKeyResult {
  const name = (k.name ?? '').trim() || 'Target'
  const owner = who(k.owners?.[0])
  const done = k.completed === true
  if (k.type === 'boolean') return { name, unit: null, target: 1, current: done ? 1 : 0, done, owner }
  const start = numberOf(k.steps_start) ?? 0
  const end = numberOf(k.steps_end) ?? (k.type === 'percentage' ? 100 : start)
  const now = numberOf(k.steps_current) ?? numberOf(k.last_action?.steps_current) ?? start
  const target = Math.abs(end - start)
  const current = Math.max(0, Math.min(target, end >= start ? now - start : start - now))
  const unit = k.type === 'percentage' ? '%' : k.type === 'automatic' ? 'tasks' : (k.unit ?? '').trim() || null
  return { name, unit, target, current, done: done || (target > 0 && current >= target), owner }
}

/** A Goal: its progress from its Targets when it has any (as ClickUp's is), else as it says; done at its end. */
export function cuGoal(g: CuGoal, who: (u: CuUser | null | undefined) => ImPerson | null): ImGoal {
  const keyResults = (g.key_results ?? []).map((k) => cuKeyResult(k, who))
  let percent: number
  if (keyResults.length) {
    percent = (keyResults.reduce((sum, k) => sum + (k.done ? 1 : k.target > 0 ? Math.min(1, k.current / k.target) : 0), 0) / keyResults.length) * 100
  } else {
    const said = numberOf(g.percent_completed) ?? 0
    // ClickUp says it as a share of one in some answers and of a hundred in others.
    percent = said > 0 && said < 1 ? said * 100 : said
  }
  percent = Math.max(0, Math.min(100, percent))
  return {
    name: (g.name ?? '').trim() || 'Goal',
    description: typeof g.description === 'string' && g.description.trim() ? g.description.trim() : null,
    start: msDate(g.start_date),
    due: msDate(g.due_date),
    owner: who(g.owners?.[0] ?? g.owner),
    percent,
    done: percent >= 100,
    keyResults,
  }
}

/**
 * A Chat message's Markdown as Rundesk keeps it: each mention of a person (`[@Name](#user_mention#<id>)`)
 * a token the writer fills with a mention of the member they are here, or their name; a group's mention
 * its name; any other of ClickUp's own anchors (`#task_mention#…`) its words.
 */
export function cuChatText(content: string, who: (id: string) => ImPerson | null): { text: string; mentions: ImChatMessage['mentions'] } {
  const mentions: ImChatMessage['mentions'] = []
  const text = content
    .replace(/\[@([^\]]*)\]\(#user_mention#([^)\s]+)\)/g, (_whole, name: string, id: string) => {
      mentions.push({ person: who(id), name: name.trim() || 'someone' })
      return mentionToken(mentions.length - 1)
    })
    .replace(/\[@([^\]]*)\]\(#user_group_mention#[^)]*\)/g, (_whole, name: string) => `@${name.trim() || 'group'}`)
    .replace(/\[([^\]]*)\]\(#[a-z_]+#[^)]*\)/g, (_whole, words: string) => words)
  return { text, mentions }
}

/**
 * A Chat message: its author when they are a person of the Workspace, else the name it is drawn under —
 * ClickUp itself for its own posts; and the files posted in it, which its Markdown names by their place
 * in ClickUp's file store, taken out of its words.
 */
export function cuChatMessage(m: CuChatMessage, parent: string | null, who: (id: string) => ImPerson | null, fetchFile?: (url: string) => Promise<AppFile | null>): ImChatMessage {
  const userId = m.user_id === undefined || m.user_id === null ? '' : String(m.user_id)
  const author = userId && userId !== '-1' ? who(userId) : null
  const authorName = author?.name ?? author?.email ?? (!userId || userId === '-1' ? 'ClickUp' : `ClickUp user ${userId}`)
  const { text: words, files } = chatFiles(String(m.content ?? m.text ?? ''))
  const { text, mentions } = cuChatText(words, who)
  const message: ImChatMessage = { ref: String(m.id), parent, author, authorName, text, mentions, at: msDate(m.date) ?? new Date() }
  if (files.length && fetchFile) message.files = files.map((f) => ({ name: f.name, size: null, fetch: () => fetchFile(f.url) }))
  return message
}

/** An address on ClickUp's file store, where a file posted in Chat is kept; or, on a lane, the stub's own. */
export function isClickUpFile(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    if (u.hostname === 'clickup-attachments.com' || u.hostname.endsWith('.clickup-attachments.com')) return true
    return u.origin === new URL(apiUrl()).origin && u.pathname.includes('/attachments/')
  } catch {
    return false
  }
}

/**
 * The files a Chat message's Markdown names — an image (`![name](url)`) or a link (`[name](url)`) to
 * ClickUp's file store — each with its name (the link's words, else the address's `filename` or its
 * last part), and the words without them.
 */
export function chatFiles(markdown: string): { text: string; files: Array<{ name: string; url: string }> } {
  const files: Array<{ name: string; url: string }> = []
  const seen = new Set<string>()
  const text = markdown.replace(/!?\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (whole, label: string, url: string) => {
    if (!isClickUpFile(url)) return whole
    if (!seen.has(url)) {
      seen.add(url)
      files.push({ name: fileNameOf(label, url), url })
    }
    return ''
  })
  return { text: text.replace(/\n{3,}/g, '\n\n').trim(), files }
}

function fileNameOf(label: string, url: string): string {
  const said = label.trim()
  if (said && !/^https?:\/\//i.test(said)) return said.slice(0, 255)
  try {
    const u = new URL(url)
    const named = u.searchParams.get('filename')
    if (named?.trim()) return named.trim().slice(0, 255)
    const last = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '')
    return last.trim().slice(0, 255) || 'file'
  } catch {
    return 'file'
  }
}

/** A reaction's emoji, from the name ClickUp keeps it by (`thumbsup`, `white_check_mark`), as the Slack import reads Slack's. */
export function cuEmoji(name: string): string {
  const bare = name.trim().replace(/^:|:$/g, '')
  // A reaction already kept as its character is that character.
  if (/[^\x00-\x7f]/.test(bare)) return bare
  return slackEmoji(bare.toLowerCase())
}

/**
 * The Space, Folder or List a channel belongs to, as the ref its node has: by its `parent` or
 * `location` when the API says, else by its id — `4-<id>-…` a Space's, `5-…` a Folder's, `6-…` a
 * List's, as a Doc's parent is typed. None for a channel of the Workspace.
 */
export function channelPlace(c: CuChannel): string | null {
  const said = c.parent ?? c.location
  const kind = (type: unknown) => {
    const t = String(type ?? '').toUpperCase()
    return t === '4' || t === 'SPACE' ? 'space' : t === '5' || t === 'FOLDER' ? 'folder' : t === '6' || t === 'LIST' ? 'list' : null
  }
  if (said?.id !== undefined && said?.id !== null) {
    const k = kind(said.type)
    return k ? `${k}:${String(said.id)}` : null
  }
  const m = /^([456])-([^-]+)-\d+$/.exec(String(c.id))
  if (!m) return null
  return `${kind(m[1])}:${m[2]}`
}

/** ClickUp's view types, as the kinds of view a List has here; a Doc, Form, Chat, Embed or Whiteboard view has none. */
const VIEW_TYPES: Record<string, ImView['type']> = {
  list: 'list',
  board: 'board',
  calendar: 'calendar',
  gantt: 'gantt',
  table: 'table',
  timeline: 'timeline',
  workload: 'workload',
  activity: 'activity',
  map: 'map',
  mind_map: 'mindmap',
  mindmap: 'mindmap',
  box: 'team',
  team: 'team',
}
const VIEW_GROUPS: Record<string, ImView['groupBy']> = { status: 'status', priority: 'priority', assignee: 'assignee' }
const VIEW_SORTS: Record<string, NonNullable<ImView['sort']>['field']> = {
  name: 'title',
  status: 'status',
  priority: 'priority',
  dueDate: 'due',
  due_date: 'due',
  assignee: 'assignee',
  dateCreated: 'created',
  date_created: 'created',
}

/** A List's view as a view here: its kind, name, grouping, first sort, pinned, private to its maker or protected. */
export function cuView(v: CuView, who: (id: string) => ImPerson | null): ImView | null {
  const type = VIEW_TYPES[String(v.type ?? '').toLowerCase()]
  if (!type) return null
  const sort = v.sorting?.fields?.[0]
  const sortField = sort?.field ? VIEW_SORTS[sort.field] : undefined
  return {
    name: (v.name ?? '').trim() || type,
    type,
    pinned: v.pinned === true,
    private: String(v.visibility ?? '').toLowerCase() === 'private',
    protected: v.protected === true,
    owner: v.creator !== undefined && v.creator !== null ? who(String(v.creator)) : null,
    groupBy: VIEW_GROUPS[String(v.grouping?.field ?? '')] ?? null,
    sort: sortField ? { field: sortField, dir: Number(sort?.dir) < 0 ? 'desc' : 'asc' } : null,
  }
}
