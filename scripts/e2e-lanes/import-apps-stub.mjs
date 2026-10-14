/**
 * THE SIX TOOLS AN IMPORT SIGNS IN TO, FOR A LANE (`found-13-oct/importers-by-sign-in-unbuilt`).
 *
 * Asana, Jira, Trello, Todoist, Wrike and Monday, answered as their APIs answer
 * what the importers (`apps/api/src/modules/integrations/app-import/`) ask —
 * each at its own path on the calendar stub, which serves this module, so a
 * lane points every `*_URL` at one port (`lane-env.sh`, `lane_calendar_env`).
 * Their shapes are the tools' own (each importer's header names its source);
 * what an account holds is whatever a suite seeds:
 *
 *   POST /__control/apps {app, token, refreshToken?, name, email, data, fail?}
 *        seed (replace) one sign-in to one tool. `data` is that tool's account,
 *        in the shapes below; `fail` {status, count, path?} makes the next `count`
 *        API requests — those whose path holds `path`, when it is given — answer
 *        `status` (a 429 says Retry-After: 1).
 *        The code a sign-in comes back with is staged on the calendar stub's own
 *        POST /__control/code {code, accessToken: token, provider: app}.
 *   GET  /__control/apps?app=&token=     what was asked of it, request by request
 *
 *   asana   data: {workspaces: [{gid, name, users: [{gid, name, email}], projects: [{gid, name, team?,
 *                  sections: [{gid, name}], tasks: [task]}]}]}
 *           task: {gid, name, notes?, html_notes?, completed?, completed_at?, due_on?, due_at?, start_on?,
 *                  created_at?, assignee?: {gid, name, email}, tags?: [name], section?: gid, subtasks?: [task],
 *                  comments?: [{text, created_at, created_by: {gid, name, email}}],
 *                  files?: [{gid, name, content, external?}]}
 *   jira    data: {me: {account_id, email, name}, sites: [{id, name, url, users: [user], fields: [field],
 *                  projects: [{id, key, name, types: [{id, name, subtask, hierarchyLevel, statuses: [status]}],
 *                  issues: [{id, key, fields, comments?: [comment], files?: [{id, filename, content}]}]}]}]}
 *   trello  data: {me: {id, fullName, username, email}, orgs: [{id, displayName}], boards: [{id, name, idOrganization,
 *                  lists, cards, customFields, members, comments: [{id, card, text, date, member: {id, fullName}}],
 *                  files: {attachmentId: content}}]}
 *   todoist data: {user: {id, full_name, email}, projects: [{id, name, parent_id?, created_at?, collaborators,
 *                  sections, tasks, completed?, comments?: {taskId: [comment]}}]}
 *   wrike   data: {host, account: {name}, contacts: [contact], workflows, customfields, spaces: [{id, title,
 *                  folders: [folder], tasks: {folderId: [task]}}], comments?: {taskId: [comment]},
 *                  files?: {taskId: [{id, name, content}]}}   (contacts[0] is whoever signed in)
 *   clickup data: {user: {id, username, email}, teams: [{id, name, members: [{user: {id, username, email, role}}],
 *                  spaces: [{id, name, private?, statuses, folders: [{id, name, hidden?, override_statuses?, statuses?,
 *                  lists: [list]}], lists: [list]}]}]}   (`found-14-oct/clickup-workspace-import-and-people-unbuilt`)
 *           list: {id, name, content?, override_statuses?, statuses?, tasks: [task]}; a task in ClickUp's own shape,
 *                  with `comments: [{id, comment_text, user, date}]` and `attachments: [{id, title, content}]`
 *           a team's docs: [{id, name, parent: {id, type}, pages: [{id, name, content, pages}]}] (v3), its
 *                  time_entries: [{id, task: {id}, user, billable, start, end, duration, description}] and its
 *                  goals: [{id, name, …, key_results}]   (`found-14-oct/clickup-docs-time-goals-unimported`)
 *           and its chat: [{id, name, type CHANNEL|DM, visibility, members?: [userId], messages: [{id, content,
 *                  user_id, date, replies?: [message]}]}] (v3, `found-14-oct/clickup-chat-unimported`)
 *           and the rest (`found-14-oct/clickup-import-rest-unimported`): a list's views: [{id, name, type,
 *                  visibility, protected, pinned, creator, grouping, sorting}]; a message's reactions:
 *                  [{reaction, user_id}] and files: [{id, name, content, mimetype?}], drawn in its Markdown as
 *                  ClickUp draws them, links to the file store (here `/clickup/attachments/…`); a channel of a
 *                  Space has the id ClickUp gives one (`4-<space id>-8`); a team's goal_folders: [{id, name,
 *                  goals: [goal]}]; a task's Files field: {type: 'attachment', value: [{id, title, content}]}
 *   monday  data: {me: {id, name, email, account: {name}}, users: [user], boards: [{id, name, type?, workspace?,
 *                  columns, groups, items}]}
 *
 * Every list is paged as its tool pages it, a few rows a page, so an importer
 * that reads one page reads too little here.
 */

const PAGE = 2

/** app → token → { name, email, data, refreshToken, asked: [], fail } */
const grants = new Map()
/** app → refresh token → token */
const refreshes = new Map()

const grantsOf = (app) => grants.get(app) ?? grants.set(app, new Map()).get(app)

const readForm = (req) =>
  new Promise((resolve) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      const type = String(req.headers['content-type'] ?? '')
      if (type.includes('json')) {
        try {
          resolve(JSON.parse(raw || '{}'))
        } catch {
          resolve({})
        }
      } else resolve(Object.fromEntries(new URLSearchParams(raw)))
    })
  })

