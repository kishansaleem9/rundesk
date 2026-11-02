/**
 * CLICKUP'S CURRENT EXPORT, IMPORTED AS IT IS WRITTEN (`found-02-nov/clickup-current-export-unread`).
 *
 * ClickUp's export from Settings › Imports / Exports › Export writes its 34
 * columns otherwise than its classic one: an empty cell as `null`, `[]` or
 * `{}`; a description's line breaks as the two characters `\n`, or as Quill's
 * JSON; checklists as JSON; Folder Name/Path as a JSON list; Time Spent, in
 * the CSV, as ` "900000"`; and where a task lives as its Home Location,
 * `Space > Folder > List`. The owner's own export (59,318 rows, 2 November)
 * met an importer that read every one of those literally.
 *
 * This suite writes that shape — every value made up — and takes it through
 * Settings › Imports / Exports as the owner does: the page reads the file and
 * maps it with no clicks, the grid shows it, Import uploads it and the runner
 * writes it. Then POSTGRES is read: each ClickUp Folder a project in the
 * Space (two of one name told apart by their Space), each List in its
 * Folder's project, a task shared to a second List imported once, in its home;
 * descriptions as text; priority, dates to the millisecond, estimate and
 * tracked time; every checklist; subtasks by Parent ID with the second level
 * folded; the one 600-character name shortened, and said so. A second import
 * on the Free plan, whose three projects are spent, must put its Folder's List
 * straight in the Space and say why. Undo must take back the projects and
 * Lists the import made, and leave the Space's own container. A file one row
 * past 100,000 is refused by the page in the limit's words.
 *
 * Its own workspace, deleted at the end. `--rows N` adds made-up rows across
 * 46 Folders until the file has N, and prints how long each stage took and
 * the API's memory — how the 60,000-row run was measured.
 *
 *   node test/e2e/clickup-current-export.mjs --api 3011 --dist apps/web/dist [--rows 60000]
 */
import path from 'node:path'
import { readdirSync, readFileSync } from 'node:fs'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 12

