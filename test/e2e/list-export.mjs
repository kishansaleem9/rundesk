/**
 * §V2-07 — download the list you are looking at.
 *
 * `[10:53]`–`[11:09]` "Customize pe aap click karoge — ab yeh dekh rahe ho:
 * EXPORT VIEW … aur aap is ko download kar lo … woh aap ko COLUMN mein list de
 * dega, har cheez." Frame `10:57`: File format, a What-to-export choice of
 * Visible columns / Task Names only / All columns, and Download.
 *
 * What existed was `GET /export/csv/tasks` — the WHOLE workspace, seven fixed
 * columns, behind `WorkspaceAdminGuard`. The person actually looking at a list
 * is usually not an admin, so they could not download it at all.
 *
 * THE CHECK THAT IS NOT ABOUT THE FEATURE.
 *
 * A cell beginning `=`, `+`, `-` or `@` is a FORMULA to Excel, LibreOffice and
 * Google Sheets. A task titled `=cmd|'/c calc'!A1` runs when somebody opens the
 * export — and the person who typed it did not have to attack anything, they
 * typed it into a task title in an app that invited them to. So one task here is
 * deliberately named that way, and the check is that the exported cell cannot
 * be read as a formula.
 *
 *   node test/e2e/list-export.mjs --api 3011
 */
import { signInApi } from './lib/signin.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 9

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ME = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${bad ?? good}`) }
}

const apiAs = (token) => async (route, init = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, {
    ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}
const raw = (token) => async (route) => {
  const res = await fetch(`${API}${route}`, { headers: { authorization: `Bearer ${token}` } })
  return { status: res.status, text: await res.text(), disposition: res.headers.get('content-disposition') }
}

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const R = raw(auth.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id
  const stamp = Date.now()

  // A list of this suite's own, so the row counts below mean something.
  const spaces = (await A(`/spaces/workspace/${workspaceId}`)).data ?? []
  const spaceId = spaces[0]?.id
  if (!spaceId) throw new Error('no space')
  const list = (await A('/lists', { method: 'POST', body: { spaceId, name: `Export list ${stamp}` } })).data
  if (!list?.id) throw new Error('could not make a list')

  const FORMULA = `=cmd|'/c calc'!A1 ${stamp}`
  const COMMA = `Comma, and "quotes" ${stamp}`
  await A('/tasks', { method: 'POST', body: { listId: list.id, title: `Plain ${stamp}` } })
  await A('/tasks', { method: 'POST', body: { listId: list.id, title: FORMULA } })
  await A('/tasks', { method: 'POST', body: { listId: list.id, title: COMMA } })

  console.log('\n▶ §V2-07 — the list downloads as columns')
  const visible = await R(`/tasks/list/${list.id}/export`)
  chk(visible.status === 200, 'a member can export the list they are looking at',
    `export returned ${visible.status} — the old export was admin-only`)
  chk(
    /attachment; filename=/.test(visible.disposition ?? ''),
    'and it arrives as a download, named after the list',
    `content-disposition was ${JSON.stringify(visible.disposition)}`,
  )
  const header = visible.text.split('\r\n')[0]
  chk(
    header === '"Name","Status","Assignees","Priority","Due date"',
    'with the columns the list shows',
    `header row was ${JSON.stringify(header)}`,
  )
  chk(visible.text.split('\r\n').length === 4, 'and one row per task, no more',
    `got ${visible.text.split('\r\n').length - 1} row(s) for 3 tasks`)

  console.log('\n▶ what to export')
  const names = await R(`/tasks/list/${list.id}/export?columns=names`)
  chk(names.text.split('\r\n')[0] === '"Name"', 'Task Names only gives one column',
    `header was ${JSON.stringify(names.text.split('\r\n')[0])}`)
  const all = await R(`/tasks/list/${list.id}/export?columns=all`)
  chk(
    all.text.split('\r\n')[0].split(',').length > header.split(',').length,
    'and All columns gives more than the visible ones',
    `all=${all.text.split('\r\n')[0].split(',').length} vs visible=${header.split(',').length}`,
  )

  console.log('\n▶ and it cannot carry a formula into a spreadsheet')
  /*
   * The cell must not BEGIN with `=`. Quoting alone does not help: a
   * spreadsheet strips the quotes and then reads the `=`.
   */
  const formulaCell = visible.text.split('\r\n').find((l) => l.includes('calc'))
  chk(
    !!formulaCell && !/^"=/.test(formulaCell),
    'a task named like a formula is exported as text',
    `the row starts ${JSON.stringify((formulaCell ?? '').slice(0, 24))} — that executes on open`,
  )
  chk(
    !!formulaCell && formulaCell.startsWith(`"'=cmd`),
    "and is prefixed so a spreadsheet shows it as the person typed it",
    `expected a leading apostrophe, got ${JSON.stringify((formulaCell ?? '').slice(0, 24))}`,
  )

  /*
   * The control for the quoting, without which the check above could pass on a
   * build that mangles every other field: a title with a comma and quotes in it
   * has to survive as ONE cell.
   */
  const commaRow = visible.text.split('\r\n').find((l) => l.includes('and ""quotes""'))
  chk(
    !!commaRow && commaRow.startsWith(`"Comma, and ""quotes""`),
    'and a title with commas and quotes stays one cell',
    `the row was ${JSON.stringify((commaRow ?? '').slice(0, 48))}`,
  )

  await A(`/lists/${list.id}`, { method: 'DELETE' }).catch(() => {})
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran < EXPECTED_CHECKS) {
    console.log(
      `\n✗ only ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