function send(res, status, body, headers = {}) {
  const s = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)
  res.writeHead(status, { 'content-type': typeof body === 'string' || Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json', 'content-length': Buffer.byteLength(s), ...headers })
  res.end(s)
}

/** The grant a request carries, its ask recorded; or the answer that refuses it. */
function authorize(app, req, res, url, token) {
  const g = grantsOf(app).get(token ?? '')
  if (!g) {
    send(res, 401, app === 'monday' ? { errors: [{ message: 'Not Authenticated: invalid token' }] } : app === 'clickup' ? { err: 'Token invalid', ECODE: 'OAUTH_025' } : { error: 'invalid token' })
    return null
  }
  g.asked.push(`${req.method} ${url.pathname}${url.search}`)
  if (g.fail && g.fail.count > 0 && (!g.fail.path || url.pathname.includes(g.fail.path))) {
    g.fail.count -= 1
    send(res, g.fail.status, { error: `the stub was asked to answer ${g.fail.status}` }, g.fail.status === 429 ? { 'retry-after': '1' } : {})
    return null
  }
  return g
}

const bearer = (req) => /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? ''

/** A code staged on the calendar stub for this tool, exchanged once. */
function exchange(app, codes, code) {
  const staged = codes.get(code ?? '')
  if (!staged || staged.provider !== app || !grantsOf(app).has(staged.accessToken)) return null
  codes.delete(code)
  return grantsOf(app).get(staged.accessToken) && staged.accessToken
}

// ── Asana ──────────────────────────────────────────────────────────────────────

/** One of Asana's pages: `data`, and `next_page.uri` while there is more. */
function asanaPage(res, url, rows) {
  const offset = Number(url.searchParams.get('offset') ?? 0)
  const slice = rows.slice(offset, offset + PAGE)
  let next_page = null
  if (offset + PAGE < rows.length) {
    const u = new URL(url)
    u.searchParams.set('offset', String(offset + PAGE))
    next_page = { offset: String(offset + PAGE), path: u.pathname + u.search, uri: u.toString() }
  }
  return send(res, 200, { data: slice, next_page })
}

function asanaTask(t, base) {
  return {
    gid: t.gid,
    name: t.name,
    notes: t.notes ?? '',
    html_notes: t.html_notes ?? `<body>${t.notes ?? ''}</body>`,
    completed: t.completed === true,
    completed_at: t.completed_at ?? null,
    due_on: t.due_on ?? null,
    due_at: t.due_at ?? null,
    start_on: t.start_on ?? null,
    created_at: t.created_at ?? '2026-09-01T09:00:00.000Z',
    assignee: t.assignee ?? null,
    tags: (t.tags ?? []).map((name, n) => ({ gid: `${t.gid}-tag-${n}`, name })),
    memberships: t.section ? [{ project: { gid: t.project }, section: { gid: t.section } }] : [],
    num_subtasks: (t.subtasks ?? []).length,
    _base: base,
  }
}

async function asana(req, res, url, ctx) {
  const path = url.pathname.slice('/asana'.length)
  if (path === '/-/oauth_token' && req.method === 'POST') {
    const f = await readForm(req)
    if (f.client_id !== 'stub-asana' || f.client_secret !== 'stub-asana-secret') return send(res, 401, { error: 'invalid_client' })
    if (f.grant_type === 'refresh_token') {
      const token = refreshes.get('asana')?.get(f.refresh_token)
      return token ? send(res, 200, { access_token: token, token_type: 'bearer', expires_in: 3600 }) : send(res, 400, { error: 'invalid_grant' })
    }
    const token = f.grant_type === 'authorization_code' ? exchange('asana', ctx.codes, f.code) : null
    if (!token) return send(res, 400, { error: 'invalid_grant' })
    const g = grantsOf('asana').get(token)
    return send(res, 200, { access_token: token, refresh_token: g.refreshToken ?? undefined, token_type: 'bearer', expires_in: 3600, data: { name: g.name, email: g.email } })
  }
  if (path.startsWith('/files/') && req.method === 'GET') {
    // A signed address on Asana's store: it needs no grant.
    for (const g of grantsOf('asana').values()) {
      for (const w of g.data.workspaces ?? []) for (const p of w.projects ?? []) for (const t of allAsana(p.tasks)) for (const f of t.files ?? []) if (`/files/${f.gid}` === path) return send(res, 200, String(f.content ?? ''))
    }
    return send(res, 404, { errors: [{ message: 'Not found' }] })
  }
  const g = authorize('asana', req, res, url, bearer(req))
  if (!g) return
  const api = '/api/1.0'
  if (!path.startsWith(api)) return send(res, 404, { errors: [{ message: 'Not found' }] })
  const rest = path.slice(api.length)
  const base = `${ctx.base}/asana`
  const workspaces = g.data.workspaces ?? []
  const projects = workspaces.flatMap((w) => (w.projects ?? []).map((p) => ({ ...p, workspace: w.gid })))
  const tasks = projects.flatMap((p) => allAsana(p.tasks).map((t) => ({ ...t, project: t.project ?? p.gid })))
  if (rest === '/users/me') return send(res, 200, { data: { gid: 'asana-me', name: g.name, email: g.email, workspaces: workspaces.map((w) => ({ gid: w.gid, name: w.name })) } })
  if (rest === '/projects') return asanaPage(res, url, projects.filter((p) => p.workspace === url.searchParams.get('workspace')).map((p) => ({ gid: p.gid, name: p.name, team: p.team ? { name: p.team } : null })))
  if (rest === '/users') return asanaPage(res, url, (workspaces.find((w) => w.gid === url.searchParams.get('workspace'))?.users ?? []))
  let m = /^\/projects\/([^/]+)\/(sections|tasks)$/.exec(rest)
  if (m) {
    const p = projects.find((x) => x.gid === m[1])
    if (!p) return send(res, 404, { errors: [{ message: 'project: Not a recognized ID' }] })
    if (m[2] === 'sections') return asanaPage(res, url, (p.sections ?? []).map((s) => ({ gid: s.gid, name: s.name })))
    return asanaPage(res, url, (p.tasks ?? []).map((t) => strip(asanaTask({ ...t, project: p.gid }, base))))
  }
  m = /^\/tasks\/([^/]+)\/(subtasks|stories|attachments)$/.exec(rest)
  if (m) {
    const t = tasks.find((x) => x.gid === m[1])
    if (!t) return send(res, 404, { errors: [{ message: 'task: Not a recognized ID' }] })
    if (m[2] === 'subtasks') return asanaPage(res, url, (t.subtasks ?? []).map((s) => strip(asanaTask(s, base))))
    if (m[2] === 'stories') {
      const comments = (t.comments ?? []).map((c, n) => ({ gid: `${t.gid}-s${n}`, resource_subtype: 'comment_added', type: 'comment', text: c.text, html_text: `<body>${c.text}</body>`, created_at: c.created_at, created_by: c.created_by }))
      // A task's story list holds what happened to it as well as what was said.
      return asanaPage(res, url, [{ gid: `${t.gid}-made`, resource_subtype: 'added_to_project', type: 'system', text: 'added to the project', created_at: '2026-09-01T09:00:00.000Z' }, ...comments])
    }
    return asanaPage(res, url, (t.files ?? []).map((f) => ({ gid: f.gid, name: f.name, size: String(f.content ?? '').length, download_url: f.external ? null : `${ctx.base}/asana/files/${f.gid}` })))
  }
  return send(res, 404, { errors: [{ message: 'Not found' }] })
}
const allAsana = (ts) => (ts ?? []).flatMap((t) => [t, ...allAsana(t.subtasks)])
const strip = (t) => {
  delete t._base
  return t
}

// ── Jira (Atlassian) ───────────────────────────────────────────────────────────

async function jira(req, res, url, ctx) {
  const path = url.pathname.slice('/atlassian'.length)
  if (path === '/auth/oauth/token' && req.method === 'POST') {
    const f = await readForm(req)
    if (f.client_id !== 'stub-jira' || f.client_secret !== 'stub-jira-secret') return send(res, 401, { error: 'access_denied' })
    if (f.grant_type === 'refresh_token') {
      const token = refreshes.get('jira')?.get(f.refresh_token)
      if (!token) return send(res, 403, { error: 'unauthorized_client' })
      // Atlassian rotates the refresh token.
      const rotated = `${f.refresh_token}-r`
      refreshes.get('jira').set(rotated, token)
      return send(res, 200, { access_token: token, refresh_token: rotated, expires_in: 3600, token_type: 'Bearer' })
    }
    const token = f.grant_type === 'authorization_code' ? exchange('jira', ctx.codes, f.code) : null
    if (!token) return send(res, 403, { error: 'invalid_grant' })
    const g = grantsOf('jira').get(token)
    return send(res, 200, { access_token: token, refresh_token: g.refreshToken ?? undefined, expires_in: 3600, scope: 'read:jira-work read:jira-user offline_access', token_type: 'Bearer' })
  }
  const g = authorize('jira', req, res, url, bearer(req))
  if (!g) return
  const sites = g.data.sites ?? []
  if (path === '/api/me') return send(res, 200, { account_id: g.data.me?.account_id ?? 'jira-me', email: g.email, name: g.name })
  if (path === '/api/oauth/token/accessible-resources') return send(res, 200, sites.map((s) => ({ id: s.id, name: s.name, url: s.url, scopes: ['read:jira-work', 'read:jira-user'] })))
  const m = /^\/api\/ex\/jira\/([^/]+)\/rest\/api\/3(\/.*)$/.exec(path)
  const site = m ? sites.find((s) => s.id === decodeURIComponent(m[1])) : null
  if (!site) return send(res, 404, { errorMessages: ['Site not found'] })
  const rest = m[2]
  const q = url.searchParams
  if (rest === '/project/search') {
    const startAt = Number(q.get('startAt') ?? 0)
    const all = site.projects ?? []
    const values = all.slice(startAt, startAt + PAGE).map((p) => ({ id: p.id, key: p.key, name: p.name }))
    return send(res, 200, { startAt, maxResults: PAGE, total: all.length, isLast: startAt + PAGE >= all.length, values })
  }
  if (rest === '/field') return send(res, 200, site.fields ?? [])
  if (rest === '/user/assignable/multiProjectSearch') {
    const keys = (q.get('projectKeys') ?? '').split(',')
    return send(res, 200, (site.users ?? []).filter((u) => !u.projects || u.projects.some((k) => keys.includes(k))).map(({ projects, ...u }) => u))
  }
  let r = /^\/project\/([^/]+)\/statuses$/.exec(rest)
  if (r) {
    const p = (site.projects ?? []).find((x) => x.id === r[1] || x.key === r[1])
    return p ? send(res, 200, p.types ?? []) : send(res, 404, { errorMessages: ['No project'] })
  }
  if (rest === '/search/jql') {
    const key = /project = "([^"]+)"/.exec(q.get('jql') ?? '')?.[1]
    const p = (site.projects ?? []).find((x) => x.key === key)
    if (!p) return send(res, 400, { errorMessages: [`The value '${key}' does not exist for the field 'project'.`] })
    const at = Number(q.get('nextPageToken') ?? 0)
    const issues = (p.issues ?? []).slice(at, at + PAGE).map((i) => ({
      id: i.id,
      key: i.key,
      fields: {
        ...i.fields,
        attachment: (i.files ?? []).map((f) => ({ id: f.id, filename: f.filename, size: String(f.content ?? '').length, mimeType: 'text/plain', content: `${site.url}/rest/api/3/attachment/content/${f.id}` })),
        // An issue holds its first comment only; the rest are its comment route's.
        comment: { comments: (i.comments ?? []).slice(0, 1), maxResults: 1, total: (i.comments ?? []).length, startAt: 0 },
      },
    }))
    const more = at + PAGE < (p.issues ?? []).length
    return send(res, 200, { issues, ...(more ? { nextPageToken: String(at + PAGE) } : {}), isLast: !more })
  }
  r = /^\/issue\/([^/]+)\/comment$/.exec(rest)
  if (r) {
    const i = (site.projects ?? []).flatMap((p) => p.issues ?? []).find((x) => x.key === r[1])
    if (!i) return send(res, 404, { errorMessages: ['Issue does not exist'] })
    const startAt = Number(q.get('startAt') ?? 0)
    return send(res, 200, { startAt, maxResults: PAGE, total: (i.comments ?? []).length, comments: (i.comments ?? []).slice(startAt, startAt + PAGE) })
  }
  r = /^\/attachment\/content\/([^/]+)$/.exec(rest)
  if (r) {
    // As Atlassian does: a redirect to its media store, where the bytes are.
    return send(res, 303, '', { location: `${ctx.base}/atlassian/media/${site.id}/${r[1]}` })
  }
  return send(res, 404, { errorMessages: ['Not found'] })
}