const REPO = path.resolve(import.meta.dirname, '../..')
const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}
const TAG = `cce${Date.now()}`

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}
const info = (line) => console.log(`\x1b[2m  ${line}\x1b[0m`)
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? res.message ?? null)}`

// ── the export, as ClickUp writes it ─────────────────────────────────────────

/** Its header row, in its order. */
const HEADERS = [
  'Task ID', 'Task Link', 'Task Type', 'Task Name', 'Task Content', 'Status', 'Date Created', 'Date Created Text',
  'Due Date', 'Due Date Text', 'Start Date', 'Start Date Text', 'Parent ID', 'Subtasks IDs', 'Attachments', 'Assignees',
  'Tags', 'Priority', 'List Name', 'Folder Name/Path', 'Space Name', 'Time Estimated', 'Time Estimated Text', 'Checklists',
  'Comments', 'Assigned Comments', 'Time Spent', 'Time Spent Text', 'Rolled Up Time', 'Rolled Up Time Text',
  'Home Location ID', 'Home Location', 'Other Location IDs', 'Other Locations',
]

/** How it writes a task with nothing set: `null`, `[]`, `{}`, `""` and `NaN`, not empty cells. */
const BLANK = {
  'Task Type': 'Task', 'Task Content': 'null', 'Status': 'to do', 'Date Created': '1750967227037',
  'Date Created Text': '6/26/2025, 3:47:07 PM EDT', 'Due Date': 'null', 'Start Date': 'null', 'Parent ID': 'null',
  'Subtasks IDs': '[]', 'Attachments': '[]', 'Assignees': '[]', 'Tags': '[]', 'Priority': 'null', 'Space Name': 'Space A',
  'Checklists': '{}', 'Comments': '[]', 'Assigned Comments': '0', 'Time Spent': '""', 'Rolled Up Time': 'NaN',
  'Home Location ID': '901', 'Other Location IDs': '[]', 'Other Locations': '[]',
}

/** A CSV cell as ClickUp quotes one; Time Spent's ` "900000"` is written as it is, outside any quoting. */
const cell = (v) => (v.startsWith(' "') ? v : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
const csv = (rows) => Buffer.from([HEADERS.join(','), ...rows.map((r) => HEADERS.map((h) => cell({ ...BLANK, ...r }[h] ?? '')).join(','))].join('\n') + '\n', 'utf8')

const DUE = Date.UTC(2025, 5, 30, 16, 13, 20, 457)
const START = Date.UTC(2025, 5, 23, 9, 0, 0)
const CREATED = Date.UTC(2025, 5, 2, 7, 45, 12, 31)
/** 600 characters, ending on a letter: a first line that ran on, as some tasks' names do. */
const LONG_NAME = `A task name that is really a paragraph ${'and keeps going '.repeat(36)}`.slice(0, 600)

/** The rows each check is about. Every value is made up. */
function featureRows(member) {
  const place = (space, folder, list) => ({
    'Space Name': space,
    'List Name': list,
    'Folder Name/Path': folder ? JSON.stringify([folder]) : '[]',
    'Home Location': [space, folder, list].filter(Boolean).join(' > '),
  })
  return [
    {
      ...place('Space A', 'Client Work', 'Weekly Reports'),
      'Task ID': 'cu-p1', 'Task Link': 'https://app.clickup.com/t/cu-p1', 'Task Name': `Plan the week ${TAG}`,
      'Task Content': 'First line\\nSecond line\\n\\nAfter a gap', 'Status': 'in progress',
      'Date Created': String(CREATED), 'Due Date': String(DUE), 'Start Date': String(START), 'Subtasks IDs': '[cu-s1]',
      'Assignees': `[${member}, Pat Unknown]`, 'Tags': '[weekly, ops]', 'Priority': '1', 'Time Estimated': '5400000',
      'Time Estimated Text': '1 h 30 m', 'Checklists': '{"Prep":["Book room","Send invites"],"Follow-up":["Write notes"]}',
      'Time Spent': ' "900000"', 'Time Spent Text': '15 m', 'Rolled Up Time': '1800000', 'Rolled Up Time Text': '30 m',
    },
    { ...place('Space A', 'Client Work', 'Weekly Reports'), 'Task ID': 'cu-s1', 'Task Name': `Book the room ${TAG}`, 'Parent ID': 'cu-p1', 'Subtasks IDs': '[cu-s2]' },
    { ...place('Space A', 'Client Work', 'Weekly Reports'), 'Task ID': 'cu-s2', 'Task Name': `Confirm by phone ${TAG}`, 'Parent ID': 'cu-s1' },
    { ...place('Space A', null, 'Inbox'), 'Task ID': 'cu-q1', 'Task Name': `Rich text ${TAG}`, 'Task Content': '{"ops":[{"insert":"Bold "},{"insert":"words\\n"}]}' },
    { ...place('Space B', 'Client Work', 'Weekly Reports'), 'Task ID': 'cu-b1', 'Task Name': `Same names in Space B ${TAG}` },
    { ...place('Space B', null, 'Inbox'), 'Task ID': 'cu-b2', 'Task Name': `Space B's own Inbox ${TAG}` },
    { ...place('Space B', 'Ops', 'Board'), 'Task ID': 'cu-l1', 'Task Name': LONG_NAME },
    {
      // Also in a second List: List Name and Space Name say where it was added, Home Location where it lives.
      ...place('Space B', 'Ops', 'Board'), 'Task ID': 'cu-o1', 'Task Name': `In two Lists ${TAG}`,
      'Space Name': 'Space A', 'List Name': 'Weekly Reports', 'Folder Name/Path': '["Client Work"]',
      'Other Location IDs': '[902]', 'Other Locations': '[Space A > Client Work > Weekly Reports]',
    },
    { ...place('Space B', 'Ops', 'Board'), 'Task ID': 'cu-c1', 'Task Name': `Done already ${TAG}`, 'Status': 'complete', 'Priority': '4' },
  ]
}

/**
 * Made-up rows to make up a file's count: 44 more Folders, 22 in each Space,
 * four Lists in each, and every eighth row a subtask of the row before it, in
 * that row's List.
 */
