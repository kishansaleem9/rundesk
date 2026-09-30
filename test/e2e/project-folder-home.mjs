/**
 * A PROJECT'S FOLDER IS ONE OF ITS OWN SPACE'S.
 *
 * NOT A FRAME ROW: `found-28-sep/project-folder-unchecked-across-workspaces`,
 * found implementing `client.manage` and measured on lane 5 before the fix:
 * `PUT /projects/:id` took a `folderId` of another space, or of ANOTHER
 * WORKSPACE, and set it (200 each), leaving the project in one space under a
 * folder that lives elsewhere — the other tenant's folder's privacy then read
 * as the project's. Moving a project already asked that its folder be in the
 * destination space; making one and updating one did not.
 *
 *   node test/e2e/project-folder-home.mjs --api 3025 --dist /tmp/claude-0/dist-5
 */
import path from 'node:path'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 4

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `pfh${stamp}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const API = `${stack.base}/api/v1`
/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
let sql = null
const MADE = []
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the project’s folder is read back by SQL')
  A = apiAs((await signInApi(API, ADMIN.email, ADMIN.password)).accessToken)
  const workspace = async (name) => {
    const r = await A('/workspaces', { method: 'POST', body: { name: `${TAG} ${name}` } })
    if (r.status >= 300 || !r.data?.id) throw new Error(`could not make workspace ${name}: ${said(r)}`)
    MADE.push(r.data.id)
    return r.data.id
  }
  const space = async (ws, name) => {
    const r = await A('/spaces', { method: 'POST', body: { workspaceId: ws, name: `${TAG} ${name}` } })
    if (r.status >= 300 || !r.data?.id) throw new Error(`could not make space ${name}: ${said(r)}`)
    return r.data.id
  }
  const folder = async (sp, name) => {
    const r = await A(`/spaces/${sp}/folders`, { method: 'POST', body: { name: `${TAG} ${name}` } })
    if (r.status >= 300 || !r.data?.id) throw new Error(`could not make folder ${name}: ${said(r)}`)
    return r.data.id
  }
  const HOME = await workspace('home')
  const AWAY = await workspace('away')
  const SPACE = await space(HOME, 'own')
  const SIBLING = await space(HOME, 'sibling')
  const FOREIGN = await space(AWAY, 'foreign')
  const project = await A('/projects', { method: 'POST', body: { spaceId: SPACE, name: `${TAG} project` } })
  if (project.status >= 300 || !project.data?.id) throw new Error(`could not make the project: ${said(project)}`)
  const P = project.data.id
  const OWN = await folder(SPACE, 'own folder')
  const SIB = await folder(SIBLING, 'sibling folder')
  const AWAY_F = await folder(FOREIGN, 'away folder')
  const folderOf = async (id) => (await sql`select folder_id from projects where id = ${id}`)[0]?.folder_id ?? null

  console.log('\n▶ updating a project with another workspace\'s folder, and another space\'s')
  const toAway = await A(`/projects/${P}`, { method: 'PUT', body: { folderId: AWAY_F } })
  const afterAway = await folderOf(P)
  chk(
    toAway.status === 400 && afterAway === null,
    'a project takes no folder of another workspace (400), and stays out of it',
    `${said(toAway)}; the project's folder is now ${afterAway}`,
  )
  const toSibling = await A(`/projects/${P}`, { method: 'PUT', body: { folderId: SIB } })
  const afterSibling = await folderOf(P)
  chk(
    toSibling.status === 400 && afterSibling === null,
    'nor a folder of another space of its own workspace (400)',
    `${said(toSibling)}; the project's folder is now ${afterSibling}`,
  )

  console.log('\n▶ making a project with a folder that is not its space\'s')
  const madeAway = await A('/projects', { method: 'POST', body: { spaceId: SPACE, name: `${TAG} made away`, folderId: AWAY_F } })
  const strays = await sql`select id from projects where name = ${`${TAG} made away`}`
  chk(
    madeAway.status === 400 && strays.length === 0,
    'a project is not made under another workspace\'s folder (400), and nothing is made',
    `${said(madeAway)}; ${strays.length} project(s) made`,
  )

  console.log('\n▶ its own space\'s folder')
  const toOwn = await A(`/projects/${P}`, { method: 'PUT', body: { folderId: OWN } })
  const afterOwn = await folderOf(P)
  const outAgain = await A(`/projects/${P}`, { method: 'PUT', body: { folderId: null } })
  chk(
    toOwn.ok && afterOwn === OWN && outAgain.ok && (await folderOf(P)) === null,
    'a folder of its own space is set, and null takes the project out of it again',
    `set ${said(toOwn)} → ${afterOwn}; out ${said(outAgain)} → ${await folderOf(P)}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  for (const ws of MADE) {
    const gone = await A(`/workspaces/${ws}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${ws} answered ${gone.status || 'nothing'}`)
  }
  // Only now: the DELETEs above go through this proxy, and a closed one refuses them.
  stack.close()
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