function jiraMedia(req, res, url) {
  const m = /^\/atlassian\/media\/([^/]+)\/([^/]+)$/.exec(url.pathname)
  for (const g of grantsOf('jira').values()) {
    for (const s of g.data.sites ?? []) {
      if (m && s.id !== m[1]) continue
      for (const i of (s.projects ?? []).flatMap((p) => p.issues ?? [])) for (const f of i.files ?? []) if (m && f.id === m[2]) return send(res, 200, String(f.content ?? ''))
    }
  }
  return send(res, 404, { error: 'no such file' })
}

// ── Trello ─────────────────────────────────────────────────────────────────────

const trelloToken = (req) => /oauth_token="([^"]*)"/.exec(req.headers.authorization ?? '')?.[1] ?? ''

async function trello(req, res, url, ctx) {
  const path = url.pathname.slice('/trello/1'.length)
  if (path === '/authorize' && req.method === 'GET') {
    // The person approves, and Trello goes back to the page with the token in the fragment.
    const token = url.searchParams.get('stub_token') ?? ''
    const back = url.searchParams.get('return_url') ?? ''
    if (url.searchParams.get('key') !== 'stub-trello' || !back) return send(res, 400, 'invalid key')
    return send(res, 302, '', { location: `${back}#token=${encodeURIComponent(token)}` })
  }
  const keyOk = /oauth_consumer_key="stub-trello"/.test(req.headers.authorization ?? '')
  if (!keyOk) return send(res, 401, 'invalid key')
  const g = authorize('trello', req, res, url, trelloToken(req))
  if (!g) return
  const d = g.data
  const q = url.searchParams
  if (path === '/members/me') return send(res, 200, { id: d.me?.id ?? 'trello-me', fullName: g.name, username: d.me?.username ?? 'me', email: g.email })
  if (path === '/members/me/organizations') return send(res, 200, d.orgs ?? [])
  if (path === '/members/me/boards') return send(res, 200, (d.boards ?? []).map((b) => ({ id: b.id, name: b.name, idOrganization: b.idOrganization ?? null })))
  let m = /^\/organizations\/([^/]+)\/boards$/.exec(path)
  if (m) return send(res, 200, (d.boards ?? []).filter((b) => b.idOrganization === m[1]).map((b) => ({ id: b.id, name: b.name })))
  m = /^\/boards\/([^/]+)\/(lists|cards\/open|customFields|members|actions)$/.exec(path)
  if (m) {
    const b = (d.boards ?? []).find((x) => x.id === m[1])
    if (!b) return send(res, 404, 'The requested resource was not found.')
    if (m[2] === 'lists') return send(res, 200, b.lists ?? [])
    if (m[2] === 'customFields') return send(res, 200, b.customFields ?? [])
    if (m[2] === 'members') return send(res, 200, b.members ?? [])
    if (m[2] === 'cards/open') {
      return send(res, 200, (b.cards ?? []).map((c) => ({
        ...c,
        checklists: q.get('checklists') === 'all' ? c.checklists ?? [] : undefined,
        attachments: q.get('attachments') === 'true' ? (c.attachments ?? []).map((a) => ({ ...a, url: a.isUpload ? `${ctx.base}/trello/1/cards/${c.id}/attachments/${a.id}/download/${encodeURIComponent(a.name)}` : a.url })) : undefined,
        customFieldItems: q.get('customFieldItems') === 'true' ? c.customFieldItems ?? [] : undefined,
      })))
    }
    // Actions newest first, a page of `limit`, then those `before` the last one.
    const all = [...(b.comments ?? [])].sort((x, y) => Date.parse(y.date) - Date.parse(x.date))
    const before = q.get('before')
    const from = before ? all.findIndex((a) => a.id === before) + 1 : 0
    const limit = Math.min(Number(q.get('limit') ?? 50), PAGE)
    return send(res, 200, all.slice(from, from + limit).map((a) => ({ id: a.id, type: 'commentCard', date: a.date, idMemberCreator: a.member?.id, memberCreator: a.member, data: { text: a.text, card: { id: a.card } } })))
  }
  m = /^\/cards\/([^/]+)\/attachments\/([^/]+)\/download\//.exec(path)
  if (m) {
    for (const b of d.boards ?? []) if (b.files?.[m[2]] !== undefined) return send(res, 200, String(b.files[m[2]]))
    return send(res, 404, 'no such file')
  }
  return send(res, 404, 'The requested resource was not found.')
}