function fillerRows(count) {
  const rows = []
  for (let i = 1; i <= count; i++) {
    const home = i % 8 === 0 ? i - 1 : i
    const space = home % 2 ? 'Space A' : 'Space B'
    const folder = `Folder ${(home % 44) + 1}`
    const list = `List ${(home % 4) + 1}`
    const id = `cu-f${i}`
    rows.push({
      'Task ID': id, 'Task Link': `https://app.clickup.com/t/${id}`, 'Task Name': `Filler ${i} ${TAG}`,
      'Task Content': i % 3 ? `Row ${i}, as ClickUp keeps it.\\nA second line.` : 'null',
      'Status': ['to do', 'in progress', 'review', 'complete'][i % 4], 'Date Created': String(CREATED + i * 60_000),
      'Due Date': i % 5 ? String(DUE + i * 3_600_000) : 'null', 'Priority': ['1', '2', '3', '4', 'null'][i % 5],
      'Parent ID': home === i ? 'null' : `cu-f${home}`, 'Tags': i % 7 ? '[]' : `[tag${i % 3}]`,
      'Time Estimated': i % 6 ? '' : String(3_600_000 * ((i % 4) + 1)),
      'Checklists': i % 20 ? '{}' : JSON.stringify({ Steps: [`step ${i}a`, `step ${i}b`] }),
      'Space Name': space, 'List Name': list, 'Folder Name/Path': JSON.stringify([folder]),
      'Home Location': `${space} > ${folder} > ${list}`,
    })
  }
  return rows
}

