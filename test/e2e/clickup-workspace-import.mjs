/**
 * A CLICKUP WORKSPACE, IMPORTED WHOLE, ITS PEOPLE WITH IT (`found-14-oct/clickup-workspace-import-and-people-unbuilt`).
 *
 * The ClickUp tab read ClickUp's CSV export, and the comments and files of
 * its tasks over the API when a token was given; the people its rows named
 * came in only where they were members here already, and nobody was asked to
 * join. Moving a team off ClickUp is the team as well as its work. So the tab
 * signs in to ClickUp by its personal API token and reads a Workspace's
 * Spaces over ClickUp's API v2 — Folders, Lists, each List's statuses, every
 * page of its tasks with their subtasks, and each task's comments and files —
 * and the Workspace's people come with it: matched to members here by email,
 * or invited, with the role ClickUp gives them, their tasks held for them and
 * theirs when they accept.
 *
 * ClickUp here is the lane's stub (`import-apps-stub.mjs`, on the calendar
 * stub's port) in ClickUp's own shapes: 2 tasks a page where ClickUp gives
 * 100, 25 comments a page as ClickUp gives them. What was made is read back by
 * SQL; the sign-in, the choosing and the people go through the page.
 *
 *   DATABASE_URL=postgres://…/rundesk_v4 node test/e2e/clickup-workspace-import.mjs --api 3024 --dist /tmp/claude-0/dist-4
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt, madeWorkspace } from './lib/fixture.mjs'
import { madeAccount, madeRow } from './lib/made.mjs'
import { waitUntil, readText } from './lib/wait.mjs'
import { calendarBase, seedApp, appAsked } from './lib/calendar.mjs'
import { mailBase, mailTo } from './lib/mail.mjs'
import { isSealed, openKept } from './lib/sealed.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

const EXPECTED_CHECKS = 29

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const STUB = calendarBase(API_PORT, argOf('--calendar', undefined))
const MAIL = mailBase(API_PORT, argOf('--mail', undefined))
const ADMIN = { email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal', password: process.env.E2E_PASSWORD ?? 'Admin@123!' }

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

const stamp = Date.now()
const TAG = `cwi${stamp}`
const PASSWORD = 'ClickUpImport@12345!'
const ANA_NAME = `Ana Member ${stamp}`
const CU = `pk_${TAG}_token`
// Moments as ClickUp gives them: milliseconds since 1970, as strings.
const MS = (iso) => String(Date.parse(iso))

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
  if (!sql) throw new Error('no DATABASE_URL — what the import made is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  const A = apiAs(auth.accessToken)
  const [me] = await sql`select id from users where lower(email) = lower(${ADMIN.email})`
  const made = await A('/workspaces', { method: 'POST', body: { name: `ClickUp import ${TAG}` } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  madeWorkspace(WS)
  const SPACE_ID = (await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `Existing ${TAG}` } })).data?.id

  // Ana is a member here and in ClickUp; Nina, Gil, Ola and Pat are in ClickUp only.
  const anaEmail = `${TAG}-ana@rundesk.invalid`
  await signUpApi(API, { fullName: ANA_NAME, email: anaEmail, password: PASSWORD, organizationName: `CWI ana ${stamp}`, organizationSlug: `cwi-ana-${stamp}` })
  const addedAna = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email: anaEmail, role: 'member' } })
  if (!addedAna.ok) throw new Error(`could not add Ana: ${said(addedAna)}`)
  const [ana] = await sql`select id from users where email = ${anaEmail}`
  // The admin and Ana talk here already: the history of their ClickUp direct message joins this one.
  const anaDm = await A(`/workspaces/${WS}/chat/dms`, { method: 'POST', body: { peerUserId: ana.id } })
  if (!anaDm.ok || !anaDm.data?.id) throw new Error(`could not open the admin's direct message with Ana: ${said(anaDm)}`)
  const OUT = (who) => `${TAG}-${who}@clickup.invalid`
  const nina = { id: 902, username: `Nina New ${stamp}`, email: OUT('nina'), role: 3 }
  const gil = { id: 903, username: `Gil Guest ${stamp}`, email: OUT('gil'), role: 4 }
  const ola = { id: 904, username: `Ola Admin ${stamp}`, email: OUT('ola'), role: 2 }
  const pat = { id: 905, username: `Pat Later ${stamp}`, email: OUT('pat'), role: 3 }
  const anaCu = { id: 901, username: ANA_NAME, email: anaEmail, role: 3 }
  const adminCu = { id: 900, username: 'Admin ClickUp', email: ADMIN.email.toLowerCase(), role: 1 }
  const lite = (u) => ({ id: u.id, username: u.username, email: u.email })

  // ── ClickUp, as its API answers ────────────────────────────────────────────
  const SPACE_STATUSES = [
    { status: 'to do', type: 'open', orderindex: 0 },
    { status: 'in progress', type: 'custom', orderindex: 1 },
    { status: 'review', type: 'custom', orderindex: 2 },
    { status: 'complete', type: 'closed', orderindex: 3 },
  ]
  const st = (name) => SPACE_STATUSES.find((s) => s.status === name) ?? { status: name, type: 'custom', orderindex: 1 }
  // 27 comments: more than one of ClickUp's pages of 25. Ana's and Nina's in turn, a minute apart.
  const comments = Array.from({ length: 27 }, (_, n) => ({
    id: `c${n + 1}`,
    comment_text: `Note ${n + 1} ${TAG}`,
    user: n % 2 === 0 ? lite(anaCu) : lite(nina),
    date: MS(`2026-10-01T09:${String(n).padStart(2, '0')}:00Z`),
  }))
  const launch = {
    id: 'cu1',
    name: `Launch plan ${TAG}`,
    markdown_description: '# Plan\n\nShip **it** on time',
    status: st('in progress'),
    date_created: MS('2026-09-20T10:00:00Z'),
    start_date: MS('2026-10-05T00:00:00Z'),
    due_date: MS('2026-10-20T15:30:00Z'),
    due_date_time: true,
    time_estimate: 7200000,
    priority: { id: '1', priority: 'urgent' },
    assignees: [lite(anaCu), lite(nina)],
    tags: [{ name: `launch-${stamp}` }],
    checklists: [{ name: 'Ready', items: [{ name: 'Brief', resolved: true }, { name: 'Assets', resolved: false, children: [{ name: 'Logo', resolved: false }] }] }],
    custom_fields: [
      { id: 'f1', name: 'Budget', type: 'currency', value: 1200 },
      { id: 'f2', name: 'Stage', type: 'drop_down', type_config: { options: [{ id: 'o1', name: 'Idea', orderindex: 0 }, { id: 'o2', name: 'Build', orderindex: 1 }] }, value: 1 },
      { id: 'f3', name: 'Spec', type: 'url', value: 'https://example.com/spec' },
      { id: 'f4', name: 'Signed off', type: 'checkbox', value: 'true' },
      { id: 'f5', name: 'Kickoff', type: 'date', value: MS('2026-10-02T00:00:00Z') },
      { id: 'f6', name: 'Areas', type: 'labels', type_config: { options: [{ id: 'a1', label: 'Web' }, { id: 'a2', label: 'Mobile' }] }, value: ['a1', 'a2'] },
      { id: 'f7', name: 'Owner', type: 'users', value: [lite(anaCu)] },
      { id: 'f8', name: 'Empty', type: 'text' },
      // A Files field (`found-14-oct/clickup-import-rest-unimported`): its file is the task's too.
      { id: 'f9', name: 'Contract', type: 'attachment', value: [{ id: 'fa1', title: 'contract.txt', content: 'signed contract' }] },
    ],
    linked_tasks: [{ task_id: 'cu1', link_id: 'cu3' }],
    comments,
    attachments: [{ id: 'at1', title: 'plan.txt', content: 'the plan, in a file' }],
  }
  const tasksQ4 = [
    launch,
    { id: 'cu2', name: `Launch copy ${TAG}`, parent: 'cu1', status: st('to do'), assignees: [lite(gil)] },
    { id: 'cu3', name: `Press kit ${TAG}`, status: st('complete'), date_closed: MS('2026-10-03T12:00:00Z'), assignees: [lite(ola)], dependencies: [{ task_id: 'cu3', depends_on: 'cu1' }] },
    { id: 'cu4', name: `Draft blog ${TAG}`, status: st('review'), assignees: [] },
    // A subtask's own subtask: subtasks nest one level here, so it comes in under Launch plan.
    { id: 'cu5', name: `Launch copy headline ${TAG}`, parent: 'cu2', status: st('to do'), assignees: [] },
  ]
  const INBOX = [
    { status: 'open', type: 'open', orderindex: 0 },
    { status: 'blocked', type: 'custom', orderindex: 1 },
    { status: 'shipped', type: 'done', orderindex: 2 },
    { status: 'Closed', type: 'closed', orderindex: 3 },
  ]
  const data = {
    user: lite(adminCu),
    teams: [{
      id: 't1',
      name: `Acme ClickUp ${TAG}`,
      members: [adminCu, anaCu, nina, gil, ola, pat].map((user) => ({ user })),
      spaces: [{
        id: 's1',
        name: `Product ${TAG}`,
        statuses: SPACE_STATUSES,
        folders: [{
          id: 'fo1',
          name: `Roadmap ${TAG}`,
          lists: [{
            id: 'l1',
            name: `Q4 ${TAG}`,
            content: 'This quarter',
            tasks: tasksQ4,
            // Its views: a pinned board grouped by priority, newest due first; Ana's own list; and a Form, which no List here has.
            views: [
              { id: 'v1', name: `Sprint board ${TAG}`, type: 'board', orderindex: 0, pinned: true, visibility: 'public', creator: 900, grouping: { field: 'priority' }, sorting: { fields: [{ field: 'dueDate', dir: -1 }] } },
              { id: 'v2', name: `Mine ${TAG}`, type: 'list', orderindex: 1, visibility: 'private', creator: 901 },
              { id: 'v3', name: `Intake ${TAG}`, type: 'form', orderindex: 2, visibility: 'public', creator: 900 },
            ],
          }],
        }],
        lists: [{
          id: 'l2',
          name: `Inbox ${TAG}`,
          override_statuses: true,
          statuses: INBOX,
          tasks: [
            { id: 'cu7', name: `Fix login ${TAG}`, status: INBOX[1], assignees: [lite(nina)] },
            { id: 'cu8', name: `Old bug ${TAG}`, status: INBOX[2], date_done: MS('2026-09-30T08:00:00Z'), assignees: [lite(pat)] },
          ],
        }],
      }],
      // The rest of the Workspace (`found-14-oct/clickup-docs-time-goals-unimported`): a Doc in the Space with a page under its
      // first and one beside it, a Doc in its Inbox List, and one of the Workspace's own.
      docs: [
        {
          id: 'd1',
          name: `Product brief ${TAG}`,
          parent: { id: 's1', type: 4 },
          pages: [
            { id: 'p1', name: 'Overview', content: `# Why\n\nWe ship ${TAG}`, pages: [{ id: 'p2', name: `Risks ${TAG}`, content: 'Late **assets**' }] },
            { id: 'p3', name: `Timeline ${TAG}`, content: 'October' },
          ],
        },
        { id: 'd2', name: `Inbox notes ${TAG}`, parent: { id: 'l2', type: 6 }, pages: [{ id: 'p4', name: 'Notes', content: 'Triage daily' }] },
        { id: 'd3', name: `Handbook ${TAG}`, parent: { id: 't1', type: 12 }, pages: [{ id: 'p5', name: 'Welcome', content: 'Hello team' }] },
      ],
      // Ana's two hours on the plan, billable; Nina's half hour on Fix login (she is invited); ten minutes of somebody
      // ClickUp no longer has; and Ana's timer still running on the blog draft.
      time_entries: [
        { id: 'te1', task: { id: 'cu1' }, user: lite(anaCu), billable: true, start: MS('2026-10-06T09:00:00Z'), end: MS('2026-10-06T11:00:00Z'), duration: '7200000', description: 'Planning' },
        { id: 'te2', task: { id: 'cu7' }, user: lite(nina), billable: false, start: MS('2026-10-07T09:00:00Z'), end: MS('2026-10-07T09:30:00Z'), duration: '1800000', description: '' },
        { id: 'te3', task: { id: 'cu1' }, user: { id: 950, username: 'Gone Person', email: `${TAG}-gone@clickup.invalid` }, billable: false, start: MS('2026-10-08T09:00:00Z'), end: MS('2026-10-08T09:10:00Z'), duration: '600000' },
        { id: 'te4', task: { id: 'cu4' }, user: lite(anaCu), billable: false, start: MS('2026-10-14T08:00:00Z'), end: null, duration: `-${MS('2026-10-14T08:00:00Z')}` },
      ],
      // Its Chat (`found-14-oct/clickup-chat-unimported`): a public channel of seven messages — more than the
      // stub's page of three — one with a thread of two replies, one by Nina (invited) mentioning Ana, one ClickUp's
      // own; a private channel with Ana in it; and a direct message, which stays behind.
      chat: [
        {
          id: 'ch1',
          name: `General ${TAG}`,
          type: 'CHANNEL',
          visibility: 'PUBLIC',
          messages: [
            // A thumbs up from Ana, and one from somebody ClickUp no longer has (`found-14-oct/clickup-import-rest-unimported`).
            { id: 'k1', content: `Kickoff at ten ${TAG}`, user_id: 901, date: MS('2026-10-08T09:00:00Z'), reactions: [{ reaction: 'thumbsup', user_id: 901 }, { reaction: 'thumbsup', user_id: 999 }], replies: [
              { id: 'k1r1', content: `On it ${TAG}`, user_id: 901, date: MS('2026-10-08T09:05:00Z') },
              { id: 'k1r2', content: `Booked the room ${TAG}`, user_id: 900, date: MS('2026-10-08T09:06:00Z') },
            ] },
            { id: 'k2', content: `Thanks [@${ANA_NAME}](#user_mention#901), see [@leads](#user_group_mention#g-1)`, user_id: 902, date: MS('2026-10-08T09:10:00Z') },
            { id: 'k3', content: 'Daily reminder', user_id: -1, date: MS('2026-10-08T09:20:00Z') },
            // Note 4 with a file, Note 6 nothing but an image, as ClickUp's Markdown links them to its file store.
            ...[4, 5, 6, 7].map((n) => ({
              id: `k${n}`,
              content: n === 6 ? '' : `Note ${n} ${TAG}`,
              user_id: 901,
              date: MS(`2026-10-08T10:0${n}:00Z`),
              ...(n === 4 ? { files: [{ id: 'cf1', name: 'notes.txt', content: 'chat file body' }] } : {}),
              ...(n === 6 ? { files: [{ id: 'cf2', name: 'shot.png', mimetype: 'image/png', content: 'PNG-BYTES' }] } : {}),
            })),
          ],
        },
        // Nina is in Leads too: her place waits for her.
        { id: 'ch2', name: `Leads ${TAG}`, type: 'CHANNEL', visibility: 'PRIVATE', members: [901, 900, 902], messages: [{ id: 'l1', content: `Lead from Acme ${TAG}`, user_id: 901, date: MS('2026-10-09T09:00:00Z') }] },
        // A channel of the Space, by the id ClickUp gives one: it goes into the Space it came into.
        { id: '4-s1-8', name: `Product talk ${TAG}`, type: 'CHANNEL', visibility: 'PUBLIC', messages: [{ id: 'pt1', content: `Space talk ${TAG}`, user_id: 901, date: MS('2026-10-09T11:00:00Z') }] },
        // The admin's direct messages: with Nina, invited, and with Ana, who has one with the admin here already.
        { id: 'dm1', name: 'Admin, Nina', type: 'DM', visibility: 'PRIVATE', members: [900, 902], messages: [{ id: 'd1', content: `Just us ${TAG}`, user_id: 902, date: MS('2026-10-09T10:00:00Z') }] },
        { id: 'dm2', name: 'Admin, Ana', type: 'DM', visibility: 'PRIVATE', members: [900, 901], messages: [{ id: 'd2', content: `Lunch at one ${TAG}`, user_id: 901, date: MS('2026-10-09T12:00:00Z') }] },
      ],
      goals: [{
        id: 'g1',
        name: `Q4 revenue ${TAG}`,
        description: 'Grow the pipeline',
        start_date: MS('2026-10-01T00:00:00Z'),
        due_date: MS('2026-12-31T00:00:00Z'),
        owners: [lite(anaCu)],
        percent_completed: 70,
        key_results: [
          { id: 'k1', name: 'Close deals', type: 'number', unit: 'deals', steps_start: 0, steps_end: 10, steps_current: 4, completed: false, owners: [lite(anaCu)] },
          { id: 'k2', name: 'Launch the site', type: 'boolean', completed: true, owners: [] },
        ],
      }],
      // A Goal in a Goal Folder.
      goal_folders: [{ id: 'gf1', name: `Growth ${TAG}`, goals: [{ id: 'g2', name: `Grow signups ${TAG}`, percent_completed: 25, owners: [lite(anaCu)], key_results: [] }] }],
    }],
  }
  await seedApp(STUB, { app: 'clickup', token: CU, name: 'Admin ClickUp', email: ADMIN.email, data }).catch((e) => console.log(`  (the stub did not take the ClickUp account: ${e.message})`))

  /** An import job, followed to its end on the one job route. */
  const job = async (jobId) => {
    let row = null
    await waitUntil(async () => {
      const res = await A(`/workspaces/${WS}/import/spreadsheet/jobs/${jobId}`)
      row = res.data
      return row?.status === 'completed' || row?.status === 'failed'
    }, { timeoutMs: 120_000, stepMs: 500 })
    return row
  }
  const grantOf = async () => (await sql`select access_token from import_grants where workspace_id = ${WS} and user_id = ${me.id} and provider = 'clickup'`)[0] ?? null
  const spaceNamed = async (name) => (await sql`select id, name from spaces where workspace_id = ${WS} and name = ${name} order by created_at desc limit 1`)[0] ?? null
  const taskNamed = async (title) => (await sql`select t.id, t.title, t.status, t.status_category, t.parent_task_id, t.priority, t.due_date, t.due_date_has_time, t.start_date, t.time_estimate, t.created_at, t.completed_at, t.description, t.list_id from tasks t join lists l on l.id = t.list_id join projects p on p.id = l.project_id join spaces s on s.id = p.space_id where s.workspace_id = ${WS} and t.title = ${title} order by t.created_at desc limit 1`)[0] ?? null
  const statusesOf = async (listId) => sql`select name, category from list_statuses where list_id = ${listId} order by position`
  const assigneesOf = async (taskId) => (await sql`select user_id from task_assignees where task_id = ${taskId}`).map((r) => r.user_id)
  const heldFor = async (email) => sql`select task_id from import_pending_assignees where workspace_id = ${WS} and email = ${email}`
  const invitationsOf = async (email) => sql`select id, token, status, workspace_memberships from invitations where email = ${email} order by created_at`

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

  // ══ 1. SIGNED IN BY ITS TOKEN ═════════════════════════════════════════════
  console.log('\n▶ The ClickUp tab signs in to ClickUp by its personal API token')
  await page.goto(`${B}/app/${WS}/import?tab=clickup`, { waitUntil: 'domcontentloaded' })
  const panel = page.locator('[data-testid="import-app-panel"][data-app="clickup"]')
  await panel.getByTestId('import-app-token').waitFor({ timeout: 20_000 }).catch(() => {})
  const csvToo = await page.getByTestId('import-tab-clickup').getAttribute('aria-selected').catch(() => null)
  await panel.getByTestId('import-app-token').fill(`not-${CU}`).catch(() => {})
  await panel.getByTestId('import-app-token-save').click().catch(() => {})
  await panel.getByTestId('import-app-token-error').waitFor({ timeout: 15_000 }).catch(() => {})
  const refusedSaid = (await readText(panel.getByTestId('import-app-token-error').filter({ visible: true }))) ?? ''
  const keptAfterRefusal = await grantOf()
  await panel.getByTestId('import-app-token').fill(CU).catch(() => {})
  await panel.getByTestId('import-app-token-save').click().catch(() => {})
  await panel.getByTestId('import-app-connected').waitFor({ timeout: 20_000 }).catch(() => {})
  const signedSaid = (await readText(panel.getByTestId('import-app-connected').filter({ visible: true }))) ?? ''
  const grant = await grantOf()
  chk(
    /ClickUp refused the grant/.test(refusedSaid) && !keptAfterRefusal && signedSaid.includes('Signed in to ClickUp as Admin ClickUp') && isSealed(grant?.access_token) && openKept(grant?.access_token, 'import_grants.access_token') === CU,
    'the ClickUp tab takes a personal API token: one ClickUp refuses is said in the form and nothing is kept; the right one signs in, kept sealed',
    JSON.stringify({ refusedSaid, keptAfterRefusal: !!keptAfterRefusal, signedSaid, kept: !!grant, tab: csvToo }),
  )

  // ══ 2. THE WORKSPACE'S SPACES AND ITS PEOPLE ══════════════════════════════
  console.log('\n▶ Its Spaces, and its people: matched by email, or offered an invitation as ClickUp has them')
  const spaceBox = panel.getByTestId('import-app-project-s1')
  await spaceBox.waitFor({ timeout: 20_000 }).catch(() => {})
  const spaceLabel = (await readText(panel.getByTestId('import-app-choose').filter({ visible: true }))) ?? ''
  await spaceBox.check().catch(() => {})
  await panel.getByTestId('import-app-people').waitFor({ timeout: 20_000 }).catch(() => {})
  const selectOf = (u) => panel.getByTestId(`import-app-person-select-clickup:${u.id}`)
  await waitUntil(() => selectOf(nina).isVisible().catch(() => false), { timeoutMs: 20_000 })
  // A select's options are drawn by the select itself, so they are read from the select that is shown.
  const optionsOf = async (u) => selectOf(u).filter({ visible: true }).evaluate((el) => Array.from(el.options, (o) => o.text)).catch(() => [])
  const valueOf = async (u) => selectOf(u).inputValue().catch(() => null)
  const people = {
    ana: { value: await valueOf(anaCu), options: await optionsOf(anaCu) },
    nina: await optionsOf(nina),
    gil: await optionsOf(gil),
    ola: await optionsOf(ola),
    pat: await optionsOf(pat),
  }
  chk(
    spaceLabel.includes(`Product ${TAG}`) && people.ana.value === ana.id && !people.ana.options.some((o) => /^Invite/.test(o)) &&
      people.nina.includes('Invite as member') && people.gil.includes('Invite as guest') && people.ola.includes('Invite as admin') && people.pat.includes('Invite as member'),
    'signed in, the tab lists the Workspace’s Spaces; a person who is a member here is matched by email, and each who is not is offered an invitation with ClickUp’s role for them — member, guest, admin',
    JSON.stringify({ spaceLabel: spaceLabel.slice(0, 120), people }),
  )

  // ══ 3. INVITED, IMPORTED, REPORTED ════════════════════════════════════════
  console.log('\n▶ Invite everyone who is not here, and import')
  await panel.getByTestId('import-app-invite-all').click().catch(() => {})
  const chosen = { nina: await valueOf(nina), gil: await valueOf(gil), ola: await valueOf(ola), pat: await valueOf(pat) }
  await panel.getByTestId('import-app-start').click().catch(() => {})
  await panel.getByTestId('import-app-report').waitFor({ timeout: 120_000 }).catch(() => {})
  const figure = async (id) => Number(await panel.getByTestId(id).getAttribute('data-value').catch(() => NaN))
  const report = {
    spaces: await figure('import-app-r-spaces'),
    folders: await figure('import-app-r-folders'),
    lists: await figure('import-app-r-lists'),
    tasks: await figure('import-app-r-tasks'),
    subtasks: await figure('import-app-r-subtasks'),
    comments: await figure('import-app-r-comments'),
    invited: await figure('import-app-r-invited'),
    waiting: await figure('import-app-r-waiting'),
  }
  chk(
    chosen.nina === 'invite:member' && chosen.gil === 'invite:guest' && chosen.ola === 'invite:workspace_admin' && chosen.pat === 'invite:member' &&
      report.spaces === 1 && report.folders === 1 && report.lists === 2 && report.tasks === 7 && report.subtasks === 2 && report.comments === 27 && report.invited === 4 && report.waiting === 5,
    '“Invite everyone who is not here” sets the four to their invitations; the run reports the Space, its Folder, two Lists, seven tasks (two subtasks), 27 comments, four people invited and five tasks held for them',
    JSON.stringify({ chosen, report }),
  )
  const offered = {
    docs: await panel.getByTestId('import-app-option-docs-spaces').count().catch(() => 0),
    time: await panel.getByTestId('import-app-option-time-yes').count().catch(() => 0),
    goals: await panel.getByTestId('import-app-option-goals-yes').count().catch(() => 0),
  }
  const more = {
    pages: await figure('import-app-r-pages'),
    time: await figure('import-app-r-time'),
    timeWaiting: await figure('import-app-r-time-waiting'),
    goals: await figure('import-app-r-goals'),
  }
  chk(
    more.pages === 4 && more.time === 1 && more.timeWaiting === 1 && more.goals === 2,
    'the run brings the rest of the Workspace and says so: four pages of Docs, one time entry made and one held for somebody invited, two Goals',
    JSON.stringify({ offered, more }),
  )

  // ══ 4. THE HIERARCHY ══════════════════════════════════════════════════════
  console.log('\n▶ The Space, its Folder and Lists, each List’s statuses')
  const space = await spaceNamed(`Product ${TAG}`)
  const folder = space ? (await sql`select id from projects where space_id = ${space.id} and name = ${`Roadmap ${TAG}`}`)[0] : null
  const q4 = folder ? (await sql`select id, description from lists where project_id = ${folder.id} and name = ${`Q4 ${TAG}`}`)[0] : null
  const container = space ? (await sql`select id from projects where space_id = ${space.id} and is_default_container`)[0] : null
  const inbox = container ? (await sql`select id from lists where project_id = ${container.id} and name = ${`Inbox ${TAG}`}`)[0] : null
  const q4Statuses = q4 ? (await statusesOf(q4.id)).map((s) => `${s.name}:${s.category}`) : []
  const inboxStatuses = inbox ? (await statusesOf(inbox.id)).map((s) => `${s.name}:${s.category}`) : []
  chk(
    !!q4 && !!inbox && q4.description === 'This quarter' &&
      q4Statuses.join('|') === 'to do:open|in progress:in_progress|review:in_progress|complete:closed' &&
      inboxStatuses.join('|') === 'open:open|blocked:in_progress|shipped:closed|Closed:closed',
    'a ClickUp Space comes in as a Space: its Folder a Folder holding its List, its List in no Folder the Space’s own; each List with its statuses in ClickUp’s order — its Space’s, or its own where it overrides them — open first and closed last',
    JSON.stringify({ space: !!space, folder: !!folder, q4: q4?.description ?? null, inbox: !!inbox, q4Statuses, inboxStatuses }),
  )

  // ══ 5. A TASK, WHOLE ══════════════════════════════════════════════════════
  console.log('\n▶ Each task as ClickUp keeps it')
  const plan = await taskNamed(`Launch plan ${TAG}`)
  const copy = await taskNamed(`Launch copy ${TAG}`)
  const headline = await taskNamed(`Launch copy headline ${TAG}`)
  const kit = await taskNamed(`Press kit ${TAG}`)
  const oldBug = await taskNamed(`Old bug ${TAG}`)
  const tags = plan ? (await sql`select l.name from task_label_assignments a join labels l on l.id = a.label_id where a.task_id = ${plan.id}`).map((r) => r.name) : []
  const items = plan ? (await sql`select i.content, i.is_done from task_checklist_items i join task_checklists c on c.id = i.checklist_id where c.task_id = ${plan.id} order by i.position`).map((r) => `${r.content}:${r.is_done}`) : []
  chk(
    !!plan && plan.status_category === 'in_progress' && plan.priority === 'urgent' && plan.due_date_has_time === true &&
      plan.due_date?.toISOString() === '2026-10-20T15:30:00.000Z' && plan.start_date?.toISOString() === '2026-10-05T00:00:00.000Z' && plan.time_estimate === 7200 &&
      plan.created_at?.toISOString() === '2026-09-20T10:00:00.000Z' && /Ship \*\*it\*\* on time/.test(plan.description ?? '') &&
      tags.join() === `launch-${stamp}` && items.join('|') === 'Brief:true|Assets:false|Logo:false' &&
      copy?.parent_task_id === plan.id && headline?.parent_task_id === plan.id && kit?.status_category === 'closed' && oldBug?.status_category === 'closed',
    'a task keeps its status, priority, start, due time, estimate, the moment it was made, its markdown description, tags and checklist (a nested item under its own); its subtask is its subtask, and the subtask’s own one level up; a closed task and a done one are closed',
    JSON.stringify({ plan: plan && { cat: plan.status_category, priority: plan.priority, due: plan.due_date, time: plan.due_date_has_time, start: plan.start_date, est: plan.time_estimate, made: plan.created_at, desc: plan.description?.slice(0, 40) }, tags, items, copy: copy?.parent_task_id === plan?.id, headline: headline?.parent_task_id === plan?.id, kit: kit?.status_category, oldBug: oldBug?.status_category }),
  )

  // ══ 6. ITS CUSTOM FIELDS ══════════════════════════════════════════════════
  console.log('\n▶ Its Custom Fields')
  const fields = plan
    ? Object.fromEntries((await sql`select d.name, d.type, v.value from custom_field_values v join custom_field_definitions d on d.id = v.field_id where v.task_id = ${plan.id}`).map((r) => [r.name, { type: r.type, v: r.value?.v }]))
    : {}
  chk(
    fields.Budget?.v === 1200 && fields.Stage?.type === 'dropdown' && fields.Stage?.v === 'Build' && fields.Spec?.v === 'https://example.com/spec' &&
      fields['Signed off']?.v === true && String(fields.Kickoff?.v ?? '').startsWith('2026-10-02') && fields.Areas?.v === 'Web, Mobile' &&
      fields.Owner?.type === 'text' && fields.Owner?.v === ANA_NAME && !fields.Empty,
    'its Custom Fields come in: a currency as a number, a dropdown by its option (ClickUp names it by its place), a link, a checkbox, a date, Labels as their names, a People field as its people’s names; an empty one does not',
    JSON.stringify(fields),
  )

  // ══ 7. ITS COMMENTS, FILES AND LINKS ══════════════════════════════════════
  console.log('\n▶ Its comments, every page; its file; its links')
  const planComments = plan ? await sql`select author_id, body from task_comments where task_id = ${plan.id} order by created_at` : []
  const planFiles = plan ? await sql`select id, file_name, size_bytes from task_attachments where task_id = ${plan.id} order by file_name` : []
  const planTxt = planFiles.filter((f) => f.file_name === 'plan.txt')
  const related = plan && kit ? (await sql`select 1 from task_dependencies where (task_id = ${plan.id} and related_task_id = ${kit.id}) or (task_id = ${kit.id} and related_task_id = ${plan.id})`).length : 0
  chk(
    planComments.length === 27 && planComments[0].author_id === ana.id && planComments[0].body === `Note 1 ${TAG}` &&
      planComments[1].author_id === me.id && planComments[1].body.startsWith(`**Nina New ${stamp}** _(ClickUp comment`) && planComments[26].body === `Note 27 ${TAG}` &&
      planTxt.length === 1 && Number(planTxt[0].size_bytes) === 'the plan, in a file'.length && related >= 1,
    'all 27 comments come in, oldest first — Ana’s under Ana, Nina’s (not a member yet) under the importer with her name at the head; its file with its bytes; its link and its dependency as related tasks',
    JSON.stringify({ comments: planComments.length, first: planComments[0]?.author_id === ana.id, second: planComments[1]?.body?.slice(0, 50), last: planComments[26]?.body, files: planFiles, related }),
  )
  // A Files field (`found-14-oct/clickup-import-rest-unimported`): a Files field here, holding its file, which is the task's file too.
  const contract = planFiles.find((f) => f.file_name === 'contract.txt')
  const filesField = fields.Contract
  chk(
    filesField?.type === 'files' && !!contract && Number(contract.size_bytes) === 'signed contract'.length && JSON.stringify(filesField?.v) === JSON.stringify([contract?.id]),
    'a Files field comes in as a Files field, holding its file — which is the task’s own file too, with its bytes',
    JSON.stringify({ field: filesField ?? null, files: planFiles.map((f) => [f.file_name, Number(f.size_bytes)]) }),
  )

  // ══ 8. EVERY PAGE, AS CLICKUP PAGES ═══════════════════════════════════════
  console.log('\n▶ What was asked of ClickUp')
  const asked = (await appAsked(STUB, 'clickup', CU)) ?? []
  const q4Pages = asked.filter((a) => a.startsWith('GET /clickup/api/v2/list/l1/task?'))
  chk(
    q4Pages.length === 3 && q4Pages.every((a) => a.includes('include_closed=true') && a.includes('subtasks=true')) &&
      asked.some((a) => a.startsWith('GET /clickup/api/v2/list/l2')) &&
      asked.some((a) => a.startsWith('GET /clickup/api/v2/task/cu1/comment?') && a.includes('start_id=c3')) && asked.some((a) => a === 'GET /clickup/api/v2/task/cu1'),
    'every page of a List’s tasks is read — closed tasks and subtasks asked for, as ClickUp leaves them out unasked — and the comments’ second page from the oldest of the first; a List’s own statuses and a task’s files from their own pages',
    JSON.stringify({ q4Pages, comments: asked.filter((a) => a.includes('/comment')), lists: asked.filter((a) => /\/list\/l[12]($|\?)/.test(a.split(' ')[1] ?? '')) }),
  )

  // ══ 9. THE INVITATIONS ════════════════════════════════════════════════════
  console.log('\n▶ The people invited, and their tasks held for them')
  const inv = { nina: await invitationsOf(nina.email), gil: await invitationsOf(gil.email), ola: await invitationsOf(ola.email), pat: await invitationsOf(pat.email) }
  for (const rows of Object.values(inv)) for (const r of rows) madeRow('invitations', r.id)
  const roleIn = (rows) => rows.map((r) => (r.workspace_memberships ?? []).find((m) => m.workspaceId === WS)?.role ?? null)
  const ninaMail = await waitUntil(async () => (await mailTo(MAIL, nina.email).catch(() => [])).length >= 1, { timeoutMs: 20_000 })
  const ninaMails = await mailTo(MAIL, nina.email).catch(() => [])
  const held = { nina: (await heldFor(nina.email)).length, gil: (await heldFor(gil.email)).length, ola: (await heldFor(ola.email)).length, pat: (await heldFor(pat.email)).length }
  chk(
    roleIn(inv.nina).join() === 'member' && roleIn(inv.gil).join() === 'guest' && roleIn(inv.ola).join() === 'workspace_admin' && roleIn(inv.pat).join() === 'member' &&
      // The invitation is sent as HTML alone: its link carries the token.
      ninaMail && ninaMails.length === 1 && `${ninaMails[0]?.text ?? ''}${ninaMails[0]?.html ?? ''}`.includes(inv.nina[0]?.token ?? 'no-token') &&
      held.nina === 2 && held.gil === 1 && held.ola === 1 && held.pat === 1 && plan && (await assigneesOf(plan.id)).join() === ana.id,
    'each of the four is invited into this workspace once, with ClickUp’s role for them, and the invitation is emailed; their five tasks wait for them, while Ana, a member, is on hers already',
    JSON.stringify({ roles: { nina: roleIn(inv.nina), gil: roleIn(inv.gil), ola: roleIn(inv.ola), pat: roleIn(inv.pat) }, ninaMails: ninaMails.length, tokenMailed: `${ninaMails[0]?.text ?? ''}${ninaMails[0]?.html ?? ''}`.includes(inv.nina[0]?.token ?? 'no-token'), held, planAssignees: plan ? (await assigneesOf(plan.id)).length : null }),
  )

  // ══ 9b. ITS DOCS, ITS TIME, ITS GOALS ═════════════════════════════════════
  console.log('\n▶ The Space’s Docs, the time tracked on its tasks, the Workspace’s Goals')
  const docRows = space ? await sql`select id, title, parent_doc_id, plaintext from docs where workspace_id = ${WS} and space_id = ${space.id} order by created_at, position` : []
  const brief = docRows.find((d) => d.title === `Product brief ${TAG}`)
  const under = brief ? docRows.filter((d) => d.parent_doc_id === brief.id).map((d) => d.title).sort() : []
  const risks = docRows.find((d) => d.title === `Risks ${TAG}`)
  const notes = docRows.find((d) => d.title === `Inbox notes ${TAG}`)
  const handbook = (await sql`select id from docs where workspace_id = ${WS} and title = ${`Handbook ${TAG}`}`).length
  chk(
    !!brief && /We ship/.test(brief.plaintext ?? '') && under.join('|') === [`Risks ${TAG}`, `Timeline ${TAG}`].sort().join('|') && !!risks && /Late\s+assets/.test(risks.plaintext ?? '') &&
      !!notes && /Triage daily/.test(notes.plaintext ?? '') && handbook === 0,
    'the Space’s Docs come in it — one in the Space, one in its List — the first page a Doc’s own body and the others under it, as ClickUp nests them; the Workspace’s own Doc stays behind unless asked for',
    JSON.stringify({ docs: docRows.map((d) => [d.title, !!d.parent_doc_id]), under, briefText: brief?.plaintext?.slice(0, 40), risksText: risks?.plaintext ?? null, notesText: notes?.plaintext ?? null, handbook }),
  )

  const planTime = plan ? await sql`select user_id, duration_sec, is_billable, description, import_id from time_entries where task_id = ${plan.id}` : []
  const fixTask = await taskNamed(`Fix login ${TAG}`)
  const draft = await taskNamed(`Draft blog ${TAG}`)
  const heldTime = await sql`select task_id, duration_sec from import_pending_time_entries where workspace_id = ${WS} and email = ${nina.email}`
  const draftTime = draft ? (await sql`select 1 from time_entries where task_id = ${draft.id}`).length : -1
  chk(
    planTime.length === 1 && planTime[0].user_id === ana.id && planTime[0].duration_sec === 7200 && planTime[0].is_billable === true && planTime[0].description === 'Planning' && !!planTime[0].import_id &&
      heldTime.length === 1 && heldTime[0].task_id === fixTask?.id && heldTime[0].duration_sec === 1800 && draftTime === 0,
    'the time tracked comes in under whoever tracked it: Ana’s two billable hours are hers; Nina’s half hour waits for her; somebody ClickUp no longer has, and a timer still running, bring nothing',
    JSON.stringify({ planTime, held: heldTime, draftTime }),
  )

  const [goal] = await sql`select id, owner_id, current_value, target_value, status, start_date, due_date, description from goals where workspace_id = ${WS} and title = ${`Q4 revenue ${TAG}`}`
  const krs = goal ? await sql`select title, unit, target_value, current_value, status, owner_id from goal_key_results where goal_id = ${goal.id} order by position` : []
  chk(
    !!goal && goal.owner_id === ana.id && Number(goal.current_value) === 70 && Number(goal.target_value) === 100 && goal.status === 'on_track' && goal.description === 'Grow the pipeline' &&
      goal.due_date?.toISOString() === '2026-12-31T00:00:00.000Z' &&
      krs.map((k) => `${k.title}|${k.unit ?? '-'}|${Number(k.current_value)}/${Number(k.target_value)}|${k.status}`).join(' ; ') === 'Close deals|deals|4/10|on_track ; Launch the site|-|1/1|completed' && krs[0].owner_id === ana.id,
    'the Workspace’s Goal comes in with its Targets: Ana owns it, 70% along as its Targets are, due when it was; four deals of ten, and the site launched',
    JSON.stringify({ goal, krs }),
  )

  // ══ 9c. ITS CHAT ══════════════════════════════════════════════════════════
  console.log('\n▶ Its Chat: channels, their messages, threads and mentions')
  const chatChannelsHere = await sql`select id, name, is_private from chat_channels where workspace_id = ${WS}`
  const general = chatChannelsHere.find((c) => c.name === `general-${TAG}`)
  const leads = chatChannelsHere.find((c) => c.name === `leads-${TAG}`)
  const generalMessages = general ? await sql`select id, author_id, imported_author, parent_message_id, body, mentions, created_at from chat_messages where channel_id = ${general.id} order by created_at` : []
  const byText = (re) => generalMessages.find((m) => re.test(m.body))
  const kickoff = byText(/^Kickoff at ten/)
  const thanks = byText(/^Thanks/)
  const reminder = byText(/^Daily reminder/)
  const replies = kickoff ? generalMessages.filter((m) => m.parent_message_id === kickoff.id).map((m) => `${m.body.split(' ')[0]}:${m.author_id === ana.id ? 'ana' : m.author_id === me.id ? 'admin' : m.author_id}`) : []
  const leadsMembers = leads ? (await sql`select user_id from chat_channel_members where channel_id = ${leads.id}`).map((r) => r.user_id) : []
  const chatFigure = await figure('import-app-r-chat')
  chk(
    !!general && general.is_private === false && generalMessages.length === 9 && kickoff?.author_id === ana.id && kickoff?.imported_author === null &&
      kickoff?.created_at?.toISOString() === '2026-10-08T09:00:00.000Z' && replies.sort().join() === 'Booked:admin,On:ana' &&
      thanks?.author_id === me.id && thanks?.imported_author === `Nina New ${stamp}` && thanks?.body === `Thanks <@${ana.id}>, see @leads` &&
      JSON.stringify(thanks?.mentions) === JSON.stringify([{ userId: ana.id }]) && reminder?.imported_author === 'ClickUp' &&
      !!leads && leads.is_private === true && leadsMembers.includes(ana.id) && leadsMembers.includes(me.id) &&
      chatFigure === 13,
    'its Chat comes over: a public channel public and a private one private with its people, every page of messages each at its moment, a thread’s replies in its thread, Nina’s message (not a member yet) drawn under her name and its mention of Ana a mention of her, ClickUp’s own post under ClickUp; the report says 13 messages',
    JSON.stringify({ channels: chatChannelsHere.map((c) => [c.name, c.is_private]), messages: generalMessages.length, kickoff: kickoff && { author: kickoff.author_id === ana.id, at: kickoff.created_at }, replies, thanks: thanks && { author: thanks.author_id === me.id, as: thanks.imported_author, body: thanks.body, mentions: thanks.mentions }, reminder: reminder?.imported_author, leadsMembers: leadsMembers.length, chatFigure }),
  )

  // ══ 9d. THE REST THE API GIVES (`found-14-oct/clickup-import-rest-unimported`) ══
  console.log('\n▶ Reactions, files, a Space’s channel, direct messages; a List’s views; Goal Folders')
  const k1Reactions = kickoff ? await sql`select user_id, emoji from chat_message_reactions where message_id = ${kickoff.id}` : []
  const note4 = byText(/^Note 4/)
  const note4Files = note4 ? await sql`select file_name, size_bytes, content_type from chat_message_attachments where message_id = ${note4.id}` : []
  const shot = generalMessages.find((m) => m.created_at?.toISOString() === '2026-10-08T10:06:00.000Z')
  const shotFiles = shot ? await sql`select file_name, size_bytes, content_type from chat_message_attachments where message_id = ${shot.id}` : []
  const figures = { reactions: await figure('import-app-r-reactions'), files: await figure('import-app-r-chat-files'), dms: await figure('import-app-r-dms'), waiting: await figure('import-app-r-chat-waiting'), views: await figure('import-app-r-views'), folders: await figure('import-app-r-goal-folders') }
  chk(
    k1Reactions.length === 1 && k1Reactions[0].user_id === ana.id && k1Reactions[0].emoji === '👍' &&
      note4Files.length === 1 && note4Files[0].file_name === 'notes.txt' && Number(note4Files[0].size_bytes) === 'chat file body'.length && note4?.body === `Note 4 ${TAG}` &&
      shotFiles.length === 1 && shotFiles[0].file_name === 'shot.png' && shotFiles[0].content_type === 'image/png' && shot?.body === '' &&
      figures.reactions === 1 && figures.files === 2,
    'a message’s reactions come in as the members’ reactions here (a 👍 from Ana; one from somebody ClickUp no longer has, not); a file posted in Chat is the message’s file here, with its bytes, its link gone from the words, and a message that was only an image is that image',
    JSON.stringify({ k1Reactions, note4: note4 && { body: note4.body, files: note4Files }, shot: shot && { body: shot.body, files: shotFiles }, figures }),
  )
  const talk = (await sql`select id, space_id from chat_channels where workspace_id = ${WS} and name = ${`product-talk-${TAG}`}`)[0] ?? null
  chk(
    !!talk && !!space && talk.space_id === space.id,
    'a channel of a ClickUp Space comes into the Space the import brought it to',
    JSON.stringify({ talk, space: space?.id ?? null }),
  )
  const dmsHere = await sql`select c.id, array_agg(m.user_id::text order by m.user_id) as members from chat_channels c left join chat_channel_members m on m.channel_id = c.id where c.workspace_id = ${WS} and c.is_dm group by c.id`
  const withAna = dmsHere.filter((d) => d.members.includes(ana.id) && d.members.includes(me.id) && d.members.length === 2)
  const lunch = (await sql`select channel_id, author_id from chat_messages where body = ${`Lunch at one ${TAG}`}`)[0] ?? null
  const justUs = (await sql`select m.channel_id, m.imported_author, c.is_dm from chat_messages m join chat_channels c on c.id = m.channel_id where m.body = ${`Just us ${TAG}`}`)[0] ?? null
  const ninaDmMembers = justUs ? (await sql`select user_id from chat_channel_members where channel_id = ${justUs.channel_id}`).map((r) => r.user_id) : []
  const ninaHeld = (await sql`select channel_id from import_pending_channel_members where workspace_id = ${WS} and email = ${nina.email}`).map((r) => r.channel_id)
  const leadsId = leads?.id ?? null
  chk(
    withAna.length === 1 && withAna[0].id === anaDm.data.id && lunch?.channel_id === anaDm.data.id && lunch?.author_id === ana.id &&
      justUs?.is_dm === true && ninaDmMembers.join() === me.id && ninaHeld.includes(justUs?.channel_id) && ninaHeld.includes(leadsId) && figures.dms === 2,
    'the admin’s direct messages come over between the same people: with Ana, its history joins the one they have here; with Nina, invited, it is the admin’s for now, and Nina’s place in it — and in Leads — waits for her',
    JSON.stringify({ withAna: withAna.length, sameDm: withAna[0]?.id === anaDm.data.id, lunch: lunch && { here: lunch.channel_id === anaDm.data.id, ana: lunch.author_id === ana.id }, justUs: justUs && { dm: justUs.is_dm, members: ninaDmMembers.length }, ninaHeld: ninaHeld.length, dmsFigure: figures.dms }),
  )
  const q4Views = q4 ? await sql`select name, type, is_default, is_pinned, visibility, config, created_by_id from task_views where list_id = ${q4.id} order by position` : []
  chk(
    q4Views.length === 2 && q4Views[0].name === `Sprint board ${TAG}` && q4Views[0].type === 'board' && q4Views[0].is_default === true && q4Views[0].is_pinned === true &&
      q4Views[0].config?.groupBy === 'priority' && q4Views[0].config?.sort?.field === 'due' && q4Views[0].config?.sort?.dir === 'desc' &&
      q4Views[1].name === `Mine ${TAG}` && q4Views[1].type === 'list' && q4Views[1].visibility === 'private' && q4Views[1].created_by_id === ana.id && figures.views === 2,
    'a List’s views come in as its views here: the pinned board grouped by priority, newest due first, its default; Ana’s private list hers alone; a Form view, which no List here has, not made',
    JSON.stringify({ views: q4Views.map((v) => ({ name: v.name, type: v.type, def: v.is_default, pinned: v.is_pinned, vis: v.visibility, config: v.config, ana: v.created_by_id === ana.id })), figure: figures.views }),
  )
  const growth = (await sql`select id from goal_folders where workspace_id = ${WS} and name = ${`Growth ${TAG}`}`)[0] ?? null
  const signups = (await sql`select folder_id, owner_id, current_value from goals where workspace_id = ${WS} and title = ${`Grow signups ${TAG}`}`)[0] ?? null
  const revenueFolder = (await sql`select folder_id from goals where workspace_id = ${WS} and title = ${`Q4 revenue ${TAG}`}`)[0]?.folder_id
  await page.goto(`${B}/app/${WS}/goals`, { waitUntil: 'domcontentloaded' })
  const folderBox = page.locator(`[data-testid="goal-folder"][data-folder-id="${growth?.id ?? 'none'}"]`)
  const drawn = await waitUntil(async () => /Grow signups/.test((await folderBox.filter({ visible: true }).innerText({ timeout: 2000 }).catch(() => '')) ?? ''), { timeoutMs: 15_000 })
  const looseText = await page.getByTestId('goal-folder-loose').filter({ visible: true }).innerText({ timeout: 8000 }).catch(() => '')
  chk(
    !!growth && signups?.folder_id === growth.id && signups?.owner_id === ana.id && Number(signups?.current_value) === 25 && revenueFolder === null &&
      figures.folders === 1 && drawn && /Q4 revenue/.test(looseText) && !/Grow signups/.test(looseText),
    'a Goal in a Goal Folder comes in in a Goal Folder of its name, and the Goals page draws the folder with its goal in it; a Goal in no folder is in none',
    JSON.stringify({ folder: !!growth, signups: signups && { inFolder: signups.folder_id === growth?.id, ana: signups.owner_id === ana.id, at: Number(signups.current_value) }, revenueFolder, figure: figures.folders, drawn, loose: looseText.slice(0, 80) }),
  )

  // ══ 10. JOINING TAKES THEIR TASKS ═════════════════════════════════════════
  console.log('\n▶ Accepting the invitation: their tasks are theirs')
  const claim = async (who, token) => {
    madeAccount({ email: who.email })
    return fetch(`${API}/invitations/claim`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, password: PASSWORD, fullName: who.username }) })
  }
  const ninaClaim = await claim(nina, inv.nina[0]?.token ?? 'none')
  const [ninaUser] = await sql`select id from users where email = ${nina.email}`
  const fix = await taskNamed(`Fix login ${TAG}`)
  const ninaOn = { plan: plan && ninaUser ? (await assigneesOf(plan.id)).includes(ninaUser.id) : false, fix: fix && ninaUser ? (await assigneesOf(fix.id)).includes(ninaUser.id) : false }
  const olaClaim = await claim(ola, inv.ola[0]?.token ?? 'none')
  const [olaUser] = await sql`select id from users where email = ${ola.email}`
  const olaRole = olaUser ? (await sql`select role from workspace_members where workspace_id = ${WS} and user_id = ${olaUser.id}`)[0]?.role : null
  const olaOn = kit && olaUser ? (await assigneesOf(kit.id)).includes(olaUser.id) : false
  chk(
    ninaClaim.ok && ninaOn.plan && ninaOn.fix && (await heldFor(nina.email)).length === 0 &&
      olaClaim.ok && olaRole === 'workspace_admin' && olaOn && (await heldFor(ola.email)).length === 0,
    'Nina accepts and is on her two tasks; Ola joins as an admin, as ClickUp had her, and is on hers; nothing is held for either any longer',
    JSON.stringify({ nina: ninaClaim.status, ninaOn, held: (await heldFor(nina.email)).length, ola: olaClaim.status, olaRole, olaOn }),
  )
  const ninaTime = fix && ninaUser ? await sql`select duration_sec from time_entries where task_id = ${fix.id} and user_id = ${ninaUser.id}` : []
  const ninaTimeHeld = (await sql`select 1 from import_pending_time_entries where workspace_id = ${WS} and email = ${nina.email}`).length
  chk(
    ninaTime.length === 1 && ninaTime[0].duration_sec === 1800 && ninaTimeHeld === 0,
    'and the half hour Nina tracked on Fix login is hers now that she has joined, held no longer',
    JSON.stringify({ ninaTime, ninaTimeHeld }),
  )
  const ninaIn = ninaUser ? (await sql`select channel_id from chat_channel_members where user_id = ${ninaUser.id}`).map((r) => r.channel_id) : []
  const ninaStillHeld = (await sql`select 1 from import_pending_channel_members where workspace_id = ${WS} and email = ${nina.email}`).length
  chk(
    !!justUs && ninaIn.includes(justUs.channel_id) && !!leadsId && ninaIn.includes(leadsId) && ninaStillHeld === 0,
    'and she is in her direct message with the admin and in Leads, as she was in ClickUp, her places held no longer',
    JSON.stringify({ dm: !!justUs && ninaIn.includes(justUs.channel_id), leads: !!leadsId && ninaIn.includes(leadsId), held: ninaStillHeld }),
  )

  // ══ 11. A GUEST TAKES ONLY WHAT IS SHARED WITH THEM ═══════════════════════
  console.log('\n▶ A guest joining is put on a task only where the assignee rule would put them')
  const gilClaim = await claim(gil, inv.gil[0]?.token ?? 'none')
  const [gilUser] = await sql`select id from users where email = ${gil.email}`
  const gilRole = gilUser ? (await sql`select role from workspace_members where workspace_id = ${WS} and user_id = ${gilUser.id}`)[0]?.role : null
  const gilOn = copy && gilUser ? (await assigneesOf(copy.id)).includes(gilUser.id) : true
  chk(
    gilClaim.ok && gilRole === 'guest' && !gilOn && (await heldFor(gil.email)).length === 0,
    'Gil joins as a guest and is not put on the task held for him — nothing is shared with him, so the assignee route would refuse it — and it is held no longer',
    JSON.stringify({ claim: gilClaim.status, gilRole, gilOn, held: (await heldFor(gil.email)).length }),
  )

  // ══ 12. INVITED ONCE, HOWEVER OFTEN IMPORTED ══════════════════════════════
  console.log('\n▶ A second import does not invite Pat twice')
  const again = await A(`/workspaces/${WS}/import/apps/clickup`, { method: 'POST', body: { source: 't1', projectIds: ['s1'], spaceId: SPACE_ID ?? null, people: {}, invite: { [`clickup:${pat.id}`]: 'member' } } })
  const againJob = again.data?.jobId ? await job(again.data.jobId) : null
  const patInvites = await invitationsOf(pat.email)
  const patMails = await mailTo(MAIL, pat.email).catch(() => [])
  chk(
    again.status === 201 && againJob?.status === 'completed' && patInvites.length === 1 && patMails.length === 1 && (await heldFor(pat.email)).length === 2,
    'importing the Space again while Pat’s invitation is open sends no second one: one invitation, one email, and the new run’s task held for him beside the first',
    JSON.stringify({ start: said(again), job: againJob?.status, error: againJob?.error, invites: patInvites.length, mails: patMails.length, held: (await heldFor(pat.email)).length }),
  )

  // ══ 13. WHOM AN IMPORT MAY NOT INVITE ═════════════════════════════════════
  console.log('\n▶ Invitations refused')
  const member = await A(`/workspaces/${WS}/import/apps/clickup`, { method: 'POST', body: { source: 't1', projectIds: ['s1'], spaceId: SPACE_ID ?? null, invite: { [`clickup:${anaCu.id}`]: 'member' } } })
  const owner = await A(`/workspaces/${WS}/import/apps/clickup`, { method: 'POST', body: { source: 't1', projectIds: ['s1'], spaceId: SPACE_ID ?? null, invite: { [`clickup:${pat.id}`]: 'owner' } } })
  const stranger = await A(`/workspaces/${WS}/import/apps/clickup`, { method: 'POST', body: { source: 't1', projectIds: ['s1'], spaceId: SPACE_ID ?? null, invite: { 'clickup:999': 'member' } } })
  const jobsAfter = (await sql`select count(*)::int as n from clickup_import_jobs where workspace_id = ${WS} and source = 'clickup'`)[0]?.n
  chk(
    member.status === 400 && /who is not a member here yet/.test(JSON.stringify(member.message ?? '')) && owner.status === 400 && stranger.status === 400 && jobsAfter === 2,
    'an import invites nobody who is a member here already, nobody of ClickUp it does not know, and nobody as anything but a workspace role — each refused before anything runs',
    JSON.stringify({ member: said(member), owner: said(owner), stranger: said(stranger), jobs: jobsAfter }),
  )

  // ══ 14. THE APPS TAB IS AS IT WAS ═════════════════════════════════════════
  console.log('\n▶ The Apps tab still lists its six tools')
  const catalogue = await A(`/workspaces/${WS}/import/apps`)
  chk(
    catalogue.status === 200 && catalogue.data?.length === 6 && !catalogue.data.some((a) => a.key === 'clickup'),
    'ClickUp is on its own tab: the Apps tab’s tools are still its six',
    JSON.stringify({ status: catalogue.status, apps: catalogue.data?.map((a) => a.key) }),
  )

  // ══ 15. THE WORKSPACE'S OWN DOCS, WHEN ASKED; WHAT IS TURNED OFF, NOT READ ══
  console.log('\n▶ Asked for the Workspace’s own Docs, with time and Goals turned off')
  const goalsBefore = (await sql`select count(*)::int as n from goals where workspace_id = ${WS}`)[0]?.n
  const askedBefore = ((await appAsked(STUB, 'clickup', CU)) ?? []).length
  const channelsBefore = (await sql`select count(*)::int as n from chat_channels where workspace_id = ${WS}`)[0]?.n
  const wide = await A(`/workspaces/${WS}/import/apps/clickup`, { method: 'POST', body: { source: 't1', projectIds: ['s1'], spaceId: SPACE_ID ?? null, people: {}, options: { docs: 'workspace', time: 'no', goals: 'no', chat: 'no' } } })
  const wideJob = wide.data?.jobId ? await job(wide.data.jobId) : null
  const [book] = await sql`select space_id, plaintext from docs where workspace_id = ${WS} and title = ${`Handbook ${TAG}`}`
  const wideTime = wide.data?.jobId ? (await sql`select count(*)::int as n from time_entries where import_id = ${wide.data.jobId}`)[0]?.n : -1
  const goalsAfter = (await sql`select count(*)::int as n from goals where workspace_id = ${WS}`)[0]?.n
  const askedNow = ((await appAsked(STUB, 'clickup', CU)) ?? []).slice(askedBefore)
  chk(
    wide.status === 201 && wideJob?.status === 'completed' && !!book && book.space_id === null && /Hello team/.test(book.plaintext ?? '') && wideTime === 0 && goalsAfter === goalsBefore &&
      !askedNow.some((a) => a.includes('/time_entries') || a.includes('/goal')),
    'asked for them, the Workspace’s own Docs come in beside the workspace’s other Docs; time and Goals turned off are neither read nor made',
    JSON.stringify({ start: said(wide), job: wideJob?.status, error: wideJob?.error, book: book ? { space: book.space_id, text: book.plaintext?.slice(0, 20) } : null, wideTime, goals: [goalsBefore, goalsAfter], asked: askedNow.filter((a) => /time_entries|goal/.test(a)) }),
  )
  const channelsAfter = (await sql`select count(*)::int as n from chat_channels where workspace_id = ${WS}`)[0]?.n
  chk(
    wideJob?.status === 'completed' && channelsAfter === channelsBefore && !askedNow.some((a) => a.includes('/chat/')),
    'and Chat turned off is neither read nor made',
    JSON.stringify({ job: wideJob?.status, channels: [channelsBefore, channelsAfter], asked: askedNow.filter((a) => a.includes('/chat/')) }),
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