// ── Todoist ────────────────────────────────────────────────────────────────────

/** Todoist's page: `results` and `next_cursor` while there is more. */
function todoistPage(res, url, rows, key = 'results') {
  const at = Number(url.searchParams.get('cursor') ?? 0)
  const more = at + PAGE < rows.length
  return send(res, 200, { [key]: rows.slice(at, at + PAGE), next_cursor: more ? String(at + PAGE) : null })
}

async function todoist(req, res, url, ctx) {
  const path = url.pathname.slice('/todoist'.length)
  if (path === '/oauth/access_token' && req.method === 'POST') {
    const f = await readForm(req)
    if (f.client_id !== 'stub-todoist' || f.client_secret !== 'stub-todoist-secret') return send(res, 400, { error: 'invalid_client' })
    const token = exchange('todoist', ctx.codes, f.code)
    return token ? send(res, 200, { access_token: token, token_type: 'Bearer' }) : send(res, 400, { error: 'bad_authorization_code' })
  }
  const g = authorize('todoist', req, res, url, bearer(req))
  if (!g) return
  const d = g.data
  const q = url.searchParams
  const rest = path.slice('/api/v1'.length)
  const project = (id) => (d.projects ?? []).find((p) => p.id === id)
  if (rest === '/user') return send(res, 200, d.user ?? { id: 'td-me', full_name: g.name, email: g.email })
  if (rest === '/projects') return todoistPage(res, url, (d.projects ?? []).map((p) => ({ id: p.id, name: p.name, parent_id: p.parent_id ?? null, created_at: p.created_at ?? '2026-01-01T00:00:00Z', inbox_project: p.inbox === true })))
  let m = /^\/projects\/([^/]+)\/collaborators$/.exec(rest)
  if (m) return todoistPage(res, url, project(m[1])?.collaborators ?? [])
  if (rest === '/sections') return todoistPage(res, url, project(q.get('project_id'))?.sections ?? [])
  if (rest === '/tasks') return todoistPage(res, url, (project(q.get('project_id'))?.tasks ?? []).map((t) => ({ ...t, project_id: q.get('project_id') })))
  if (rest === '/tasks/completed/by_completion_date') {
    const since = Date.parse(q.get('since') ?? '')
    const until = Date.parse(q.get('until') ?? '')
    if (!(until > since) || until - since > 92 * 24 * 3600 * 1000) return send(res, 400, { error: 'The interval between since and until is at most three months' })
    const rows = (project(q.get('project_id'))?.completed ?? []).filter((t) => {
      const at = Date.parse(t.completed_at)
      return at >= since && at < until
    })
    return todoistPage(res, url, rows, 'items')
  }
  if (rest === '/comments') {
    for (const p of d.projects ?? []) if (p.comments?.[q.get('task_id')]) return todoistPage(res, url, p.comments[q.get('task_id')])
    return todoistPage(res, url, [])
  }
  return send(res, 404, { error: 'Not found' })
}