/** The API process's resident memory, in MB, for `--rows` runs: the node process serving dist/apps/api. */
function apiRssMb() {
  let best = 0
  for (const pid of readdirSync('/proc').filter((p) => /^\d+$/.test(p))) {
    if (Number(pid) === process.pid) continue
    try {
      const cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8')
      if (!cmd.includes('dist/apps/api/src/main.js')) continue
      const kb = Number(/VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/status`, 'utf8'))?.[1] ?? 0)
      best = Math.max(best, Math.round(kb / 1024))
    } catch {
      /* gone */
    }
  }
  return best
}

// ── the run ──────────────────────────────────────────────────────────────────

const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${stack.base}/api/v1`
const sql = await openDb()
let browser = null
let A = null
let WS = null

try {
  if (!sql) throw new Error('no DATABASE_URL — this suite reads the imported rows back from Postgres')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAsAt(API, { emptyBodyOn: ['POST'] })(auth.accessToken)
  const ws = await A('/workspaces', { method: 'POST', body: { name: `ClickUp export ${TAG}` } })
  if (!ws.ok) throw new Error(`POST /workspaces answered ${said(ws)}`)
  WS = ws.data.id
  const spaceRes = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `Imported ${TAG}` } })
  if (!spaceRes.ok) throw new Error(`POST /spaces answered ${said(spaceRes)}`)
  const SPACE = spaceRes.data.id
  const spare = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `On Free ${TAG}` } })
  if (!spare.ok) throw new Error(`POST /spaces answered ${said(spare)}`)
  const SPARE = spare.data.id
  const [me] = await sql`select id, display_name from users where lower(email) = lower(${ADMIN.email})`
  if (!me?.display_name) throw new Error('the admin has no display name to be assigned by')

  const features = featureRows(me.display_name)
  const ROWS = Math.max(features.length, Number(argOf('--rows', features.length)))
  const all = [...features, ...fillerRows(ROWS - features.length)]
  const file = csv(all)
  /** `Space > Folder` of every Home Location that has a Folder: each one a project. */
  const folderCount = new Set(all.map((r) => r['Home Location'].split(' > ')).filter((p) => p.length > 2).map((p) => p.slice(0, -1).join(' > '))).size
  info(`workspace ${WS}, ${ROWS.toLocaleString('en-GB')} rows (${(file.length / 1048576).toFixed(1)} MB) across ${folderCount} Folders, tag ${TAG}`)

  browser = await (await resolveChromium()).launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  // Bounded, so a page that never offers the next step fails the run instead of waiting out the step's cap.
  page.setDefaultTimeout(60_000)
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})

  /** The jobs there were before this wizard: its own is made, as a draft, by its Continue. */
  let known = new Set()
  /** Settings › Imports / Exports › Spreadsheet, into a Space, as far as the grid's file picker. */
  const openWizard = async (spaceId) => {
    known = new Set((await sql`select id from clickup_import_jobs where workspace_id = ${WS}`).map((j) => j.id))
    await page.goto(`${B}/app/${WS}/settings?tab=importsExports&spreadsheet=true&locationType=space&locationId=${spaceId}`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('dest-continue').click({ timeout: 30_000 })
    await page.getByTestId('grid-file-input').waitFor({ state: 'attached', timeout: 30_000 })
  }
  /** The file, read and mapped, then Continue to the grid. */
  const readIn = async (name, buffer) => {
    await page.getByTestId('grid-file-input').setInputFiles({ name, mimeType: 'text/csv', buffer }, { timeout: 10_000 })
    await page.getByTestId('map-continue').waitFor({ timeout: 300_000 })
  }
  const toGrid = async (rows) => {
    await page.getByTestId('map-continue').click()
    if (await page.getByTestId('fields-complete').isVisible({ timeout: 3_000 }).catch(() => false)) await page.getByTestId('fields-complete').click()
    await page.getByTestId('grid-record-count').filter({ hasText: rows.toLocaleString('en-GB') }).waitFor({ timeout: 300_000 })
  }
  /** Import, then the run to its end; the job row as it ended. */
  const importAndWait = async (limitMs) => {
    const button = page.getByTestId('grid-import')
    await button.waitFor({ timeout: 60_000 })
    if (await button.isDisabled()) throw new Error('Import is disabled on a valid grid')
    const clicked = Date.now()
    await button.click()
    await page.locator('[data-sonner-toast]').filter({ hasText: 'Import started' }).first().waitFor({ timeout: 600_000 })
    const uploadedSec = (Date.now() - clicked) / 1000
    const job = (await sql`select id from clickup_import_jobs where workspace_id = ${WS} order by created_at desc limit 5`).find((j) => !known.has(j.id))
    if (!job) throw new Error('Import started, and no job row was made')
    const runFrom = Date.now()
    let peak = apiRssMb()
    let row = null
    const ended = await waitUntil(async () => {
      peak = Math.max(peak, apiRssMb())
      ;[row] = await sql`select id, status, error, rejected_count, total, result from clickup_import_jobs where id = ${job.id}`
      return ['completed', 'failed', 'cancelled'].includes(row?.status)
    }, { timeoutMs: limitMs, stepMs: 1000 })
    if (!ended) throw new Error(`the run did not end in ${limitMs / 1000}s: ${JSON.stringify({ status: row?.status })}`)
    return { ...row, uploadedSec, runSec: (Date.now() - runFrom) / 1000, peakMb: peak }
  }

  // ══ 1. ONE ROW PAST THE LIMIT, THEN THE EXPORT, READ AND MAPPED ═════════════
  console.log('\n▶ the page reads the file')
  await openWizard(SPACE)
  const over = Buffer.from(['Task Name', ...Array.from({ length: 100_001 }, (_, i) => `row ${i}`)].join('\n'), 'utf8')
  await page.getByTestId('grid-file-input').setInputFiles({ name: `over-${TAG}.csv`, mimeType: 'text/csv', buffer: over }, { timeout: 10_000 })
  const refusal = page.locator('[data-sonner-toast]').filter({ hasText: 'row limit for imported spreadsheets' }).filter({ visible: true }).first()
  const refusedText = await refusal.waitFor({ timeout: 120_000 }).then(() => refusal.innerText(), () => '')
  chk(
    /There is a 100,000-row limit for imported spreadsheets\. Split your file into batches\./.test(refusedText.replace(/\s+/g, ' ')),
    'a file one row past 100,000 is refused by the page, in the limit’s own words',
    `the page said ${JSON.stringify(refusedText.replace(/\s+/g, ' ').trim()) || 'nothing'}`,
  )

  let t = Date.now()
  await readIn(`clickup-export-${TAG}.csv`, file)
  const readSec = (Date.now() - t) / 1000
  const mappedLocation = await page.getByTestId('map-select-Home Location').inputValue().catch(() => null)
  const mappedListName = await page.getByTestId('map-select-List Name').inputValue().catch(() => null)
  const mappedContent = await page.getByTestId('map-select-Task Content').inputValue().catch(() => null)
  t = Date.now()
  await toGrid(ROWS)
  const gridSec = (Date.now() - t) / 1000
  const header = await page.getByTestId('grid-header-location').filter({ visible: true }).innerText({ timeout: 10_000 }).catch(() => null)
  const unmatched = await page.getByTestId('grid-unmatched').filter({ visible: true }).innerText({ timeout: 10_000 }).catch(() => '')
  chk(
    mappedLocation === 'location' && mappedListName === 'skip' && mappedContent === 'description' &&
      /List location/.test(header ?? '') && /Pat Unknown/.test(unmatched) && !unmatched.includes(me.display_name),
    'the export maps with no clicks — Home Location to List location, List Name left out, Task Content to the description — and the grid names the one assignee who is not a member',
    `Home Location → ${mappedLocation}, List Name → ${mappedListName}, Task Content → ${mappedContent}; header ${JSON.stringify(header)}; unmatched ${JSON.stringify(unmatched.slice(0, 200))}`,
  )

  // ══ 2. THE IMPORT, READ BACK FROM POSTGRES ═══════════════════════════════════
  console.log('\n▶ the import, as Postgres holds it')
  const job = await importAndWait(ROWS > 1000 ? 60 * 60_000 : 5 * 60_000)
  info(`read ${readSec.toFixed(1)}s, grid ${gridSec.toFixed(1)}s, upload ${job.uploadedSec.toFixed(1)}s, run ${job.runSec.toFixed(1)}s (${job.status}); API peak ${job.peakMb} MB`)
  const tasksOf = (jobId) => sql`
    select t.id, t.title, t.description, t.priority, t.due_date, t.start_date, t.created_at, t.time_estimate,
           t.parent_task_id, t.list_id, t.status, t.status_category, l.name as list, p.name as project,
           p.is_default_container as in_space, p.import_id as project_import
      from tasks t join lists l on l.id = t.list_id join projects p on p.id = l.project_id
     where t.import_id = ${jobId} and t.deleted_at is null`
  const made = await tasksOf(job.id)
  const byName = (prefix) => made.filter((r) => r.title.startsWith(prefix))
  chk(
    job.status === 'completed' && made.length === ROWS && Number(job.rejected_count ?? 0) === 0,
    'every row of the export is imported, and none is refused',
    `the run ${job.status}${job.error ? ` (${job.error})` : ''}: ${made.length} tasks, ${job.rejected_count} refused`,
  )

  const projectsMade = await sql`select id, name, folder_id, space_id, is_archived from projects where import_id = ${job.id}`
  const names = projectsMade.map((p) => p.name)
  chk(
    projectsMade.length === folderCount && ['Client Work (Space A)', 'Client Work (Space B)', 'Ops'].every((n) => names.includes(n)) &&
      projectsMade.every((p) => p.space_id === SPACE && p.folder_id === null && !p.is_archived),
    'each ClickUp Folder is a project in the Space, and the two Client Work Folders say their Space',
    `${projectsMade.length} projects for ${folderCount} Folders: ${JSON.stringify(names.slice(0, 8))}`,
  )

  const placed = (prefix) => {
    const [r] = byName(prefix)
    return r ? `${r.in_space ? '(Space)' : r.project} / ${r.list}` : null
  }
  const where = {
    p1: placed('Plan the week'),
    b1: placed('Same names in Space B'),
    q1: placed('Rich text'),
    b2: placed("Space B's own Inbox"),
    l1: placed('A task name that is really'),
  }
  const shared = byName('In two Lists')
  chk(
    where.p1 === 'Client Work (Space A) / Weekly Reports' && where.b1 === 'Client Work (Space B) / Weekly Reports' &&
      where.q1 === '(Space) / Inbox (Space A)' && where.b2 === '(Space) / Inbox (Space B)' && where.l1 === 'Ops / Board' &&
      shared.length === 1 && placed('In two Lists') === 'Ops / Board',
    'each List is in its Folder’s project, the two Inboxes straight in their Spaces share the Space’s own named for their Space, and a task also in a second List is imported once, in its Home Location',
    `${JSON.stringify(where)}; the task in two Lists: ${shared.length} copies, in ${JSON.stringify(shared.map((r) => `${r.project} / ${r.list}`))}`,
  )

  const [p1] = byName('Plan the week')
  const [q1] = byName('Rich text')
  const literal = made.filter((r) => r.description === 'null' || (r.description ?? '').includes('\\n') || (r.description ?? '').startsWith('{"ops"'))
  chk(
    p1?.description === 'First line\nSecond line\n\nAfter a gap' && q1?.description === 'Bold words' && literal.length === 0,
    'descriptions arrive as text: the export’s escaped line breaks as real ones, Quill’s as its words, and no task’s is the word null',
    `${JSON.stringify(p1?.description)}, ${JSON.stringify(q1?.description)}; ${literal.length} written as the export wrote them`,
  )

  const [tracked] = p1 ? await sql`select coalesce(sum(duration_sec), 0)::int as s from time_entries where task_id = ${p1.id}` : [{ s: null }]
  const [done] = byName('Done already')
  const ms = (d) => (d ? new Date(d).getTime() : null)
  chk(
    p1?.priority === 'urgent' && ms(p1?.due_date) === DUE && ms(p1?.start_date) === START && ms(p1?.created_at) === CREATED &&
      p1?.time_estimate === 5400 && tracked.s === 900 && done?.priority === 'low' && done?.status_category === 'closed',
    'priority, the due date to the millisecond, start and created dates, the estimate and the time tracked are the export’s',
    JSON.stringify({ priority: p1?.priority, due: p1?.due_date, start: p1?.start_date, created: p1?.created_at, estimate: p1?.time_estimate, tracked: tracked.s, done: [done?.priority, done?.status_category] }),
  )

  const lists = p1
    ? await sql`select c.title, count(i.id)::int as items, count(i.id) filter (where i.is_done)::int as done
                  from task_checklists c left join task_checklist_items i on i.checklist_id = c.id
                 where c.task_id = ${p1.id} group by c.title, c.position order by c.position`
    : []
  const [s1] = byName('Book the room')
  const [s2] = byName('Confirm by phone')
  chk(
    JSON.stringify(lists.map((c) => [c.title, c.items, c.done])) === JSON.stringify([['Prep', 2, 0], ['Follow-up', 1, 0]]) &&
      s1?.parent_task_id === p1?.id && s2?.parent_task_id === p1?.id && s2?.list_id === p1?.list_id,
    'both of a task’s checklists, none done, and its subtasks by Parent ID — the second level under the top-level task, in its List',
    `${JSON.stringify(lists)}; Book the room under ${s1?.parent_task_id === p1?.id ? 'it' : s1?.parent_task_id}, Confirm by phone under ${s2?.parent_task_id === p1?.id ? 'it' : s2?.parent_task_id}`,
  )

  const [long] = byName('A task name that is really')
  const longNotes = await sql`select row_ref, message from import_errors where job_id = ${job.id} and message like ${'%shortened to the first 500%'}`
  chk(
    long?.title.length === 500 && LONG_NAME.startsWith(long.title) && longNotes.length === 1,
    'the 600-character name is imported under its first 500, and the report says so',
    `${long ? `${long.title.length} characters` : 'no task'}; ${longNotes.length} notes ${JSON.stringify(longNotes.map((n) => n.row_ref))}`,
  )

  const assigned = p1 ? await sql`select user_id from task_assignees where task_id = ${p1.id}` : []
  const tags = p1 ? await sql`select lower(l.name) as name from task_label_assignments a join labels l on l.id = a.label_id where a.task_id = ${p1.id} order by 1` : []
  const people = Array.isArray(job.result?.users) ? job.result.users : []
  const pat = people.find((u) => u.value === 'Pat Unknown')
  chk(
    assigned.length === 1 && assigned[0].user_id === me.id && tags.map((r) => r.name).join(',') === 'ops,weekly' && pat?.outcome === 'skipped',
    'the member is assigned by name and the tags are on the task; the name no member has is reported, not assigned',
    `assigned ${JSON.stringify(assigned.map((a) => a.user_id === me.id ? 'the admin' : a.user_id))}; tags ${JSON.stringify(tags.map((r) => r.name))}; Pat Unknown ${JSON.stringify(pat ?? null)}`,
  )

  // ══ 3. ON THE FREE PLAN, WHOSE THREE PROJECTS ARE SPENT ══════════════════════
  console.log('\n▶ where the plan allows no more projects')
  await sql`update workspaces set plan = 'free' where id = ${WS}`
  let second = null
  try {
    await openWizard(SPARE)
    const small = csv([
      { 'Task ID': 'cu-x1', 'Task Name': `Old board task ${TAG}`, 'Space Name': 'Space C', 'List Name': 'Old Board', 'Folder Name/Path': '["Archive"]', 'Home Location': 'Space C > Archive > Old Board' },
      { 'Task ID': 'cu-x2', 'Task Name': `Loose task ${TAG}`, 'Space Name': 'Space C', 'List Name': 'Loose', 'Folder Name/Path': '[]', 'Home Location': 'Space C > Loose' },
    ])
    await readIn(`free-${TAG}.csv`, small)
    await toGrid(2)
    second = await importAndWait(5 * 60_000)
  } finally {
    await sql`update workspaces set plan = 'enterprise' where id = ${WS}`
  }
  const secondTasks = await tasksOf(second.id)
  const secondProjects = await sql`select id from projects where import_id = ${second.id}`
  const why = await sql`select row_ref, message from import_errors where job_id = ${second.id} and row_ref = 'Folders'`
  const oldBoard = secondTasks.find((r) => r.title.startsWith('Old board task'))
  chk(
    second.status === 'completed' && secondTasks.length === 2 && secondProjects.length === 0 && oldBoard?.in_space === true &&
      oldBoard?.list === 'Old Board' && why.length === 1 && /Free plan allows up to 3 projects/.test(why[0].message) &&
      /The Lists of one Folder were made straight in the Space instead\./.test(why[0].message),
    'on a plan with no projects left, a Folder’s List is made straight in the Space, and the report says why',
    `${second.status}: ${secondTasks.length} tasks, ${secondProjects.length} projects, Old Board in ${oldBoard ? (oldBoard.in_space ? 'the Space' : oldBoard.project) : 'nothing'}; ${JSON.stringify(why.map((w) => w.message))}`,
  )

  // ══ 4. UNDONE ═══════════════════════════════════════════════════════════════
  console.log('\n▶ the first import, undone')
  const undo = await A(`/workspaces/${WS}/imports/${job.id}`, { method: 'DELETE' })
  const live = await tasksOf(job.id)
  const projectsAfter = await sql`select count(*) filter (where not is_archived)::int as live, count(*)::int as n from projects where import_id = ${job.id}`
  const listsAfter = await sql`select count(*) filter (where not is_archived)::int as live, count(*)::int as n from lists where import_id = ${job.id}`
  const [container] = await sql`select is_archived from projects where space_id = ${SPACE} and is_default_container`
  chk(
    undo.status === 200 && live.length === 0 && projectsAfter[0].n === folderCount && projectsAfter[0].live === 0 &&
      listsAfter[0].n > 0 && listsAfter[0].live === 0 && container?.is_archived === false,
    'undo puts the import’s tasks in Trash and archives the projects and Lists it made, and leaves the Space’s own container',
    `DELETE answered ${said(undo)}; ${live.length} tasks live; projects ${JSON.stringify(projectsAfter[0])}; lists ${JSON.stringify(listsAfter[0])}; container archived ${container?.is_archived}`,
  )
  const undoSecond = await A(`/workspaces/${WS}/imports/${second.id}`, { method: 'DELETE' })
  if (undoSecond.status !== 200) info(`the second import's undo answered ${said(undoSecond)}`)
  await ctx.close().catch(() => {})
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
  }
  await sql?.end?.().catch(() => {})
  // Only now: the DELETE above goes through this proxy, and a closed one refuses it.
  stack.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
