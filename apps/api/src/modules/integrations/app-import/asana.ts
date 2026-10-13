import { AppHttp, dateOf, hasTime } from './app-http'
import { oauthToken, person, setting, type AppDef, type AppProject, type AppReader, type GrantToken } from './app-def'
import { imTask, type ImList, type ImNode, type ImTask } from './import-tree'
import { htmlToMarkdown } from './rich-text'

/**
 * ASANA, IMPORTED AS CLICKUP IMPORTS IT (`found-13-oct/importers-by-sign-in-unbuilt`).
 *
 * ClickUp: "Sign in to your Asana account in the pop-up", then choose the
 * Asana workspace and its projects. "Your Asana Projects are imported into
 * public ClickUp Folders"; their sections are, as the importer chooses,
 * workflow STATUSES (the Folder holds one List, "Imported from Asana") or
 * LISTS of their own. Tasks come with their subtasks — one level: "nested
 * subtasks" do not import — assignees, dates, tags, comments and files.
 * Custom fields come in through the Spreadsheet importer, as ClickUp says.
 * (Help centre, "Import from Asana", and its feedback board, read through
 * search excerpts, 13 October.)
 *
 * Over Asana's own API (developers.asana.com): OAuth at `-/oauth_authorize`
 * and `-/oauth_token`; `users/me` and its workspaces; `projects`, a project's
 * `sections` and `tasks`, a task's `subtasks`, `stories` (its comments are the
 * `comment_added` ones) and `attachments` (a file's `download_url` is a signed
 * address on Asana's store). Every list is paged by `next_page.uri`.
 */

const authUrl = () => setting('ASANA_AUTH_URL', 'https://app.asana.com/-/oauth_authorize')
const tokenUrl = () => setting('ASANA_TOKEN_URL', 'https://app.asana.com/-/oauth_token')
const apiUrl = () => setting('ASANA_API_URL', 'https://app.asana.com/api/1.0')

const TASK_FIELDS =
  'name,notes,html_notes,completed,completed_at,due_on,due_at,start_on,created_at,assignee.name,assignee.email,tags.name,memberships.project.gid,memberships.section.gid,num_subtasks'

type AsTask = {
  gid: string
  name?: string
  notes?: string
  html_notes?: string
  completed?: boolean
  completed_at?: string | null
  due_on?: string | null
  due_at?: string | null
  start_on?: string | null
  created_at?: string
  assignee?: { gid: string; name?: string; email?: string } | null
  tags?: Array<{ name?: string }>
  memberships?: Array<{ project?: { gid?: string }; section?: { gid?: string } }>
  num_subtasks?: number
}

export const ASANA: AppDef = {
  key: 'asana',
  label: 'Asana',
  icon: '🧭',
  auth: 'oauth',
  env: ['ASANA_CLIENT_ID', 'ASANA_CLIENT_SECRET'],
  options: [{ key: 'sections', choices: ['statuses', 'lists'], default: 'statuses' }],
  notImported: [
    'Custom fields: bring them in with the Spreadsheet importer, as ClickUp’s Asana import says',
    'Subtasks of subtasks',
    'Tasks in no project, and @mentions',
  ],
  authorizeUrl: (redirectUri, state) =>
    `${authUrl()}?${new URLSearchParams({ client_id: process.env.ASANA_CLIENT_ID ?? '', redirect_uri: redirectUri, response_type: 'code', state }).toString()}`,
  exchange: (code, redirectUri) =>
    oauthToken('Asana', tokenUrl(), {
      grant_type: 'authorization_code',
      client_id: process.env.ASANA_CLIENT_ID ?? '',
      client_secret: process.env.ASANA_CLIENT_SECRET ?? '',
      redirect_uri: redirectUri,
      code,
    }),
  refresh: async (refreshToken, redirectUri) => {
    const fresh = await oauthToken('Asana', tokenUrl(), {
      grant_type: 'refresh_token',
      client_id: process.env.ASANA_CLIENT_ID ?? '',
      client_secret: process.env.ASANA_CLIENT_SECRET ?? '',
      redirect_uri: redirectUri,
      refresh_token: refreshToken,
    })
    // Asana keeps the refresh token across a refresh.
    return { ...fresh, refreshToken: fresh.refreshToken ?? refreshToken }
  },
  identify: async (token: GrantToken) => {
    const http = new AppHttp('Asana', [apiUrl()], { Authorization: `Bearer ${token.accessToken}` })
    const me = (await http.json<{ data?: { gid?: string; name?: string; email?: string; workspaces?: Array<{ gid: string; name: string }> } }>(`${apiUrl()}/users/me?opt_fields=name,email,workspaces.name`)).data ?? {}
    return { name: me.name || me.email || 'Asana', email: me.email ?? null, account: { id: me.gid ?? null, workspaces: me.workspaces ?? [] } }
  },
  reader: (grant) => new AsanaReader(grant.accessToken),
}

class AsanaReader implements AppReader {
  private readonly http: AppHttp

  constructor(token: string) {
    this.http = new AppHttp('Asana', [apiUrl()], { Authorization: `Bearer ${token}` })
  }

  /** Every page of a list, following `next_page.uri` to the end. */
  private async all<T>(url: string, maxPages = 500): Promise<T[]> {
    const out: T[] = []
    let next: string | null = url
    for (let page = 0; next && page < maxPages; page++) {
      const body: { data?: T[]; next_page?: { uri?: string } | null } = await this.http.json(next)
      out.push(...(body.data ?? []))
      next = body.next_page?.uri ?? null
    }
    return out
  }