// ── Wrike ──────────────────────────────────────────────────────────────────────

async function wrike(req, res, url, ctx) {
  const path = url.pathname.slice('/wrike'.length)
  if (path === '/oauth2/token' && req.method === 'POST') {
    const f = await readForm(req)
    if (f.client_id !== 'stub-wrike' || f.client_secret !== 'stub-wrike-secret') return send(res, 401, { error: 'invalid_client' })
    if (f.grant_type === 'refresh_token') {
      const token = refreshes.get('wrike')?.get(f.refresh_token)
      return token ? send(res, 200, { access_token: token, refresh_token: f.refresh_token, expires_in: 3600, host: grantsOf('wrike').get(token)?.data.host ?? 'www.wrike.com', token_type: 'bearer' }) : send(res, 400, { error: 'invalid_grant' })
    }
    const token = f.grant_type === 'authorization_code' ? exchange('wrike', ctx.codes, f.code) : null
    if (!token) return send(res, 400, { error: 'invalid_grant' })
    const g = grantsOf('wrike').get(token)
    return send(res, 200, { access_token: token, refresh_token: g.refreshToken ?? undefined, token_type: 'bearer', expires_in: 3600, host: g.data.host ?? 'www.wrike.com' })
  }
  const g = authorize('wrike', req, res, url, bearer(req))
  if (!g) return
  const d = g.data
  const rest = path.slice('/api/v4'.length)
  const q = url.searchParams
  const data = (rows) => send(res, 200, { kind: 'list', data: rows })
  if (rest === '/contacts') return data(q.get('me') === 'true' ? (d.contacts ?? []).slice(0, 1) : d.contacts ?? [])
  if (rest === '/account') return data([{ id: 'wrike-acct', name: d.account?.name ?? 'Wrike' }])
  if (rest === '/spaces') return data((d.spaces ?? []).map((s) => ({ id: s.id, title: s.title })))
  if (rest === '/workflows') return data(d.workflows ?? [])
  if (rest === '/customfields') return data(d.customfields ?? [])
  let m = /^\/spaces\/([^/]+)\/folders$/.exec(rest)
  if (m) return data((d.spaces ?? []).find((s) => s.id === m[1])?.folders ?? [])
  m = /^\/folders\/([^/]+)\/tasks$/.exec(rest)
  if (m) {
    const space = (d.spaces ?? []).find((s) => (s.folders ?? []).some((f) => f.id === m[1]))
    if (!space) return send(res, 404, { errorDescription: 'Folder not found' })
    const own = space.tasks?.[m[1]] ?? []
    const deep = q.get('descendants') === 'true'
    const under = (id) => (space.folders.find((f) => f.id === id)?.childIds ?? []).flatMap((c) => [...(space.tasks?.[c] ?? []), ...under(c)])
    const rows = deep ? [...own, ...under(m[1])] : own
    const at = Number(q.get('nextPageToken') ?? 0)
    const more = at + PAGE < rows.length
    return send(res, 200, { kind: 'tasks', data: rows.slice(at, at + PAGE), ...(more ? { nextPageToken: String(at + PAGE) } : {}) })
  }
  m = /^\/tasks\/([^/]+)\/(comments|attachments)$/.exec(rest)
  if (m) return data(m[2] === 'comments' ? d.comments?.[m[1]] ?? [] : (d.files?.[m[1]] ?? []).map((f) => ({ id: f.id, name: f.name, size: String(f.content ?? '').length, contentType: 'text/plain' })))
  m = /^\/attachments\/([^/]+)\/download$/.exec(rest)
  if (m) {
    for (const files of Object.values(d.files ?? {})) for (const f of files) if (f.id === m[1]) return send(res, 200, String(f.content ?? ''))
    return send(res, 404, { errorDescription: 'Attachment not found' })
  }
  return send(res, 404, { errorDescription: 'Not found' })
}

// ── Monday (GraphQL) ───────────────────────────────────────────────────────────

