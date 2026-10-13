/**
 * IMPORTERS BY SIGN-IN, AS CLICKUP HAS THEM (`found-13-oct/importers-by-sign-in-unbuilt`).
 *
 * Rundesk read Asana, Jira, Monday, Notion, Todoist, Trello and Wrike only
 * from what each exports, through the Spreadsheet importer; so comments,
 * files, subtasks and custom fields, which those exports leave out or flatten,
 * did not come in. ClickUp signs in to them and reads them over their APIs
 * (help centre, each tool's "Import from …" article, read through search
 * excerpts, 13 October):
 *
 *   · Asana: projects into public Folders; sections as the statuses of one
 *     List, "Imported from Asana", or as Lists; subtasks one level deep;
 *   · Jira: each issue type its own List if asked; epics as tasks with their
 *     issues as subtasks, or as tasks of their own, linked; statuses, custom
 *     fields, comments and attachments;
 *   · Trello: a board a Folder; its columns statuses of one List, "Imported
 *     from Trello", or Lists; checklists, tags, custom fields, comments, files;
 *   · Todoist: projects into Folders; tags, priority, assignees, due and
 *     creation dates, comments, subtasks; closed tasks when asked; no files;
 *   · Wrike: spaces into Spaces, top folders Folders, nested folders and
 *     projects Lists, the workflow statuses its tasks use;
 *   · Monday: the personal API token pasted; each board a List, its statuses
 *     its groups or its status column;
 *   · Notion: from its workspace export — databases into one Folder, their
 *     properties text fields; pages into Docs;
 *   · and each tool's people mapped to members here.
 *
 * Each tool here is the lane's stub (`import-apps-stub.mjs`, on the calendar
 * stub's port) in that tool's own shapes, paged a few rows at a time. What was
 * made is read back by SQL; the sign-ins, the choosing and the mapping go
 * through the page where the page is the way in.
 *
 *   DATABASE_URL=postgres://…/rundesk_v4 node test/e2e/importers-by-sign-in.mjs --api 3024 --dist /tmp/claude-0/dist-4
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt, madeWorkspace } from './lib/fixture.mjs'
import { waitUntil, readText } from './lib/wait.mjs'
import { calendarBase, seedConsentCode, seedApp, appAsked } from './lib/calendar.mjs'
import { isSealed, openKept } from './lib/sealed.mjs'
import { zip } from './lib/unzip.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

const EXPECTED_CHECKS = 26

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const STUB = calendarBase(API_PORT, argOf('--calendar', undefined))
const ADMIN = { email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal', password: process.env.E2E_PASSWORD ?? 'Admin@123!' }

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

const stamp = Date.now()
const TAG = `isi${stamp}`
const PASSWORD = 'Importers@12345!'
const ANA_NAME = `Ana Importer ${stamp}`
const ID = (n) => String(n).padStart(32, '0')
const ADF = (text) => ({ type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
const apiAs = apiAsAt(API, { emptyBodyOn: ['POST', 'DELETE'] })
const said = (res) => `${res.status} ${JSON.stringify(res.message || null)}`

let sql = null
let browser = null
let WS = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what each importer made is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  const A = apiAs(auth.accessToken)
  const [me] = await sql`select id from users where lower(email) = lower(${ADMIN.email})`
  const made = await A('/workspaces', { method: 'POST', body: { name: `Sign-in importers ${TAG}` } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  madeWorkspace(WS)

  const person = async (who, role, displayName) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: displayName, email, password: PASSWORD, organizationName: `ISI ${who} ${stamp}`, organizationSlug: `isi-${who}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (!added.ok) throw new Error(`could not add ${who}: ${said(added)}`)
    const [row] = await sql`select id from users where email = ${email}`
    await sql`update users set display_name = ${displayName} where id = ${row.id}`
    return { id: row.id, email, api: apiAs(signed.accessToken) }
  }
  const ana = await person('ana', 'member', ANA_NAME)
  const mia = await person('mia', 'member', `Mia ${stamp}`)
  const bob = await person('bob', 'workspace_admin', `Bob ${stamp}`)
  const gus = await person('gus', 'guest', `Gus ${stamp}`)

  const SPACE_ID = (await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `Existing ${TAG}` } })).data?.id

  /** An import job, followed to its end on the one job route. */
  const job = async (jobId) => {
    let row = null
    await waitUntil(async () => {
      const res = await A(`/workspaces/${WS}/import/spreadsheet/jobs/${jobId}`)
      row = res.data
      return row?.status === 'completed' || row?.status === 'failed'
    }, { timeoutMs: 90_000, stepMs: 400 })
    return row
  }
  /** A run through the API: its job, followed. */
  const run = async (app, body) => {
    const started = await A(`/workspaces/${WS}/import/apps/${app}`, { method: 'POST', body })
    return { started, job: started.data?.jobId ? await job(started.data.jobId) : null }
  }
  /** The way out to a tool's sign-in and back, as the browser goes: its state, the code staged, the callback's answer. */
  const signInVia = async (app, token, as = A) => {
    const start = await as(`/workspaces/${WS}/import/apps/${app}/connect`, { method: 'POST' })
    const authUrl = start.data?.authUrl ?? ''
    const state = authUrl ? new URL(authUrl).searchParams.get('state') : null
    await seedConsentCode(STUB, { code: `${token}-code`, accessToken: token, provider: app }).catch((e) => console.log(`  (the stub did not take the code: ${e.message})`))
    const back = state ? await fetch(`${API}/import/apps/${app}/callback?code=${encodeURIComponent(`${token}-code`)}&state=${encodeURIComponent(state)}`, { redirect: 'manual' }) : null
    return { start, authUrl, state, back, landed: back?.headers.get('location') ?? '' }
  }
  const grantOf = async (app, userId = me.id) => (await sql`select access_token, refresh_token, account from import_grants where workspace_id = ${WS} and user_id = ${userId} and provider = ${app}`)[0] ?? null
  const seed = (args) => seedApp(STUB, args).catch((e) => console.log(`  (the stub did not take the ${args.app} account: ${e.message})`))

  // What was made, read back.
  const folderNamed = async (spaceId, name) => (await sql`select id, name, is_default_container from projects where space_id = ${spaceId} and name = ${name}`)[0] ?? null
  const spaceNamed = async (name) => (await sql`select id, name from spaces where workspace_id = ${WS} and name = ${name} order by created_at desc limit 1`)[0] ?? null
  const listsOf = async (projectId) => sql`select id, name from lists where project_id = ${projectId} order by position, created_at`
  const statusesOf = async (listId) => sql`select key, name, category from list_statuses where list_id = ${listId} order by position`
  const tasksOf = async (listId) =>
    sql`select t.id, t.title, t.status, t.status_category, t.parent_task_id, t.priority, t.due_date, t.due_date_has_time, t.start_date, t.created_at, t.description from tasks t where t.list_id = ${listId} order by t.parent_task_id nulls first, t.position, t.created_at`
  const taskNamed = async (title) => (await sql`select t.id, t.title, t.status, t.status_category, t.parent_task_id, t.priority, t.due_date, t.due_date_has_time, t.created_at, t.description, t.list_id from tasks t join lists l on l.id = t.list_id join projects p on p.id = l.project_id join spaces s on s.id = p.space_id where s.workspace_id = ${WS} and t.title = ${title} order by t.created_at desc limit 1`)[0] ?? null
  const assigneesOf = async (taskId) => (await sql`select user_id from task_assignees where task_id = ${taskId}`).map((r) => r.user_id)
  const tagsOf = async (taskId) => (await sql`select l.name from task_label_assignments a join labels l on l.id = a.label_id where a.task_id = ${taskId} order by l.name`).map((r) => r.name)
  const commentsOf = async (taskId) => sql`select author_id, body from task_comments where task_id = ${taskId} order by created_at`
  const filesOf = async (taskId) => sql`select file_name, size_bytes from task_attachments where task_id = ${taskId} order by file_name`
  const fieldsOf = async (taskId) =>
    Object.fromEntries((await sql`select d.name, d.type, v.value from custom_field_values v join custom_field_definitions d on d.id = v.field_id where v.task_id = ${taskId}`).map((r) => [r.name, { type: r.type, v: r.value?.v }]))

  // ── the page ───────────────────────────────────────────────────────────────
  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  page.setDefaultTimeout(15_000)
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })

  // ══ 1. THE TOOLS, ON THE IMPORT PAGE ═════════════════════════════════════
  console.log('\n▶ The import page offers each tool')
  await page.goto(`${B}/app/${WS}/import`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('import-tab-apps').click({ timeout: 20_000 }).catch(() => {})
  const tiles = {}
  for (const key of ['asana', 'jira', 'monday', 'notion', 'todoist', 'trello', 'wrike']) {
    tiles[key] = await page.getByTestId(`import-app-${key}`).filter({ visible: true }).count().catch(() => 0)
  }
  const catalogue = await A(`/workspaces/${WS}/import/apps`)
  const miaSees = await mia.api(`/workspaces/${WS}/import/apps/asana`)
  chk(
    Object.values(tiles).every((n) => n === 1) && catalogue.status === 200 && catalogue.data?.length === 6 && catalogue.data.every((a) => a.configured && !a.connected) && miaSees.status === 403,
    'the import page has a tab of the seven tools — Asana, Jira, Monday, Notion, Todoist, Trello, Wrike — each set up on this server and signed in to by nobody yet; a member without the Import data permission is offered none of them',
    JSON.stringify({ tiles, catalogue: catalogue.status, apps: catalogue.data?.map((a) => `${a.key}:${a.configured}/${a.connected}`), mia: miaSees.status }),
  )

  // ══ 2. ASANA ═════════════════════════════════════════════════════════════
  console.log('\n▶ Asana: signed in to, its projects into Folders, its sections statuses or Lists')
  const AS = `as-${TAG}`
  const sam = { gid: 'au-sam', name: 'Sam Stranger', email: `sam-${TAG}@elsewhere.test` }
  const anaAs = { gid: 'au-ana', name: ANA_NAME, email: ana.email }
  await seed({
    app: 'asana',
    token: AS,
    name: 'Admin Asana',
    email: ADMIN.email,
    data: {
      workspaces: [
        {
          gid: 'aw1',
          name: `Acme ${TAG}`,
          users: [anaAs, sam],
          projects: [
            {
              gid: 'ap1',
              name: `Launch ${TAG}`,
              team: 'Marketing',
              sections: [{ gid: 'as1', name: 'Backlog' }, { gid: 'as2', name: 'Doing' }, { gid: 'as3', name: 'Review' }],
              tasks: [
                {
                  gid: 'at1', name: `Write the brief ${TAG}`, notes: 'Brief notes', html_notes: '<body>Brief <strong>notes</strong></body>', section: 'as1', assignee: anaAs, tags: ['Launch', 'Copy'],
                  due_on: '2026-11-02', start_on: '2026-10-28', created_at: '2026-09-20T09:00:00.000Z',
                  subtasks: [{ gid: 'at1a', name: `Outline ${TAG}`, subtasks: [{ gid: 'at1a1', name: `Too deep ${TAG}` }] }, { gid: 'at1b', name: `Draft ${TAG}`, completed: true, completed_at: '2026-10-10T10:00:00.000Z' }],
                  comments: [
                    { text: 'Looks good', created_at: '2026-10-01T09:00:00.000Z', created_by: anaAs },
                    { text: 'From outside', created_at: '2026-10-02T09:00:00.000Z', created_by: sam },
                  ],
                  files: [{ gid: 'af1', name: 'brief.txt', content: 'the brief, in a file' }, { gid: 'af2', name: 'Drive doc', content: '', external: true }],
                },
                { gid: 'at2', name: `Pick the venue ${TAG}`, section: 'as2', assignee: sam },
                { gid: 'at3', name: `Book the band ${TAG}`, section: 'as3', completed: true, completed_at: '2026-10-05T12:00:00.000Z' },
              ],
            },
            { gid: 'ap2', name: `Ops ${TAG}`, sections: [{ gid: 'bs1', name: 'Now' }, { gid: 'bs2', name: 'Later' }], tasks: [{ gid: 'bt1', name: `Rotate keys ${TAG}`, section: 'bs1' }, { gid: 'bt2', name: `Plan offsite ${TAG}`, section: 'bs2' }, { gid: 'bt3', name: `Unsorted ${TAG}` }] },
            { gid: 'ap3', name: `Spare ${TAG}`, sections: [], tasks: [] },
          ],
        },
        { gid: 'aw2', name: `Other ${TAG}`, users: [], projects: [] },
      ],
    },
  })
  const asSign = await signInVia('asana', AS)
  const asGrant = await grantOf('asana')
  chk(
    asSign.authUrl.startsWith(`${STUB}/asana/-/oauth_authorize?`) && new URL(asSign.authUrl || 'http://x').searchParams.get('client_id') === 'stub-asana' &&
      asSign.back?.status === 302 && asSign.landed.includes(`/app/${WS}/import?tab=apps&app=asana&connected=asana`) &&
      isSealed(asGrant?.access_token) && openKept(asGrant?.access_token, 'import_grants.access_token') === AS && asGrant?.account?.name === 'Admin Asana',
    'Asana is signed in to in its own window and comes back to the import page; the grant is kept for the person who signed in, sealed, and says whose it is',
    JSON.stringify({ authUrl: asSign.authUrl.slice(0, 80), back: asSign.back?.status, landed: asSign.landed, kept: String(asGrant?.access_token ?? '').slice(0, 12), name: asGrant?.account?.name }),
  )

  // A way back whose state this server did not sign, or signed for another tool, keeps nothing.
  const jiraState = new URL((await A(`/workspaces/${WS}/import/apps/jira/connect`, { method: 'POST' })).data?.authUrl ?? 'http://x').searchParams.get('state') ?? ''
  await seedConsentCode(STUB, { code: `${AS}-again`, accessToken: AS, provider: 'asana' }).catch(() => {})
  const crossed = await fetch(`${API}/import/apps/asana/callback?code=${encodeURIComponent(`${AS}-again`)}&state=${encodeURIComponent(jiraState)}`, { redirect: 'manual' })
  const forged = await fetch(`${API}/import/apps/asana/callback?code=${encodeURIComponent(`${AS}-again`)}&state=${encodeURIComponent(`${Buffer.from(JSON.stringify({ ws: WS, user: mia.id, app: 'asana', ts: Date.now() })).toString('base64url')}.forged`)}`, { redirect: 'manual' })
  const miaGrant = await grantOf('asana', mia.id)
  const bobProjects = await bob.api(`/workspaces/${WS}/import/apps/asana/projects?source=aw1`)
  chk(
    crossed.status === 302 && /importError=asana_sign_in_expired/.test(crossed.headers.get('location') ?? '') && forged.status === 302 && /importError=asana_sign_in_expired/.test(forged.headers.get('location') ?? '') &&
      !miaGrant && bobProjects.status === 400 && /Sign in to Asana first/.test(JSON.stringify(bobProjects.message ?? bobProjects.data ?? '')),
    'a way back carrying a state signed for another tool, or not by this server, is refused and keeps nothing; and a grant is its importer’s own — another admin here reads nothing through it',
    JSON.stringify({ crossed: [crossed.status, crossed.headers.get('location')], forged: [forged.status, forged.headers.get('location')], miaGrant: !!miaGrant, bob: said(bobProjects) }),
  )

  // Through the page: the workspace, the project, the people, the run.
  await page.goto(`${B}/app/${WS}/import?tab=apps&app=asana&connected=asana`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('import-app-connected').waitFor({ timeout: 20_000 }).catch(() => {})
  const signedAs = (await readText(page.getByTestId('import-app-connected').filter({ visible: true }))) ?? ''
  const sourceOptions = await page.getByTestId('import-app-source').filter({ visible: true }).locator('option').allTextContents().catch(() => [])
  await page.getByTestId('import-app-project-ap1').check({ timeout: 20_000 }).catch(() => {})
  await page.getByTestId('import-app-person-select-asana:au-sam').waitFor({ timeout: 20_000 }).catch(() => {})
  const anaMatch = await page.getByTestId('import-app-person-select-asana:au-ana').inputValue().catch(() => null)
  const samMatch = await page.getByTestId('import-app-person-select-asana:au-sam').inputValue().catch(() => null)
  const statusesDefault = await page.getByTestId('import-app-option-sections-statuses').isChecked().catch(() => false)
  await page.getByTestId('import-app-into-new').check().catch(() => {})
  await page.getByTestId('import-app-start').click().catch(() => {})
  await page.getByTestId('import-app-report').waitFor({ timeout: 90_000 }).catch(() => {})
  const fig = async (k) => Number(await page.getByTestId(`import-app-r-${k}`).getAttribute('data-value').catch(() => -1))
  const figures = { spaces: await fig('spaces'), folders: await fig('folders'), lists: await fig('lists'), tasks: await fig('tasks'), subtasks: await fig('subtasks'), done: await fig('done'), comments: await fig('comments'), files: await fig('files'), assignees: await fig('assignees'), tags: await fig('tags') }
  const notImported = (await readText(page.getByTestId('import-app-r-not-imported').filter({ visible: true }))) ?? ''
  chk(
    signedAs.includes('Signed in to Asana as Admin Asana') && sourceOptions.some((o) => o.includes(`Acme ${TAG}`)) && sourceOptions.some((o) => o.includes(`Other ${TAG}`)) &&
      anaMatch === ana.id && samMatch === '' && statusesDefault &&
      figures.spaces === 1 && figures.folders === 1 && figures.lists === 1 && figures.tasks === 5 && figures.subtasks === 2 && figures.done === 2 &&
      figures.comments === 2 && figures.files === 1 && figures.assignees === 1 && figures.tags === 2 && /Custom fields/.test(notImported),
    'the Asana tab says whose sign-in it is, offers its workspaces and their projects, matches its people to members by email (one who is nobody here maps to nobody), starts on sections as statuses, and reports what the run made and what Asana keeps',
    JSON.stringify({ signedAs, sourceOptions, anaMatch, samMatch, statusesDefault, figures, notImported: notImported.slice(0, 80) }),
  )

  const asSpace = await spaceNamed(`Acme ${TAG}`)
  const asFolder = asSpace ? await folderNamed(asSpace.id, `Launch ${TAG}`) : null
  const asLists = asFolder ? await listsOf(asFolder.id) : []
  const asStatuses = asLists[0] ? await statusesOf(asLists[0].id) : []
  const brief = await taskNamed(`Write the brief ${TAG}`)
  const venue = await taskNamed(`Pick the venue ${TAG}`)
  const band = await taskNamed(`Book the band ${TAG}`)
  chk(
    asFolder?.is_default_container === false && asLists.length === 1 && asLists[0].name === 'Imported from Asana' &&
      asStatuses.map((s) => `${s.name}:${s.category}`).join(',') === 'Backlog:open,Doing:open,Review:open,Done:closed' &&
      brief?.status === 'backlog' && venue?.status === 'doing' && band?.status_category === 'closed',
    'an Asana project comes in as a Folder named for it holding one List, “Imported from Asana”, whose statuses are its sections in their order with a closed one after them; each task in its section’s status, a completed one closed',
    JSON.stringify({ space: !!asSpace, folder: asFolder, lists: asLists.map((l) => l.name), statuses: asStatuses.map((s) => `${s.name}:${s.category}`), brief: brief?.status, venue: venue?.status, band: band?.status_category }),
  )

  const outline = await taskNamed(`Outline ${TAG}`)
  const draft = await taskNamed(`Draft ${TAG}`)
  const tooDeep = await taskNamed(`Too deep ${TAG}`)
  const asAsked = (await appAsked(STUB, 'asana', AS)) ?? []
  chk(
    outline?.parent_task_id === brief?.id && draft?.parent_task_id === brief?.id && draft?.status_category === 'closed' && !tooDeep &&
      !asAsked.some((a) => a.includes('/tasks/at1a/subtasks')) &&
      asAsked.some((a) => /\/projects\/ap1\/tasks\?.*offset=2/.test(a)) && asAsked.some((a) => /\/projects\/ap1\/sections\?.*offset=2/.test(a)),
    'its subtasks come in as subtasks, one level deep as ClickUp’s Asana import brings them — a subtask’s own subtasks are not asked for — and every page Asana names is read',
    JSON.stringify({ outline: outline?.parent_task_id === brief?.id, draft: [draft?.parent_task_id === brief?.id, draft?.status_category], tooDeep: !!tooDeep, deepAsked: asAsked.filter((a) => a.includes('at1a/subtasks')).length, pages: asAsked.filter((a) => a.includes('offset=')).length }),
  )

  const briefComments = brief ? await commentsOf(brief.id) : []
  const briefFiles = brief ? await filesOf(brief.id) : []
  chk(
    brief && (await assigneesOf(brief.id)).join() === ana.id && venue && (await assigneesOf(venue.id)).length === 0 &&
      JSON.stringify(await tagsOf(brief.id)) === JSON.stringify(['Copy', 'Launch']) && brief.description?.includes('**notes**') &&
      brief.due_date?.toISOString().startsWith('2026-11-02') &&
      briefComments.length === 2 && briefComments[0].author_id === ana.id && briefComments[0].body === 'Looks good' &&
      briefComments[1].author_id === me.id && /^\*\*Sam Stranger\*\* _\(Asana comment · 2026-10-02/.test(briefComments[1].body) &&
      briefFiles.length === 1 && briefFiles[0].file_name === 'brief.txt' && briefFiles[0].size_bytes === 'the brief, in a file'.length,
    'a task keeps its notes, dates, tags, its assignee where they are a member here, and its comments — under their author when they are a member, else under the importer with the author’s name at the head — and its files; a file that is only a link is not one',
    JSON.stringify({ assignees: brief ? await assigneesOf(brief.id) : null, tags: brief ? await tagsOf(brief.id) : null, description: brief?.description, due: brief?.due_date, comments: briefComments.map((c) => [c.author_id === ana.id ? 'ana' : c.author_id === me.id ? 'me' : c.author_id, c.body.slice(0, 40)]), files: briefFiles }),
  )

  // Sections as Lists, into a Space chosen.
  const asLists2 = SPACE_ID ? await run('asana', { source: 'aw1', projectIds: ['ap2'], spaceId: SPACE_ID, options: { sections: 'lists' } }) : { job: null }
  const opsFolder = SPACE_ID ? await folderNamed(SPACE_ID, `Ops ${TAG}`) : null
  const opsLists = opsFolder ? await listsOf(opsFolder.id) : []
  const keys = await taskNamed(`Rotate keys ${TAG}`)
  chk(
    asLists2.job?.status === 'completed' && opsLists.map((l) => l.name).join('|') === 'Now|Later|Untitled section' && keys?.list_id === opsLists[0]?.id && (await statusesOf(opsLists[0].id)).some((s) => s.key === 'todo'),
    'with sections as Lists, a project brought into an existing Space is a Folder there with a List for each section — and one for the tasks in none — each with the Space’s own statuses',
    JSON.stringify({ job: asLists2.job?.status, error: asLists2.job?.error, lists: opsLists.map((l) => l.name), keys: keys?.list_id === opsLists[0]?.id }),
  )

  // ══ 3. JIRA ══════════════════════════════════════════════════════════════
  console.log('\n▶ Jira: issue types as Lists, epics as tasks with their issues under them, or linked')
  const JR = `jr-${TAG}`
  const anaJ = { accountId: 'ja-ana', displayName: ANA_NAME, emailAddress: ana.email }
  const lee = { accountId: 'ja-lee', displayName: 'Lee Hidden' }
  const sc = (name, key) => ({ name, statusCategory: { key } })
  const epicT = { name: 'Epic', subtask: false, hierarchyLevel: 1 }
  const storyT = { name: 'Story', subtask: false, hierarchyLevel: 0 }
  const bugT = { name: 'Bug', subtask: false, hierarchyLevel: 0 }
  const subT = { name: 'Subtask', subtask: true, hierarchyLevel: -1 }
  const jiraProject = (id, key, name, prefix) => ({
    id,
    key,
    name,
    types: [
      { id: '1', ...epicT, statuses: [sc('To Do', 'new'), sc('In Progress', 'indeterminate'), sc('Done', 'done')] },
      { id: '2', ...storyT, statuses: [sc('To Do', 'new'), sc('In Review', 'indeterminate'), sc('Done', 'done')] },
      { id: '3', ...bugT, statuses: [sc('Open', 'new'), sc('Fixed', 'done')] },
      { id: '4', ...subT, statuses: [sc('To Do', 'new'), sc('Done', 'done')] },
    ],
    issues: [
      { id: `${prefix}1`, key: `${key}-1`, fields: { summary: `${name} epic`, issuetype: epicT, status: sc('In Progress', 'indeterminate'), priority: { name: 'Highest' }, labels: ['launch'], created: '2026-09-01T09:00:00.000+0000', description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The ' }, { type: 'text', text: 'whole', marks: [{ type: 'strong' }] }, { type: 'text', text: ' launch' }] }] } } },
      {
        id: `${prefix}2`, key: `${key}-2`,
        fields: { summary: `${name} copy`, issuetype: storyT, parent: { key: `${key}-1` }, status: sc('In Review', 'indeterminate'), assignee: anaJ, duedate: '2026-11-03', customfield_10016: 5, customfield_10020: { value: 'Growth' } },
        comments: [{ author: anaJ, body: ADF('First note'), created: '2026-10-01T09:00:00.000+0000' }, { author: lee, body: ADF('Second note'), created: '2026-10-02T09:00:00.000+0000' }, { author: anaJ, body: ADF('Third note'), created: '2026-10-03T09:00:00.000+0000' }],
        files: [{ id: `${prefix}501`, filename: 'copy.txt', content: 'the copy, attached' }],
      },
      { id: `${prefix}3`, key: `${key}-3`, fields: { summary: `${name} proofread`, issuetype: subT, parent: { key: `${key}-2` }, status: sc('Done', 'done'), resolutiondate: '2026-10-06T10:00:00.000+0000' } },
      { id: `${prefix}4`, key: `${key}-4`, fields: { summary: `${name} logo bug`, issuetype: bugT, status: sc('Fixed', 'done'), customfield_10020: { value: 'Brand' }, resolutiondate: '2026-10-05T10:00:00.000+0000' } },
    ],
  })
  await seed({
    app: 'jira',
    token: JR,
    refreshToken: `${JR}-refresh`,
    name: 'Admin Jira',
    email: ADMIN.email,
    data: {
      me: { account_id: 'ja-admin' },
      sites: [
        {
          id: 'cloud-1',
          name: `acme-${TAG}`,
          url: 'https://acme.atlassian.test',
          users: [anaJ, lee],
          fields: [
            { id: 'summary', name: 'Summary', custom: false, schema: { type: 'string' } },
            { id: 'customfield_10016', name: 'Story points', custom: true, schema: { type: 'number' } },
            { id: 'customfield_10020', name: 'Team', custom: true, schema: { type: 'option' } },
          ],
          projects: [jiraProject('10000', 'LCH', `Jira launch ${TAG}`, 'a'), jiraProject('10001', 'OPS', `Jira ops ${TAG}`, 'b'), { id: '10002', key: 'SPR', name: `Jira spare ${TAG}`, types: [], issues: [] }],
        },
      ],
    },
  })
  const jrSign = await signInVia('jira', JR)
  const jrGrant = await grantOf('jira')
  const jrSources = await A(`/workspaces/${WS}/import/apps/jira/sources`)
  const jrProjects = await A(`/workspaces/${WS}/import/apps/jira/projects?source=cloud-1`)
  chk(
    jrSign.back?.status === 302 && jrSign.landed.includes('connected=jira') && new URL(jrSign.authUrl || 'http://x').searchParams.get('audience') === 'api.atlassian.com' &&
      /offline_access/.test(new URL(jrSign.authUrl || 'http://x').searchParams.get('scope') ?? '') && openKept(jrGrant?.refresh_token, 'import_grants.refresh_token') === `${JR}-refresh` &&
      jrSources.data?.map((s) => s.name).join() === `acme-${TAG}` && jrProjects.data?.map((p) => p.detail).join() === 'LCH,OPS,SPR',
    'Jira is signed in to through Atlassian, asking to read offline so the grant lasts; its sites and every page of their projects are what may be chosen',
    JSON.stringify({ back: jrSign.back?.status, landed: jrSign.landed, scope: jrSign.authUrl ? new URL(jrSign.authUrl).searchParams.get('scope') : null, refresh: !!jrGrant?.refresh_token, sources: jrSources.data, projects: jrProjects.data?.map((p) => p.detail) }),
  )

  const jr1 = await run('jira', { source: 'cloud-1', projectIds: ['10000'], spaceId: null, options: { lists: 'types', epics: 'subtasks' }, people: { 'jira:ja-lee': null } })
  const jrSpace = await spaceNamed(`acme-${TAG}`)
  const jrFolder = jrSpace ? await folderNamed(jrSpace.id, `Jira launch ${TAG}`) : null
  const jrLists = jrFolder ? await listsOf(jrFolder.id) : []
  const epicList = jrLists.find((l) => l.name === 'Epic')
  const epicStatuses = epicList ? (await statusesOf(epicList.id)).map((s) => `${s.name}:${s.category}`) : []
  const epic = await taskNamed(`Jira launch ${TAG} epic`)
  const copy = await taskNamed(`Jira launch ${TAG} copy`)
  const proof = await taskNamed(`Jira launch ${TAG} proofread`)
  const bug = await taskNamed(`Jira launch ${TAG} logo bug`)
  chk(
    jr1.job?.status === 'completed' && jrLists.map((l) => l.name).join('|') === 'Epic|Bug' &&
      ['To Do:open', 'In Progress:in_progress', 'In Review:in_progress', 'Done:closed'].every((s) => epicStatuses.includes(s)) &&
      copy?.parent_task_id === epic?.id && proof?.parent_task_id === epic?.id && jr1.job?.result?.subtasksFlattened === 1 &&
      epic?.priority === 'urgent' && epic?.status === 'in_progress' && epic?.description?.includes('**whole**') && bug?.status_category === 'closed' && bug?.list_id === jrLists.find((l) => l.name === 'Bug')?.id,
    'with each issue type its own List and epics as tasks, a Jira project is a Folder of an Epic List and a Bug List: a story under its epic as a subtask, the story’s own subtask one level up beside it (subtasks nest one level here), each List with the statuses of the issues in it',
    JSON.stringify({ job: jr1.job?.status, error: jr1.job?.error, lists: jrLists.map((l) => l.name), epicStatuses, copy: copy?.parent_task_id === epic?.id, proof: proof?.parent_task_id === epic?.id, flattened: jr1.job?.result?.subtasksFlattened, epic: [epic?.priority, epic?.status, epic?.description], bug: bug?.status_category }),
  )

  const copyFields = copy ? await fieldsOf(copy.id) : {}
  const bugFields = bug ? await fieldsOf(bug.id) : {}
  const copyComments = copy ? await commentsOf(copy.id) : []
  const copyFiles = copy ? await filesOf(copy.id) : []
  const jrAsked = (await appAsked(STUB, 'jira', JR)) ?? []
  const teamOptions = (await sql`select options from custom_field_definitions where name = 'Team' and list_id = ${epicList?.id ?? null}`)[0]?.options ?? []
  chk(
    copyFields['Story points']?.type === 'number' && copyFields['Story points']?.v === 5 && copyFields.Team?.type === 'dropdown' && copyFields.Team?.v === 'Growth' && bugFields.Team?.v === 'Brand' &&
      teamOptions.map((o) => o.value).sort().join() === 'Brand,Growth' &&
      copyComments.length === 3 && copyComments[0].author_id === ana.id && copyComments[1].author_id === me.id && /^\*\*Lee Hidden\*\* _\(Jira comment/.test(copyComments[1].body) &&
      jrAsked.some((a) => a.includes('/issue/LCH-2/comment?startAt=1')) && copyFiles.map((f) => `${f.file_name}:${f.size_bytes}`).join() === `copy.txt:${'the copy, attached'.length}` &&
      jrAsked.some((a) => /\/search\/jql\?.*nextPageToken=2/.test(a)) && (await assigneesOf(copy.id)).join() === ana.id && copy.due_date?.toISOString().startsWith('2026-11-03'),
    'its custom fields become fields of the List — a number, a dropdown holding every value the issues have — and every comment comes in, the ones past the first read from the issue’s own route; its attachment through Atlassian’s redirect to the file; every page of issues read',
    JSON.stringify({ copyFields, bugFields, teamOptions, comments: copyComments.map((c) => c.author_id === ana.id ? 'ana' : c.author_id === me.id ? 'me' : '?'), files: copyFiles, pagedComments: jrAsked.filter((a) => a.includes('/comment?')).length, pages: jrAsked.filter((a) => a.includes('nextPageToken')).length }),
  )

  const jr2 = SPACE_ID ? await run('jira', { source: 'cloud-1', projectIds: ['10001'], spaceId: SPACE_ID, options: { lists: 'one', epics: 'linked' } }) : { job: null }
  const opsJ = SPACE_ID ? await folderNamed(SPACE_ID, `Jira ops ${TAG}`) : null
  const opsJLists = opsJ ? await listsOf(opsJ.id) : []
  const opsEpic = await taskNamed(`Jira ops ${TAG} epic`)
  const opsCopy = await taskNamed(`Jira ops ${TAG} copy`)
  const linked = opsCopy && opsEpic ? await sql`select type from task_dependencies where task_id = ${opsCopy.id} and related_task_id = ${opsEpic.id}` : []
  chk(
    jr2.job?.status === 'completed' && opsJLists.map((l) => l.name).join() === 'Issues' && opsCopy?.parent_task_id === null && opsCopy?.list_id === opsJLists[0]?.id && linked.map((l) => l.type).join() === 'related_to' && jr2.job?.result?.linksMade === 1,
    'with all issues in one List and epics kept apart, the story is a task of its own beside its epic, linked to it',
    JSON.stringify({ job: jr2.job?.status, error: jr2.job?.error, lists: opsJLists.map((l) => l.name), parent: opsCopy?.parent_task_id, linked, links: jr2.job?.result?.linksMade }),
  )

  // ══ 4. TRELLO ════════════════════════════════════════════════════════════
  console.log('\n▶ Trello: authorized, its token handed back in the address; boards into Folders')
  const TR = `tr-${TAG}`
  const anaT = { id: 'tm-ana', fullName: ANA_NAME, username: 'ana' }
  const kim = { id: 'tm-kim', fullName: 'Kim Outside', username: 'kim' }
  const card = (n) => `6512a8f0${String(n).padStart(16, '0')}`
  await seed({
    app: 'trello',
    token: TR,
    name: 'Admin Trello',
    email: ADMIN.email,
    data: {
      me: { id: 'tm-admin', username: 'admin' },
      orgs: [{ id: 'org1', displayName: `Acme Trello ${TAG}` }],
      boards: [
        {
          id: 'b1',
          name: `Roadmap ${TAG}`,
          idOrganization: 'org1',
          lists: [{ id: 'l1', name: 'To Do', pos: 1 }, { id: 'l2', name: 'Doing', pos: 2 }, { id: 'l3', name: 'Done', pos: 3 }],
          members: [anaT, kim],
          customFields: [{ id: 'cf1', name: 'Effort', type: 'number' }, { id: 'cf2', name: 'Area', type: 'list', options: [{ id: 'o1', value: { text: 'Web' } }, { id: 'o2', value: { text: 'Mobile' } }] }],
          cards: [
            {
              id: card(1), name: `Plan sprint ${TAG}`, desc: 'Plan **it**', idList: 'l1', pos: 1, idMembers: ['tm-ana'], labels: [{ name: 'Planning', color: 'green' }, { name: '', color: 'red' }], due: '2026-11-04T15:00:00.000Z',
              checklists: [{ name: 'Steps', pos: 1, checkItems: [{ name: 'Gather', state: 'complete', pos: 1 }, { name: 'Decide', state: 'incomplete', pos: 2 }] }],
              attachments: [{ id: 'att1', name: 'plan.txt', isUpload: true, bytes: 12 }, { id: 'att2', name: 'Spec', url: 'https://example.test/spec', isUpload: false }],
              customFieldItems: [{ idCustomField: 'cf1', value: { number: '3' } }, { idCustomField: 'cf2', idValue: 'o2' }],
            },
            { id: card(2), name: `Ship it ${TAG}`, idList: 'l3', pos: 1, idMembers: ['tm-kim'] },
            { id: card(3), name: `Build it ${TAG}`, idList: 'l2', pos: 1 },
          ],
          comments: [
            { id: 'c1', card: card(1), text: 'First', date: '2026-10-01T09:00:00Z', member: anaT },
            { id: 'c2', card: card(1), text: 'Second', date: '2026-10-02T09:00:00Z', member: kim },
            { id: 'c3', card: card(2), text: 'Third', date: '2026-10-03T09:00:00Z', member: anaT },
          ],
          files: { att1: 'plan in file' },
        },
        { id: 'b2', name: `Board two ${TAG}`, idOrganization: 'org1', lists: [{ id: 'm1', name: 'Backlog', pos: 1 }, { id: 'm2', name: 'Live', pos: 2 }], members: [], customFields: [], cards: [{ id: card(9), name: `Card two ${TAG}`, idList: 'm2', pos: 1 }], comments: [], files: {} },
      ],
    },
  })
  const trStart = await A(`/workspaces/${WS}/import/apps/trello/connect`, { method: 'POST' })
  const trUrl = new URL(trStart.data?.authUrl ?? 'http://x')
  const returnUrl = trUrl.searchParams.get('return_url') ?? ''
  // Trello's page is the person's to approve; its way back carries the token in the fragment.
  trUrl.searchParams.set('stub_token', TR)
  const trBack = await fetch(trUrl.toString(), { redirect: 'manual' }).catch(() => null)
  const trLanding = trBack?.headers.get('location') ?? ''
  if (trLanding) await page.goto(trLanding.replace(/^https?:\/\/[^/]+/, B), { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.getByTestId('import-app-connected').waitFor({ timeout: 20_000 }).catch(() => {})
  const trSigned = (await readText(page.getByTestId('import-app-connected').filter({ visible: true }))) ?? ''
  const hashLeft = await page.evaluate(() => window.location.hash).catch(() => '?')
  const trGrant = await grantOf('trello')
  chk(
    trUrl.searchParams.get('scope') === 'read' && trUrl.searchParams.get('callback_method') === 'fragment' && returnUrl.includes(`/app/${WS}/import?tab=apps&app=trello`) &&
      trLanding.includes(`#token=${TR}`) && trSigned.includes('Signed in to Trello as Admin Trello') && hashLeft === '' && openKept(trGrant?.access_token, 'import_grants.access_token') === TR,
    'Trello is authorized to read, and hands its token back to the import page in the address’s fragment; the page gives it to the server, which keeps it sealed, and takes it off the address',
    JSON.stringify({ scope: trUrl.searchParams.get('scope'), method: trUrl.searchParams.get('callback_method'), returnUrl, landing: trLanding.slice(-60), trSigned, hashLeft, kept: !!trGrant }),
  )

  const tr1 = await run('trello', { source: 'org1', projectIds: ['b1'], spaceId: null, options: { columns: 'statuses' }, people: { 'trello:tm-ana': ana.id } })
  const trSpace = await spaceNamed(`Acme Trello ${TAG}`)
  const trFolder = trSpace ? await folderNamed(trSpace.id, `Roadmap ${TAG}`) : null
  const trLists = trFolder ? await listsOf(trFolder.id) : []
  const trStatuses = trLists[0] ? (await statusesOf(trLists[0].id)).map((s) => `${s.name}:${s.category}`) : []
  const plan = await taskNamed(`Plan sprint ${TAG}`)
  const ship = await taskNamed(`Ship it ${TAG}`)
  const checklist = plan ? await sql`select c.title, i.content, i.is_done from task_checklists c join task_checklist_items i on i.checklist_id = c.id where c.task_id = ${plan.id} order by i.position` : []
  const planFields = plan ? await fieldsOf(plan.id) : {}
  chk(
    tr1.job?.status === 'completed' && trLists.map((l) => l.name).join() === 'Imported from Trello' && trStatuses.join() === 'To Do:open,Doing:open,Done:closed' &&
      plan?.status === 'to_do' && ship?.status_category === 'closed' && JSON.stringify(await tagsOf(plan.id)) === JSON.stringify(['Planning', 'red']) &&
      checklist.map((c) => `${c.title}/${c.content}:${c.is_done}`).join() === 'Steps/Gather:true,Steps/Decide:false' && planFields.Effort?.v === 3 && planFields.Area?.v === 'Mobile' &&
      (await assigneesOf(plan.id)).join() === ana.id && (await assigneesOf(ship.id)).length === 0 && plan.due_date_has_time === true,
    'a Trello board comes in as a Folder named for it with one List, “Imported from Trello”, whose statuses are its columns, a done one closed; a card keeps its labels, checklists and custom fields, and its member where the importer mapped them — one not mapped is nobody’s',
    JSON.stringify({ job: tr1.job?.status, error: tr1.job?.error, lists: trLists.map((l) => l.name), trStatuses, plan: plan?.status, ship: ship?.status_category, tags: plan ? await tagsOf(plan.id) : null, checklist, planFields }),
  )

  const planComments = plan ? await commentsOf(plan.id) : []
  const planFiles = plan ? await filesOf(plan.id) : []
  const trAsked = (await appAsked(STUB, 'trello', TR)) ?? []
  chk(
    planComments.length === 2 && planComments[0].author_id === ana.id && planComments[0].body === 'First' && /^\*\*Kim Outside\*\* _\(Trello comment/.test(planComments[1].body) &&
      trAsked.some((a) => /\/actions\?.*before=c2/.test(a)) && planFiles.map((f) => f.file_name).join() === 'plan.txt' && plan.description?.includes('[Spec](https://example.test/spec)') &&
      plan.created_at?.toISOString().startsWith(new Date(parseInt('6512a8f0', 16) * 1000).toISOString().slice(0, 16)),
    'its comments come in oldest first, every page of them, under the member mapped or the importer with the author named; an uploaded file is a file and a link a link in the description; a card was made when its id says',
    JSON.stringify({ comments: planComments.map((c) => [c.author_id === ana.id ? 'ana' : 'me', c.body.slice(0, 30)]), pages: trAsked.filter((a) => a.includes('before=')).length, files: planFiles, created: plan?.created_at }),
  )

  const tr2 = await run('trello', { source: 'org1', projectIds: ['b2'], spaceId: SPACE_ID ?? null, options: { columns: 'lists' } })
  const b2Folder = SPACE_ID ? await folderNamed(SPACE_ID, `Board two ${TAG}`) : null
  const b2Lists = b2Folder ? await listsOf(b2Folder.id) : []
  const cardTwo = await taskNamed(`Card two ${TAG}`)
  chk(
    tr2.job?.status === 'completed' && b2Lists.map((l) => l.name).join() === 'Backlog,Live' && cardTwo?.list_id === b2Lists[1]?.id,
    'with columns as Lists, a board is a Folder of a List for each column, each card in its column’s List',
    JSON.stringify({ job: tr2.job?.status, error: tr2.job?.error, lists: b2Lists.map((l) => l.name), card: cardTwo?.list_id === b2Lists[1]?.id }),
  )

  // ══ 5. TODOIST ═══════════════════════════════════════════════════════════
  console.log('\n▶ Todoist: projects into Folders, their sections Lists; closed tasks when asked')
  const TD = `td-${TAG}`
  const anaTd = { id: 'td-ana', name: ANA_NAME, email: ana.email }
  await seed({
    app: 'todoist',
    token: TD,
    name: 'Admin Todoist',
    email: ADMIN.email,
    data: {
      user: { id: 'td-admin', full_name: 'Admin Todoist', email: ADMIN.email },
      projects: [
        {
          id: 'tp1',
          name: `Home ${TAG}`,
          created_at: '2026-01-15T00:00:00Z',
          collaborators: [anaTd],
          sections: [{ id: 'ts1', name: 'Errands', section_order: 1 }, { id: 'ts2', name: 'Calls', section_order: 2 }],
          tasks: [
            { id: 't1', content: `Buy paint ${TAG}`, description: 'Blue', section_id: 'ts1', priority: 4, labels: ['house'], due: { date: '2026-11-05', datetime: '2026-11-05T17:00:00Z' }, responsible_uid: 'td-ana', added_at: '2026-10-01T08:00:00Z', child_order: 1 },
            { id: 't2', content: `Pick colour ${TAG}`, parent_id: 't1', section_id: 'ts1', priority: 1, child_order: 1 },
            { id: 't3', content: `Call the plumber ${TAG}`, section_id: 'ts2', priority: 3, child_order: 1 },
            { id: 't4', content: `Loose task ${TAG}`, priority: 2, child_order: 2 },
          ],
          completed: [{ id: 't9', content: `Old chore ${TAG}`, section_id: 'ts1', completed_at: '2026-05-01T10:00:00Z' }],
          comments: { t1: [{ id: 'cm1', content: 'Matte, not **gloss**', posted_at: '2026-10-02T10:00:00Z', posted_uid: 'td-ana' }] },
        },
        { id: 'tp2', name: `Work ${TAG}`, created_at: '2026-06-01T00:00:00Z', collaborators: [], sections: [], tasks: [{ id: 'w1', content: `Send report ${TAG}`, child_order: 1 }], completed: [{ id: 'w9', content: `Closed report ${TAG}`, completed_at: '2026-09-01T10:00:00Z' }] },
        { id: 'tp3', name: 'Inbox', inbox: true, collaborators: [], sections: [], tasks: [] },
      ],
    },
  })
  const tdSign = await signInVia('todoist', TD)
  const td1 = await run('todoist', { source: 'todoist', projectIds: ['tp1'], spaceId: null, options: { closed: 'yes' } })
  const tdSpace = await spaceNamed('Todoist')
  const tdFolder = tdSpace ? await folderNamed(tdSpace.id, `Home ${TAG}`) : null
  const tdLists = tdFolder ? await listsOf(tdFolder.id) : []
  const paint = await taskNamed(`Buy paint ${TAG}`)
  const colour = await taskNamed(`Pick colour ${TAG}`)
  const plumber = await taskNamed(`Call the plumber ${TAG}`)
  const loose = await taskNamed(`Loose task ${TAG}`)
  const chore = await taskNamed(`Old chore ${TAG}`)
  const paintComments = paint ? await commentsOf(paint.id) : []
  const tdAsked = (await appAsked(STUB, 'todoist', TD)) ?? []
  const windows = tdAsked.filter((a) => a.includes('/tasks/completed/by_completion_date'))
  chk(
    tdSign.back?.status === 302 && td1.job?.status === 'completed' && tdLists.map((l) => l.name).join() === `Home ${TAG},Errands,Calls` &&
      loose?.list_id === tdLists[0]?.id && paint?.list_id === tdLists[1]?.id && plumber?.list_id === tdLists[2]?.id && colour?.parent_task_id === paint?.id &&
      paint?.priority === 'urgent' && plumber?.priority === 'high' && colour?.priority === 'low' && paint?.due_date_has_time === true && paint?.created_at?.toISOString().startsWith('2026-10-01') &&
      JSON.stringify(await tagsOf(paint.id)) === JSON.stringify(['house']) && (await assigneesOf(paint.id)).join() === ana.id &&
      paintComments.length === 1 && paintComments[0].author_id === ana.id && paintComments[0].body === 'Matte, not **gloss**' &&
      chore?.status_category === 'closed' && chore?.list_id === tdLists[1]?.id && windows.length >= 3,
    'a Todoist project is a Folder of a List for its loose tasks and one for each section; tasks keep their subtasks, priority (p1 urgent), labels, due time, when they were made, their assignee and comments — and the completed ones come in closed when asked, read a quarter at a time as Todoist answers them',
    JSON.stringify({ back: tdSign.back?.status, job: td1.job?.status, error: td1.job?.error, lists: tdLists.map((l) => l.name), priority: [paint?.priority, plumber?.priority, colour?.priority], chore: [chore?.status_category, chore?.list_id === tdLists[1]?.id], windows: windows.length, comments: paintComments.length }),
  )

  const td2 = await run('todoist', { source: 'todoist', projectIds: ['tp2'], spaceId: SPACE_ID ?? null, options: { closed: 'no' } })
  const tdAsked2 = (await appAsked(STUB, 'todoist', TD)) ?? []
  chk(
    td2.job?.status === 'completed' && !!(await taskNamed(`Send report ${TAG}`)) && !(await taskNamed(`Closed report ${TAG}`)) && !tdAsked2.some((a) => a.includes('by_completion_date') && a.includes('project_id=tp2')) && td2.job?.result?.notImported?.some((n) => /Attachments/.test(n)),
    'left as ClickUp’s wizard starts it, the completed tasks stay in Todoist, unasked for; and the report says Todoist’s files do not come in',
    JSON.stringify({ job: td2.job?.status, sent: !!(await taskNamed(`Send report ${TAG}`)), closed: !!(await taskNamed(`Closed report ${TAG}`)), notImported: td2.job?.result?.notImported }),
  )

  // ══ 6. WRIKE ═════════════════════════════════════════════════════════════
  console.log('\n▶ Wrike: spaces into Spaces, folders into Folders, projects and inner folders into Lists')
  const WR = `wr-${TAG}`
  await seed({
    app: 'wrike',
    token: WR,
    name: 'Admin Wrike',
    email: ADMIN.email,
    data: {
      host: 'app-eu.wrike.com',
      account: { name: `Acme Wrike ${TAG}` },
      contacts: [
        { id: 'KU-admin', firstName: 'Admin', lastName: 'Wrike', type: 'Person', profiles: [{ email: ADMIN.email }] },
        { id: 'KU-ana', firstName: 'Ana', lastName: 'Importer', type: 'Person', profiles: [{ email: ana.email }] },
      ],
      workflows: [{ id: 'wf1', name: 'Default', customStatuses: [{ id: 'cs1', name: 'New', group: 'Active' }, { id: 'cs2', name: 'In design', group: 'Active' }, { id: 'cs3', name: 'Completed', group: 'Completed' }, { id: 'cs4', name: 'Cancelled', group: 'Cancelled' }] }],
      customfields: [{ id: 'CF1', title: 'Budget', type: 'Numeric' }, { id: 'CF2', title: 'Score', type: 'Formula' }],
      spaces: [
        {
          id: 'SP1',
          title: `Marketing ${TAG}`,
          folders: [
            { id: 'SP1', title: 'Root', childIds: ['F1', 'P1'], scope: 'WsRoot' },
            { id: 'F1', title: 'Campaigns', childIds: ['F2', 'P2'], scope: 'WsFolder' },
            { id: 'F2', title: 'Q4 assets', childIds: [], scope: 'WsFolder' },
            { id: 'P2', title: 'Holiday launch', childIds: [], scope: 'WsFolder', project: { status: 'Green' } },
            { id: 'P1', title: 'Website refresh', childIds: [], scope: 'WsFolder', project: { status: 'Green' } },
          ],
          tasks: {
            F1: [
              { id: 'T1', title: `Brief the agency ${TAG}`, status: 'Active', customStatusId: 'cs2', importance: 'High', responsibleIds: ['KU-ana'], dates: { start: '2026-10-20T09:00:00', due: '2026-10-30T17:00:00' }, createdDate: '2026-10-01T08:00:00Z', subTaskIds: ['T1a'], customFields: [{ id: 'CF1', value: '1200' }, { id: 'CF2', value: '7' }], attachmentCount: 1, description: '<p>Agency <b>brief</b></p>' },
              { id: 'T1a', title: `Gather logos ${TAG}`, status: 'Active', customStatusId: 'cs1', superTaskIds: ['T1'], subTaskIds: ['T1a1'] },
              { id: 'T1a1', title: `Find the SVGs ${TAG}`, status: 'Completed', customStatusId: 'cs3', superTaskIds: ['T1a'], completedDate: '2026-10-09T10:00:00Z' },
            ],
            F2: [{ id: 'T2', title: `Banner sizes ${TAG}`, status: 'Active', customStatusId: 'cs1' }],
            P2: [{ id: 'T3', title: `Launch email ${TAG}`, status: 'Completed', customStatusId: 'cs3', completedDate: '2026-10-08T10:00:00Z' }],
            P1: [{ id: 'T4', title: `New homepage ${TAG}`, status: 'Active', customStatusId: 'cs2' }, { id: 'T5', title: `Old pages ${TAG}`, status: 'Cancelled', customStatusId: 'cs4' }],
          },
        },
        { id: 'SP2', title: `Spare ${TAG}`, folders: [], tasks: {} },
      ],
      comments: { T1: [{ authorId: 'KU-ana', text: '<p>On it</p>', createdDate: '2026-10-02T10:00:00Z' }] },
      files: { T1: [{ id: 'A1', name: 'brief.pdf', content: 'pdf bytes' }] },
    },
  })
  const wrSign = await signInVia('wrike', WR)
  const wrGrant = await grantOf('wrike')
  const wr1 = await run('wrike', { source: 'wrike', projectIds: ['SP1'], spaceId: null })
  const wrSpace = await spaceNamed(`Marketing ${TAG}`)
  const campaigns = wrSpace ? await folderNamed(wrSpace.id, 'Campaigns') : null
  const campaignLists = campaigns ? await listsOf(campaigns.id) : []
  const container = wrSpace ? (await sql`select id from projects where space_id = ${wrSpace.id} and is_default_container`)[0] : null
  const loneLists = container ? await listsOf(container.id) : []
  const loneStatuses = loneLists[0] ? (await statusesOf(loneLists[0].id)).map((s) => `${s.name}:${s.category}`) : []
  const agency = await taskNamed(`Brief the agency ${TAG}`)
  const logos = await taskNamed(`Gather logos ${TAG}`)
  const svgs = await taskNamed(`Find the SVGs ${TAG}`)
  const agencyFields = agency ? await fieldsOf(agency.id) : {}
  chk(
    wrSign.back?.status === 302 && wrGrant?.account?.host === 'app-eu.wrike.com' && wr1.job?.status === 'completed' &&
      campaignLists.map((l) => l.name).join() === 'Campaigns,Q4 assets,Holiday launch' && loneLists.map((l) => l.name).join() === 'Website refresh' &&
      loneStatuses.join() === 'In design:open,Cancelled:closed' && logos?.parent_task_id === agency?.id && svgs?.parent_task_id === agency?.id && svgs?.status_category === 'closed' &&
      agency?.priority === 'high' && agencyFields.Budget?.v === 1200 && !('Score' in agencyFields) && (await assigneesOf(agency.id)).join() === ana.id &&
      (await commentsOf(agency.id)).map((c) => c.author_id).join() === ana.id && (await filesOf(agency.id)).map((f) => f.file_name).join() === 'brief.pdf',
    'a Wrike space comes in as a Space: its top folder a Folder holding a List of its own tasks and one for each folder and project inside it, a project at the top a List; each List’s statuses the workflow statuses its tasks are in; subtasks and theirs, one level here; a formula field left out',
    JSON.stringify({ back: wrSign.back?.status, host: wrGrant?.account?.host, job: wr1.job?.status, error: wr1.job?.error, campaignLists: campaignLists.map((l) => l.name), loneLists: loneLists.map((l) => l.name), loneStatuses, logos: logos?.parent_task_id === agency?.id, svgs: [svgs?.parent_task_id === agency?.id, svgs?.status_category], agencyFields }),
  )

  // ══ 7. MONDAY ════════════════════════════════════════════════════════════
  console.log('\n▶ Monday: its personal API token pasted; boards into Lists')
  const MD = `md-${TAG}`
  const remy = { id: 102, name: 'Remy Remote', email: `remy-${TAG}@elsewhere.test` }
  const mondayBoard = (id, name) => ({
    id,
    name,
    workspace: 'Marketing',
    columns: [
      { id: 'name', title: 'Name', type: 'name' },
      { id: 'status', title: 'Status', type: 'status', settings_str: JSON.stringify({ labels: { 0: 'Working on it', 1: 'Done', 2: 'Stuck' }, done_colors: [1] }) },
      { id: 'person', title: 'Owner', type: 'people' },
      { id: 'date4', title: 'Due', type: 'date' },
      { id: 'numbers', title: 'Budget', type: 'numbers' },
      { id: 'text', title: 'Notes', type: 'text' },
      { id: 'formula', title: 'Calc', type: 'formula' },
    ],
    groups: [{ id: 'g1', title: 'This week', position: '1' }, { id: 'g2', title: 'Next week', position: '2' }, { id: 'g3', title: 'Done', position: '3' }],
    items: [
      {
        id: `${id}1`, name: `${name} blog post`, created_at: '2026-10-01T08:00:00Z', state: 'active', group: 'g1',
        column_values: [
          { id: 'status', type: 'status', text: 'Working on it', value: '{"index":0}' },
          { id: 'person', type: 'people', text: ANA_NAME, value: JSON.stringify({ personsAndTeams: [{ id: 101, kind: 'person' }] }) },
          { id: 'date4', type: 'date', text: '2026-11-06', value: JSON.stringify({ date: '2026-11-06' }) },
          { id: 'numbers', type: 'numbers', text: '250', value: '"250"' },
          { id: 'text', type: 'text', text: 'Draft first', value: '"Draft first"' },
          { id: 'formula', type: 'formula', text: '42', value: null },
        ],
        subitems: [{ id: `${id}11`, name: `${name} outline`, column_values: [{ id: 'status', type: 'status', text: 'Done' }] }],
        updates: [{ id: 'u1', text_body: 'Started the draft', created_at: '2026-10-02T09:00:00Z', creator: { id: '101', name: ANA_NAME, email: ana.email } }],
      },
      { id: `${id}2`, name: `${name} newsletter`, group: 'g2', state: 'active', column_values: [{ id: 'status', type: 'status', text: 'Stuck' }, { id: 'person', type: 'people', value: JSON.stringify({ personsAndTeams: [{ id: 102, kind: 'person' }] }) }] },
      { id: `${id}3`, name: `${name} podcast`, group: 'g3', state: 'active', column_values: [{ id: 'status', type: 'status', text: 'Done' }] },
    ],
  })
  await seed({
    app: 'monday',
    token: MD,
    name: 'Admin Monday',
    email: ADMIN.email,
    data: { me: { id: 'm-admin', account: { name: `Acme Monday ${TAG}` } }, users: [{ id: 101, name: ANA_NAME, email: ana.email }, remy], boards: [mondayBoard('9001', `Content ${TAG}`), mondayBoard('9002', `Second board ${TAG}`)] },
  })
  await page.goto(`${B}/app/${WS}/import?tab=apps&app=monday`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('import-app-token').waitFor({ timeout: 20_000 }).catch(() => {})
  await page.getByTestId('import-app-token').fill(`not-${MD}`).catch(() => {})
  await page.getByTestId('import-app-token-save').click().catch(() => {})
  await page.getByTestId('import-app-token-error').waitFor({ timeout: 15_000 }).catch(() => {})
  const refusedSaid = (await readText(page.getByTestId('import-app-token-error').filter({ visible: true }))) ?? ''
  const keptAfterRefusal = await grantOf('monday')
  await page.getByTestId('import-app-token').fill(MD).catch(() => {})
  await page.getByTestId('import-app-token-save').click().catch(() => {})
  await page.getByTestId('import-app-connected').waitFor({ timeout: 20_000 }).catch(() => {})
  const mdSigned = (await readText(page.getByTestId('import-app-connected').filter({ visible: true }))) ?? ''
  const mdGrant = await grantOf('monday')
  chk(
    /Monday refused the grant/.test(refusedSaid) && !keptAfterRefusal && mdSigned.includes('Signed in to Monday as Admin Monday') && isSealed(mdGrant?.access_token) && openKept(mdGrant?.access_token, 'import_grants.access_token') === MD,
    'Monday takes its personal API token, pasted: one Monday refuses is said in the form and nothing is kept; the right one signs in, kept sealed',
    JSON.stringify({ refusedSaid, keptAfterRefusal: !!keptAfterRefusal, mdSigned, kept: !!mdGrant }),
  )

  const md1 = await run('monday', { source: 'monday', projectIds: ['9001'], spaceId: null, options: { statuses: 'groups' } })
  const mdSpace = await spaceNamed(`Acme Monday ${TAG}`)
  const mdContainer = mdSpace ? (await sql`select id from projects where space_id = ${mdSpace.id} and is_default_container`)[0] : null
  const mdLists = mdContainer ? await listsOf(mdContainer.id) : []
  const mdStatuses = mdLists[0] ? (await statusesOf(mdLists[0].id)).map((s) => `${s.name}:${s.category}`) : []
  const blog = await taskNamed(`Content ${TAG} blog post`)
  const pod = await taskNamed(`Content ${TAG} podcast`)
  const news = await taskNamed(`Content ${TAG} newsletter`)
  const outlineM = await taskNamed(`Content ${TAG} outline`)
  const blogFields = blog ? await fieldsOf(blog.id) : {}
  const mdAsked = (await appAsked(STUB, 'monday', MD)) ?? []
  chk(
    md1.job?.status === 'completed' && mdLists.map((l) => l.name).join() === `Content ${TAG}` && mdStatuses.join() === 'This week:open,Next week:open,Done:closed' &&
      blog?.status === 'this_week' && pod?.status_category === 'closed' && (await assigneesOf(blog.id)).join() === ana.id && (await assigneesOf(news.id)).length === 0 &&
      blog.due_date?.toISOString().startsWith('2026-11-06') && blogFields.Budget?.v === 250 && blogFields.Notes?.v === 'Draft first' && blogFields.Status?.v === 'Working on it' && !('Calc' in blogFields) &&
      outlineM?.parent_task_id === blog?.id && outlineM?.status_category === 'closed' && (await commentsOf(blog.id)).map((c) => c.author_id).join() === ana.id &&
      mdAsked.some((a) => a.includes('next_items_page')),
    'a Monday board is a List named for it, in a new Space; with its groups as the statuses, a Done group closes; its people column assigns, its date column is the due date, its other columns fields — the status column one of them — a formula left out; subitems are subtasks and updates comments; every page of items read',
    JSON.stringify({ job: md1.job?.status, error: md1.job?.error, lists: mdLists.map((l) => l.name), mdStatuses, blog: blog?.status, pod: pod?.status_category, blogFields, outline: [outlineM?.parent_task_id === blog?.id, outlineM?.status_category], pages: mdAsked.filter((a) => a.includes('next_items_page')).length }),
  )

  const md2 = await run('monday', { source: 'monday', projectIds: ['9002'], spaceId: SPACE_ID ?? null, options: { statuses: 'column' } })
  const second = await taskNamed(`Second board ${TAG} newsletter`)
  const secondList = second ? (await sql`select id from lists where id = ${second.list_id}`)[0] : null
  const secondStatuses = secondList ? (await statusesOf(secondList.id)).map((s) => `${s.name}:${s.category}`) : []
  const secondPod = await taskNamed(`Second board ${TAG} podcast`)
  chk(
    md2.job?.status === 'completed' && secondStatuses.join() === 'Working on it:open,Done:closed,Stuck:open' && second?.status === 'stuck' && secondPod?.status_category === 'closed',
    'with its status column as the statuses, the board’s labels are the List’s, those Monday marks done closed',
    JSON.stringify({ job: md2.job?.status, error: md2.job?.error, secondStatuses, second: second?.status, pod: secondPod?.status_category }),
  )

  // ══ 8. NOTION ════════════════════════════════════════════════════════════
  console.log('\n▶ Notion: from its workspace export — databases into one Folder, pages into Docs')
  const wiki = `Export/Team wiki ${TAG} ${ID(1)}`
  const db = `Export/Tasks db ${ID(2)}`
  const exportZip = zip({
    [`${wiki}.md`]: `# Team wiki ${TAG}\n\nWelcome to the **wiki**.\n`,
    [`${wiki}/Onboarding ${ID(3)}.md`]: `# Onboarding ${TAG}\n\nDay one: say hi.\n`,
    [`${db}.csv`]: 'Name,Status,Owner\nShip the site,Done,Ana\n',
    [`${db}_all.csv`]: `﻿Name,Status,Owner\nShip the site ${TAG},Done,Ana\nWrite docs ${TAG},In progress,Sam\nOld row ${TAG},Archived,Lee\n`,
    [`${db}/Ship the site ${TAG} ${ID(4)}.md`]: `# Ship the site ${TAG}\n\nStatus: Done\nOwner: Ana\n\nThe site goes live on Friday.\n`,
  })
  const tmp = path.join(process.env.TMPDIR ?? '/tmp', `notion-${TAG}.zip`)
  await import('node:fs').then((fs) => fs.writeFileSync(tmp, exportZip))
  await page.goto(`${B}/app/${WS}/import?tab=apps&app=notion`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('import-notion-file').waitFor({ state: 'attached', timeout: 20_000 }).catch(() => {})
  await page.getByTestId('import-app-into-new').check().catch(() => {})
  await page.getByTestId('import-notion-file').setInputFiles(tmp).catch(() => {})
  await page.getByTestId('import-app-report').waitFor({ timeout: 90_000 }).catch(() => {})
  const nfig = async (k) => Number(await page.getByTestId(`import-app-r-${k}`).getAttribute('data-value').catch(() => -1))
  const nFigures = { tasks: await nfig('tasks'), lists: await nfig('lists'), pages: await nfig('pages'), fields: await nfig('fields') }
  const docLinks = await page.getByTestId('import-app-r-doc').filter({ visible: true }).allInnerTexts().catch(() => [])
  const shipped = await taskNamed(`Ship the site ${TAG}`)
  const shippedFields = shipped ? await fieldsOf(shipped.id) : {}
  const wikiDoc = (await sql`select id, space_id from docs where workspace_id = ${WS} and title = ${`Team wiki ${TAG}`}`)[0]
  const onboarding = (await sql`select parent_doc_id, plaintext from docs where workspace_id = ${WS} and title = ${`Onboarding ${TAG}`}`)[0]
  const notionSpace = await spaceNamed('Notion')
  const dbFolder = notionSpace ? await folderNamed(notionSpace.id, 'Notion databases') : null
  chk(
    nFigures.tasks === 3 && nFigures.lists === 1 && nFigures.pages === 2 && docLinks.join() === `Team wiki ${TAG}` &&
      dbFolder && (await listsOf(dbFolder.id)).map((l) => l.name).join() === 'Tasks db' &&
      shipped?.description === 'The site goes live on Friday.' && shippedFields.Status?.type === 'text' && shippedFields.Status?.v === 'Done' && shippedFields.Owner?.v === 'Ana' &&
      !!(await taskNamed(`Old row ${TAG}`)) && onboarding?.parent_doc_id === wikiDoc?.id && wikiDoc?.space_id === notionSpace?.id && /Day one: say hi/.test(onboarding?.plaintext ?? ''),
    'a Notion workspace export comes in as ClickUp brings it: its databases into one Folder, each a List whose rows are tasks — every row, the page under a row its description, its properties text fields — and its pages Docs, the page under another a page of its Doc, with their titles and not Notion’s ids',
    JSON.stringify({ nFigures, docLinks, folder: !!dbFolder, shipped: shipped?.description, shippedFields, oldRow: !!(await taskNamed(`Old row ${TAG}`)), nested: onboarding?.parent_doc_id === wikiDoc?.id, space: wikiDoc?.space_id === notionSpace?.id }),
  )

  // ══ 9. A RUN THAT FAILS, A RETRY, A MAPPING REFUSED, A SIGN-OUT ═══════════
  console.log('\n▶ What goes wrong: the grant refused mid-run, Asana asking to wait, a mapping to a stranger')
  // The first project reads; the second's reading is refused — after the run has made the first.
  const spacesBefore = (await sql`select count(*)::int as n from spaces where workspace_id = ${WS} and name = ${`Acme ${TAG}`}`)[0]?.n
  await seed({
    app: 'asana',
    token: AS,
    name: 'Admin Asana',
    email: ADMIN.email,
    data: { workspaces: [{ gid: 'aw1', name: `Acme ${TAG}`, users: [], projects: [{ gid: 'ap9', name: `Doomed ${TAG}`, sections: [{ gid: 'ds1', name: 'One' }], tasks: [{ gid: 'dt1', name: `Doomed task ${TAG}`, section: 'ds1' }] }, { gid: 'ap10', name: `Refused ${TAG}`, sections: [], tasks: [] }] }] },
    fail: { status: 401, count: 50, path: '/projects/ap10/' },
  })
  const doomedRun = await run('asana', { source: 'aw1', projectIds: ['ap9', 'ap10'], spaceId: null })
  const doomed = doomedRun.job
  const doomedLeft = (await sql`select count(*)::int as n from projects where name = ${`Doomed ${TAG}`}`)[0]?.n
  const spacesAfter = (await sql`select count(*)::int as n from spaces where workspace_id = ${WS} and name = ${`Acme ${TAG}`}`)[0]?.n
  const doomedAsked = (await appAsked(STUB, 'asana', AS)) ?? []
  chk(
    doomedRun.started.status === 201 && doomed?.status === 'failed' && /Asana refused the grant: sign in to Asana again/.test(doomed?.error ?? '') &&
      doomedAsked.some((a) => a.includes('/projects/ap9/tasks')) && doomedLeft === 0 && spacesAfter === spacesBefore && !(await taskNamed(`Doomed task ${TAG}`)),
    'a run Asana stops answering half-way fails in Asana’s words — sign in again — and takes away what it had made: the Space, the Folder and the tasks of the project it had read',
    JSON.stringify({ start: said(doomedRun.started), job: doomed?.status, error: doomed?.error, readFirst: doomedAsked.some((a) => a.includes('/projects/ap9/tasks')), left: doomedLeft, spaces: [spacesBefore, spacesAfter] }),
  )

  await seed({ app: 'asana', token: AS, name: 'Admin Asana', email: ADMIN.email, data: { workspaces: [{ gid: 'aw1', name: `Acme ${TAG}`, users: [], projects: [{ gid: 'ap8', name: `Patient ${TAG}`, sections: [], tasks: [{ gid: 'pt1', name: `Waited for ${TAG}` }] }] }] }, fail: { status: 429, count: 1 } })
  const patient = await run('asana', { source: 'aw1', projectIds: ['ap8'], spaceId: SPACE_ID ?? null })
  const patientAsked = (await appAsked(STUB, 'asana', AS)) ?? []
  const toStranger = await A(`/workspaces/${WS}/import/apps/asana`, { method: 'POST', body: { source: 'aw1', projectIds: ['ap8'], spaceId: null, people: { 'asana:au-x': '00000000-0000-4000-8000-000000000000' } } })
  const toGuest = await A(`/workspaces/${WS}/import/apps/asana`, { method: 'POST', body: { source: 'aw1', projectIds: ['ap8'], spaceId: null, people: { 'asana:au-x': gus.id } } })
  chk(
    patient.job?.status === 'completed' && !!(await taskNamed(`Waited for ${TAG}`)) && patientAsked.filter((a) => a.includes('/users/me')).length >= 2 &&
      toStranger.status === 400 && toGuest.status === 400 && /mapped to a member of this workspace/.test(JSON.stringify(toGuest.message ?? '')),
    'when Asana asks to wait (429), the import waits and asks again; and a person of the tool is mapped only to a member here — not to somebody else, nor to a guest',
    JSON.stringify({ job: patient.job?.status, error: patient.job?.error, asked: patientAsked.filter((a) => a.includes('/users/me')).length, stranger: said(toStranger), guest: said(toGuest) }),
  )

  const out = await A(`/workspaces/${WS}/import/apps/asana`, { method: 'DELETE' })
  const after = await A(`/workspaces/${WS}/import/apps/asana`)
  const goneProjects = await A(`/workspaces/${WS}/import/apps/asana/projects?source=aw1`)
  chk(
    out.status === 200 && !(await grantOf('asana')) && after.data?.connected === false && goneProjects.status === 400,
    'signing out of Asana here forgets the grant: nothing more is read through it',
    JSON.stringify({ out: out.status, kept: !!(await grantOf('asana')), connected: after.data?.connected, projects: said(goneProjects) }),
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m the run stopped: ${e?.stack ?? e}`)
} finally {
  await browser?.close().catch(() => {})
  stack.close()
  await sql?.end?.({ timeout: 2 }).catch?.(() => {})
}

console.log(`\n${passed} passed, ${failed} failed`)
// Said only when it is so, as every suite says it: the break runner reads this line as a short run.
if (passed + failed !== EXPECTED_CHECKS) {
  console.log(`\n✗ ${passed + failed} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
}
if (failed > 0 || passed + failed !== EXPECTED_CHECKS) process.exitCode = 1