  async sources() {
    const me = (await this.http.json<{ data?: { workspaces?: Array<{ gid: string; name: string }> } }>(`${apiUrl()}/users/me?opt_fields=workspaces.name`)).data
    return (me?.workspaces ?? []).map((w) => ({ id: w.gid, name: w.name }))
  }

  async projects(workspace: string): Promise<AppProject[]> {
    const rows = await this.all<{ gid: string; name: string; team?: { name?: string } | null }>(
      `${apiUrl()}/projects?${new URLSearchParams({ workspace, archived: 'false', limit: '100', opt_fields: 'name,team.name' }).toString()}`,
    )
    return rows.map((p) => ({ id: p.gid, name: p.name, detail: p.team?.name ?? null }))
  }

  async people(workspace: string) {
    const rows = await this.all<{ gid: string; name?: string; email?: string }>(
      `${apiUrl()}/users?${new URLSearchParams({ workspace, limit: '100', opt_fields: 'name,email' }).toString()}`,
    )
    return rows.map((u) => person('asana', u.gid, u.name, u.email))
  }

  async read(_workspace: string, project: AppProject, options: Record<string, string>): Promise<ImNode> {
    const sections = await this.all<{ gid: string; name: string }>(`${apiUrl()}/projects/${encodeURIComponent(project.id)}/sections?limit=100&opt_fields=name`)
    const raw = await this.all<AsTask>(`${apiUrl()}/projects/${encodeURIComponent(project.id)}/tasks?limit=100&opt_fields=${TASK_FIELDS}`)
    const sectionOf = (t: AsTask) => t.memberships?.find((m) => m.project?.gid === project.id)?.section?.gid ?? null
    const nameOf = new Map(sections.map((s) => [s.gid, s.name]))
    const tasks: Array<{ task: ImTask; section: string | null }> = []
    for (const t of raw) {
      const task = this.task(t)
      if ((t.num_subtasks ?? 0) > 0) {
        // One level, as ClickUp's: a subtask's own subtasks are not asked for.
        const subs = await this.all<AsTask>(`${apiUrl()}/tasks/${encodeURIComponent(t.gid)}/subtasks?limit=100&opt_fields=${TASK_FIELDS}`)
        task.subtasks = subs.map((s) => this.task(s))
      }
      tasks.push({ task, section: sectionOf(t) })
    }
    let lists: ImList[]
    if (options.sections === 'lists') {
      lists = sections.map((s) => ({ name: s.name, statuses: null, tasks: tasks.filter((t) => t.section === s.gid).map((t) => t.task) }))
      const loose = tasks.filter((t) => !t.section || !nameOf.has(t.section)).map((t) => t.task)
      if (loose.length) lists.push({ name: 'Untitled section', statuses: null, tasks: loose })
    } else {
      for (const t of tasks) t.task.status = t.section ? nameOf.get(t.section) ?? null : null
      lists = [{ name: 'Imported from Asana', statuses: sections.map((s) => ({ name: s.name, category: 'open' as const })), tasks: tasks.map((t) => t.task) }]
    }
    return { kind: 'folder', folder: { name: project.name, lists } }
  }

  private task(t: AsTask): ImTask {
    const gid = t.gid
    return imTask(gid, t.name ?? '', {
      description: htmlToMarkdown(t.html_notes) || t.notes?.trim() || null,
      done: t.completed === true,
      doneAt: dateOf(t.completed_at),
      due: dateOf(t.due_at ?? t.due_on),
      dueHasTime: !!t.due_at && hasTime(t.due_at),
      start: dateOf(t.start_on),
      created: dateOf(t.created_at),
      assignees: t.assignee ? [person('asana', t.assignee.gid, t.assignee.name, t.assignee.email)] : [],
      tags: (t.tags ?? []).map((x) => x.name ?? '').filter(Boolean),
      details: async () => {
        const stories = await this.all<{ resource_subtype?: string; text?: string; html_text?: string; created_at?: string; created_by?: { gid?: string; name?: string; email?: string } | null }>(
          `${apiUrl()}/tasks/${encodeURIComponent(gid)}/stories?limit=100&opt_fields=resource_subtype,text,html_text,created_at,created_by.name,created_by.email`,
        )
        const files = await this.all<{ gid: string; name?: string; download_url?: string | null; size?: number }>(
          `${apiUrl()}/tasks/${encodeURIComponent(gid)}/attachments?limit=100&opt_fields=name,download_url,size`,
        )
        return {
          comments: stories
            .filter((s) => s.resource_subtype === 'comment_added')
            .map((s) => ({
              author: s.created_by?.gid ? person('asana', s.created_by.gid, s.created_by.name, s.created_by.email) : null,
              text: htmlToMarkdown(s.html_text) || s.text?.trim() || '',
              at: dateOf(s.created_at),
            })),
          // A file kept elsewhere (Drive, Dropbox) has no `download_url`: it is a link, not a file.
          files: files
            .filter((f) => typeof f.download_url === 'string' && f.download_url)
            .map((f) => ({ name: f.name ?? 'file', size: f.size ?? null, fetch: () => this.http.file(f.download_url!) })),
        }
      },
    })
  }
}