/** The questions the importer asks, told apart by what they name: no GraphQL parser, the queries are the product's own. */
async function monday(req, res, url) {
  if (url.pathname !== '/monday/v2' || req.method !== 'POST') return send(res, 404, { errors: [{ message: 'Not found' }] })
  const token = String(req.headers.authorization ?? '')
  const body = await readForm(req)
  const g = authorize('monday', req, res, url, token)
  if (!g) return
  g.asked[g.asked.length - 1] += ` ${String(body.query ?? '').replace(/\s+/g, ' ').slice(0, 80)}`
  const d = g.data
  const query = String(body.query ?? '')
  const v = body.variables ?? {}
  const items = (b) => (b.items ?? []).map((i) => ({ ...i, group: { id: i.group }, updates: i.updates ?? [], subitems: i.subitems ?? [] }))
  if (/^\{\s*me\s*\{/.test(query)) return send(res, 200, { data: { me: { id: d.me?.id ?? 'm-me', name: g.name, email: g.email, account: { name: d.me?.account?.name ?? 'Monday' } } } })
  if (/users\(limit/.test(query)) return send(res, 200, { data: { users: d.users ?? [] } })
  if (/boards\(limit/.test(query)) {
    const page = Number(v.page ?? 1)
    // Pages of 100, as the importer asks: the stub's few boards are one page.
    return send(res, 200, { data: { boards: page === 1 ? (d.boards ?? []).map((b) => ({ id: b.id, name: b.name, type: b.type ?? 'board', workspace: b.workspace ? { name: b.workspace } : null })) : [] } })
  }
  if (/boards\(ids/.test(query)) {
    const b = (d.boards ?? []).find((x) => (v.ids ?? []).map(String).includes(String(x.id)))
    if (!b) return send(res, 200, { data: { boards: [] } })
    const all = items(b)
    return send(res, 200, { data: { boards: [{ name: b.name, columns: b.columns ?? [], groups: b.groups ?? [], items_page: { cursor: all.length > PAGE ? `${b.id}:${PAGE}` : null, items: all.slice(0, PAGE) } }] } })
  }
  if (/next_items_page/.test(query)) {
    const [boardId, at] = String(v.cursor ?? '').split(':')
    const b = (d.boards ?? []).find((x) => String(x.id) === boardId)
    if (!b) return send(res, 200, { errors: [{ message: 'CursorException: invalid cursor' }] })
    const all = items(b)
    const from = Number(at)
    return send(res, 200, { data: { next_items_page: { cursor: from + PAGE < all.length ? `${b.id}:${from + PAGE}` : null, items: all.slice(from, from + PAGE) } } })
  }
  return send(res, 200, { errors: [{ message: `the stub does not know this query: ${query.slice(0, 60)}` }] })
}

// ── ClickUp ────────────────────────────────────────────────────────────────────

/** ClickUp's own: 25 comments a page, newest first. */
const CLICKUP_COMMENTS = 25
/** The stub's Chat pages, smaller than ClickUp's 100 so the suite's few messages span several. */
const CLICKUP_CHAT_PAGE = 3

const cuStatusOf = (space, folder, list) => (list.override_statuses && list.statuses?.length ? list.statuses : folder?.override_statuses && folder.statuses?.length ? folder.statuses : space.statuses ?? [])

/** Every List of the account with its Space and Folder, to answer a List's or a task's own address. */
function clickupLists(data) {
  const out = []
  for (const team of data.teams ?? [])
    for (const space of team.spaces ?? []) {
      for (const folder of space.folders ?? []) for (const list of folder.lists ?? []) out.push({ team, space, folder, list })
      for (const list of space.lists ?? []) out.push({ team, space, folder: null, list })
    }
  return out
}

/** A List as ClickUp lists it: its statuses only on its own page (`GET /list/{id}`), as a Folder's listing may leave them out. */
const cuListRow = (l) => ({ id: l.id, name: l.name, content: l.content ?? '', override_statuses: l.override_statuses === true, task_count: (l.tasks ?? []).length })

/** A task as a page of tasks gives it: no comments, and no attachments (its own page has those); a Files field's files by their address. */
function cuTaskRow(t, list, base) {
  const { comments: _c, attachments: _a, ...row } = t
  if (row.custom_fields) {
    row.custom_fields = row.custom_fields.map((f) =>
      f.type === 'attachment' ? { ...f, value: (f.value ?? []).map((a) => ({ id: a.id, title: a.title, size: Buffer.byteLength(a.content ?? ''), url: `${base}/clickup/files/${t.id}/${a.id}` })) } : f,
    )
  }
  return { archived: false, list: { id: list.id }, ...row }
}

/** A task's files: those attached to it, and those in its Files fields. */
const cuFilesOf = (t) => [...(t.attachments ?? []), ...(t.custom_fields ?? []).filter((f) => f.type === 'attachment').flatMap((f) => f.value ?? [])]

/** A Chat message's files, drawn in its Markdown as ClickUp draws them: an image as an image, anything else as a link. */
function chatContent(msg, base, teamId) {
  const links = (msg.files ?? []).map((f) => {
    const at = `${base}/clickup/attachments/t${teamId}/${f.id}/${encodeURIComponent(f.name)}`
    return /^image\//.test(f.mimetype ?? '') ? `![${f.name}](${at})` : `[${at}?view=open&filename=${encodeURIComponent(f.name)}](${at}?view=open&filename=${encodeURIComponent(f.name)})`
  })
  return [msg.content ?? '', ...links].filter(Boolean).join('\n')
}

async function clickup(req, res, url, ctx) {
  if (url.pathname.startsWith('/clickup/files/')) {
    // An attachment's address: a signed one on ClickUp's file store, here on the stub's own origin.
    const [, , , taskId, attId] = url.pathname.split('/')
    for (const g of grantsOf('clickup').values())
      for (const { list } of clickupLists(g.data))
        for (const t of list.tasks ?? []) {
          const a = t.id === taskId ? cuFilesOf(t).find((x) => x.id === attId) : null
          if (a) return send(res, 200, Buffer.from(a.content ?? ''), { 'content-type': a.mimetype ?? 'text/plain' })
        }
    return send(res, 404, { err: 'Attachment not found', ECODE: 'ATTCH_001' })
  }
  if (url.pathname.startsWith('/clickup/attachments/')) {
    // A file posted in Chat, on ClickUp's file store: asked for without the token, as a link is opened.
    const [, , , , fileId] = url.pathname.split('/')
    for (const g of grantsOf('clickup').values())
      for (const team of g.data.teams ?? [])
        for (const c of team.chat ?? [])
          for (const msg of (c.messages ?? []).flatMap((x) => [x, ...(x.replies ?? [])])) {
            const f = (msg.files ?? []).find((x) => x.id === fileId)
            if (f) return send(res, 200, Buffer.from(f.content ?? ''), { 'content-type': f.mimetype ?? 'text/plain' })
          }
    return send(res, 404, { err: 'Attachment not found', ECODE: 'ATTCH_001' })
  }
  const v3 = url.pathname.startsWith('/clickup/api/v3/')
  const path = url.pathname.slice((v3 ? '/clickup/api/v3' : '/clickup/api/v2').length)
  // A personal token is sent as it is, with no `Bearer`.
  const g = authorize('clickup', req, res, url, req.headers.authorization ?? '')
  if (!g) return
  const data = g.data
  let m
  const teamOf = (id) => (data.teams ?? []).find((t) => t.id === id)
  if (v3) {
    // Docs live on ClickUp's v3 API: a page of a Workspace's Docs at a time, then a Doc's pages, nested.
    if ((m = /^\/workspaces\/([^/]+)\/docs$/.exec(path))) {
      const team = teamOf(m[1])
      if (!team) return send(res, 401, { err: 'Team not authorized', ECODE: 'OAUTH_027' })
      const all = (team.docs ?? []).filter((d) => !d.deleted && !d.archived)
      const limit = Math.max(1, Number(url.searchParams.get('limit') ?? 50))
      const from = Number(url.searchParams.get('cursor') ?? 0) || 0
      const slice = all.slice(from, from + limit)
      return send(res, 200, { docs: slice.map(({ pages: _p, ...d }) => ({ ...d, workspace_id: team.id })), next_cursor: from + limit < all.length ? String(from + limit) : null })
    }
    if ((m = /^\/workspaces\/([^/]+)\/docs\/([^/]+)\/pages$/.exec(path))) {
      const doc = (teamOf(m[1])?.docs ?? []).find((d) => d.id === m[2])
      if (!doc) return send(res, 404, { err: 'Doc not found', ECODE: 'DOC_004' })
      // Markdown only when asked for it; anything else, the page's words alone.
      const md = url.searchParams.get('content_format') === 'text/md'
      const shape = (p) => ({ id: p.id, doc_id: doc.id, name: p.name, content: md ? p.content ?? '' : String(p.content ?? '').replace(/[#*_`>]/g, ''), pages: (p.pages ?? []).map(shape) })
      return send(res, 200, (doc.pages ?? []).map(shape))
    }
    // Chat, as ClickUp's v3 Chat API answers: a page of rows as `data`, newest first, the next by `next_cursor`.
    // Three a page whatever is asked, so a reader that stops at its first page is seen to.
    const chatPage = (rows) => {
      const from = Number(url.searchParams.get('cursor') ?? 0) || 0
      const size = Math.min(Number(url.searchParams.get('limit') ?? 100) || 100, CLICKUP_CHAT_PAGE)
      return { data: rows.slice(from, from + size), next_cursor: from + size < rows.length ? String(from + size) : null }
    }
    const chatOf = (team) => team?.chat ?? []
    const messageRow = (teamId) => (msg) => ({ id: msg.id, type: 'message', content: chatContent(msg, ctx.base, teamId), user_id: String(msg.user_id), date: Number(msg.date), has_replies: (msg.replies ?? []).length > 0 })
    const newestFirst = (rows) => [...rows].sort((a, b) => Number(b.date) - Number(a.date))
    if ((m = /^\/workspaces\/([^/]+)\/chat\/channels$/.exec(path))) {
      const team = teamOf(m[1])
      if (!team) return send(res, 401, { err: 'Team not authorized', ECODE: 'OAUTH_027' })
      return send(res, 200, chatPage(chatOf(team).map((c) => ({ id: c.id, name: c.name, type: c.type ?? 'CHANNEL', visibility: c.visibility ?? 'PUBLIC', creator: String(data.user?.id ?? ''), created_at: String(Date.now()) }))))
    }
    if ((m = /^\/workspaces\/([^/]+)\/chat\/channels\/([^/]+)\/messages$/.exec(path))) {
      const channel = chatOf(teamOf(m[1])).find((c) => c.id === m[2])
      if (!channel) return send(res, 404, { err: 'Channel not found', ECODE: 'CHAT_404' })
      return send(res, 200, chatPage(newestFirst(channel.messages ?? []).map(messageRow(m[1]))))
    }
    if ((m = /^\/workspaces\/([^/]+)\/chat\/messages\/([^/]+)\/replies$/.exec(path))) {
      const msg = chatOf(teamOf(m[1])).flatMap((c) => c.messages ?? []).find((x) => x.id === m[2])
      if (!msg) return send(res, 404, { err: 'Message not found', ECODE: 'CHAT_404' })
      return send(res, 200, chatPage(newestFirst(msg.replies ?? []).map(messageRow(m[1]))))
    }
    if ((m = /^\/workspaces\/([^/]+)\/chat\/messages\/([^/]+)\/reactions$/.exec(path))) {
      const msg = chatOf(teamOf(m[1])).flatMap((c) => (c.messages ?? []).flatMap((x) => [x, ...(x.replies ?? [])])).find((x) => x.id === m[2])
      if (!msg) return send(res, 404, { err: 'Message not found', ECODE: 'CHAT_404' })
      return send(res, 200, chatPage((msg.reactions ?? []).map((r) => ({ reaction: r.reaction, user_id: String(r.user_id), date: Number(msg.date) }))))
    }
    if ((m = /^\/workspaces\/([^/]+)\/chat\/channels\/([^/]+)\/members$/.exec(path))) {
      const channel = chatOf(teamOf(m[1])).find((c) => c.id === m[2])
      if (!channel?.members) return send(res, 404, { err: 'Members not found', ECODE: 'CHAT_404' })
      return send(res, 200, chatPage(channel.members.map((id) => ({ id: String(id) }))))
    }
    return send(res, 404, { err: 'Route not found', ECODE: 'APP_001' })
  }
  if (path === '/user') return send(res, 200, { user: data.user })
  if (path === '/team') return send(res, 200, { teams: (data.teams ?? []).map((t) => ({ id: t.id, name: t.name, color: '#7b68ee', members: t.members ?? [] })) })
  if ((m = /^\/team\/([^/]+)\/space$/.exec(path))) {
    const team = (data.teams ?? []).find((t) => t.id === m[1])
    if (!team) return send(res, 401, { err: 'Team not authorized', ECODE: 'OAUTH_027' })
    return send(res, 200, { spaces: (team.spaces ?? []).map((s) => ({ id: s.id, name: s.name, private: s.private === true, statuses: s.statuses ?? [] })) })
  }
  const spaceOf = (id) => (data.teams ?? []).flatMap((t) => t.spaces ?? []).find((s) => s.id === id)
  if ((m = /^\/space\/([^/]+)$/.exec(path))) {
    const s = spaceOf(m[1])
    return s ? send(res, 200, { id: s.id, name: s.name, private: s.private === true, statuses: s.statuses ?? [] }) : send(res, 404, { err: 'Space not found' })
  }
  if ((m = /^\/space\/([^/]+)\/folder$/.exec(path))) {
    const s = spaceOf(m[1])
    if (!s) return send(res, 404, { err: 'Space not found' })
    return send(res, 200, {
      folders: (s.folders ?? []).map((f) => ({ id: f.id, name: f.name, hidden: f.hidden === true, override_statuses: f.override_statuses === true, statuses: f.statuses ?? [], lists: (f.lists ?? []).map(cuListRow) })),
    })
  }
  if ((m = /^\/space\/([^/]+)\/list$/.exec(path))) {
    const s = spaceOf(m[1])
    return s ? send(res, 200, { lists: (s.lists ?? []).map(cuListRow) }) : send(res, 404, { err: 'Space not found' })
  }
  if ((m = /^\/team\/([^/]+)\/time_entries$/.exec(path))) {
    // Without `assignee`, the token's own time; with it, theirs — in the range, of tasks in `space_id`.
    const team = teamOf(m[1])
    if (!team) return send(res, 401, { err: 'Team not authorized', ECODE: 'OAUTH_027' })
    const who = url.searchParams.get('assignee')
    const ids = who ? who.split(',') : [String(data.user?.id ?? '')]
    const space = url.searchParams.get('space_id')
    const from = Number(url.searchParams.get('start_date') ?? 0)
    const to = Number(url.searchParams.get('end_date') ?? Date.now())
    const inSpace = (taskId) => !space || clickupLists(data).some((x) => x.space.id === space && (x.list.tasks ?? []).some((t) => t.id === taskId))
    const rows = (team.time_entries ?? []).filter((e) => ids.includes(String(e.user?.id)) && inSpace(e.task?.id) && Number(e.start) >= from && Number(e.start) <= to)
    return send(res, 200, { data: rows })
  }
  if ((m = /^\/team\/([^/]+)\/goal$/.exec(path))) {
    const team = teamOf(m[1])
    if (!team) return send(res, 401, { err: 'Team not authorized', ECODE: 'OAUTH_027' })
    // The listing names each Goal; its Targets are on its own page. A Goal in a Goal Folder is under its Folder.
    const row = ({ key_results: _k, ...g }) => g
    return send(res, 200, {
      goals: (team.goals ?? []).map(row),
      folders: (team.goal_folders ?? []).map((f) => ({ id: f.id, name: f.name, goal_count: (f.goals ?? []).length, goals: (f.goals ?? []).map(row) })),
    })
  }
  if ((m = /^\/goal\/([^/]+)$/.exec(path))) {
    const goal = (data.teams ?? []).flatMap((t) => [...(t.goals ?? []), ...(t.goal_folders ?? []).flatMap((f) => f.goals ?? [])]).find((x) => x.id === m[1])
    return goal ? send(res, 200, { goal }) : send(res, 404, { err: 'Goal not found', ECODE: 'GOAL_002' })
  }
  const found = (id) => clickupLists(data).find((x) => x.list.id === id)
  if ((m = /^\/list\/([^/]+)$/.exec(path))) {
    const x = found(m[1])
    return x ? send(res, 200, { ...cuListRow(x.list), statuses: cuStatusOf(x.space, x.folder, x.list) }) : send(res, 404, { err: 'List not found' })
  }
  if ((m = /^\/list\/([^/]+)\/view$/.exec(path))) {
    const x = found(m[1])
    if (!x) return send(res, 404, { err: 'List not found' })
    return send(res, 200, { views: x.list.views ?? [] })
  }
  if ((m = /^\/list\/([^/]+)\/task$/.exec(path))) {
    const x = found(m[1])
    if (!x) return send(res, 404, { err: 'List not found' })
    // Closed tasks and subtasks only when asked for, as ClickUp leaves them out by default.
    const closed = url.searchParams.get('include_closed') === 'true'
    const subtasks = url.searchParams.get('subtasks') === 'true'
    const rows = (x.list.tasks ?? []).filter((t) => (closed || !['closed', 'done'].includes(t.status?.type)) && (subtasks || !t.parent))
    const page = Number(url.searchParams.get('page') ?? 0)
    const slice = rows.slice(page * PAGE, page * PAGE + PAGE)
    return send(res, 200, { tasks: slice.map((t) => cuTaskRow(t, x.list, ctx.base)), last_page: page * PAGE + PAGE >= rows.length })
  }
  const taskOf = (id) => {
    for (const x of clickupLists(data)) {
      const t = (x.list.tasks ?? []).find((y) => y.id === id)
      if (t) return t
    }
    return null
  }
  if ((m = /^\/task\/([^/]+)\/comment$/.exec(path))) {
    const t = taskOf(m[1])
    if (!t) return send(res, 404, { err: 'Task not found' })
    // Newest first; the next page is asked from the oldest one shown, by its moment and id.
    const all = [...(t.comments ?? [])].sort((a, b) => Number(b.date) - Number(a.date))
    const start = url.searchParams.get('start')
    const startId = url.searchParams.get('start_id')
    const from = start && startId ? all.findIndex((c) => c.id === startId) + 1 : 0
    return send(res, 200, { comments: all.slice(from, from + CLICKUP_COMMENTS) })
  }
  if ((m = /^\/task\/([^/]+)$/.exec(path))) {
    const t = taskOf(m[1])
    if (!t) return send(res, 404, { err: 'Task not found' })
    const { comments: _c, attachments, ...row } = t
    return send(res, 200, {
      ...row,
      attachments: (attachments ?? []).map((a) => ({ id: a.id, title: a.title, size: Buffer.byteLength(a.content ?? ''), url: `${ctx.base}/clickup/files/${t.id}/${a.id}` })),
    })
  }
  return send(res, 404, { err: 'Route not found', ECODE: 'APP_001' })
}

// ── routing ────────────────────────────────────────────────────────────────────

const PREFIXES = { '/asana/': asana, '/atlassian/media/': jiraMedia, '/atlassian/': jira, '/trello/1/': trello, '/todoist/': todoist, '/wrike/': wrike, '/monday/': monday, '/clickup/': clickup }

/**
 * True when the request was this module's to answer. `ctx` is the calendar
 * stub's: its base address and the codes staged by `/__control/code`.
 */
export async function importApps(req, res, url, ctx) {
  if (url.pathname === '/__control/apps' && req.method === 'POST') {
    const b = await readForm(req)
    if (!b?.app || !b?.token || typeof b.data !== 'object') return send(res, 400, { error: 'app, token and data are required' }), true
    grantsOf(b.app).set(b.token, { name: b.name ?? 'Stub Person', email: b.email ?? null, data: b.data, refreshToken: b.refreshToken ?? null, asked: [], fail: b.fail ? { status: Number(b.fail.status), count: Number(b.fail.count ?? 1), path: b.fail.path ?? null } : null })
    if (b.refreshToken) (refreshes.get(b.app) ?? refreshes.set(b.app, new Map()).get(b.app)).set(b.refreshToken, b.token)
    send(res, 200, { seeded: b.token })
    return true
  }
  if (url.pathname === '/__control/apps' && req.method === 'GET') {
    const g = grantsOf(url.searchParams.get('app') ?? '').get(url.searchParams.get('token') ?? '')
    if (g) send(res, 200, { asked: g.asked })
    else send(res, 404, { error: 'no sign-in seeded for that tool and token' })
    return true
  }
  for (const [prefix, handler] of Object.entries(PREFIXES)) {
    if (url.pathname.startsWith(prefix)) {
      await handler(req, res, url, ctx)
      return true
    }
  }
  return false
}
