/**
 * PROJECT TEMPLATES ARE MADE AND DELETED BY WHOEVER HOLDS `template.manage`,
 * AND A PROJECT IS SAVED AS ONE ONLY AS FAR AS ITS SAVER MAY READ IT.
 *
 * NOT A FRAME ROW: `found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`,
 * its project-templates slice. Task templates ask `template.manage`; project
 * templates — save a project as one, make one, delete one — stood behind
 * `WorkspaceAdminGuard`, which admits managers and refused a member granted
 * the key. The templates page offered "Save as template" to everybody, whom
 * the API then refused.
 *
 * Saving copied every list and task of the project, and asked only that the
 * project be in the workspace: while only managers and admins could save, they
 * saw all of it anyway. A member granted the key does not, so the save asks
 * the read rule of the project, and copies only the lists and tasks its saver
 * may read. ClickUp (help centre "Templates", search snippets): a template is
 * saved from what its saver has in front of them.
 *
 *   node test/e2e/project-template-key.mjs --api 3021 --dist /tmp/claude-0/dist-1
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'
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
const TAG = `ptk${stamp}`
const PASSWORD = 'ProjectTemplates@12345!'
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — templates are read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const person = async (key, role, keys = []) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Templates ${key}`, email, password: PASSWORD, organizationName: `Templates ${key} ${stamp}`, organizationSlug: `templates-${key}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${key}: ${said(added)}`)
    if (keys.length > 0) {
      const [row] = await sql`select m.id from workspace_members m join users u on u.id = m.user_id where m.workspace_id = ${WS} and u.email = ${email}`
      const role2 = await A(`/workspaces/${WS}/roles`, { method: 'POST', body: { name: `${TAG} ${key}`, permissions: keys } })
      const given = role2.data?.id ? await A(`/workspaces/${WS}/members/${row.id}/roles/${role2.data.id}`, { method: 'POST', body: {} }) : { status: 0 }
      if (given.status >= 300) throw new Error(`could not grant the ${key}: ${said(role2)} ${said(given)}`)
    }
    return { email, password: PASSWORD, as: apiAs(signed.accessToken) }
  }
  const manager = await person('manager', 'manager')
  const designer = await person('designer', 'member', ['template.manage'])
  const plain = await person('plain', 'member')

  // An open project holding one task everybody reads and one private task, and a private project.
  const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} space` } })
  const projectIn = async (name) => {
    const p = await A('/projects', { method: 'POST', body: { spaceId: space.data?.id, name } })
    const l = await A('/lists', { method: 'POST', body: { projectId: p.data?.id, name: `${name} list` } })
    if (l.status >= 300 || !l.data?.id) throw new Error(`could not make ${name}: ${said(p)} ${said(l)}`)
    return { projectId: p.data.id, listId: l.data.id }
  }
  const open = await projectIn(`${TAG} open`)
  const closed = await projectIn(`${TAG} closed`)
  await sql`update projects set visibility = 'private' where id = ${closed.projectId}`
  const OPEN_TITLE = `${TAG} open task`
  const PRIVATE_TITLE = `${TAG} private task`
  const openTask = await A('/tasks', { method: 'POST', body: { listId: open.listId, title: OPEN_TITLE } })
  const privateTask = await A('/tasks', { method: 'POST', body: { listId: open.listId, title: PRIVATE_TITLE } })
  if (openTask.status >= 300 || privateTask.status >= 300) throw new Error(`could not make the tasks: ${said(openTask)} ${said(privateTask)}`)
  await sql`update tasks set visibility = 'private' where id = ${privateTask.data.id}`
  const templatesNamed = async (name) => (await sql`select payload::text as payload from project_templates where workspace_id = ${WS} and name = ${name}`)

  // ══ 1. SAVING A PROJECT AS A TEMPLATE ════════════════════════════════════
  console.log('\n▶ saving the open project as a template: the member granted template.manage, a plain member, the manager')
  const save = (who, name, projectId) => who.as(`/workspaces/${WS}/project-templates/save-from-project`, { method: 'POST', body: { projectId, name } })
  const designerSaves = await save(designer, `${TAG} by the designer`, open.projectId)
  const plainSaves = await save(plain, `${TAG} by the plain member`, open.projectId)
  const managerSaves = await save(manager, `${TAG} by the manager`, open.projectId)
  chk(
    designerSaves.status < 300 && (await templatesNamed(`${TAG} by the designer`)).length === 1
      && plainSaves.status === 403 && (await templatesNamed(`${TAG} by the plain member`)).length === 0
      && managerSaves.status < 300,
    'a member granted template.manage saves a project as a template, and so does a manager — a plain member saves none (403)',
    `designer ${said(designerSaves)}; plain ${said(plainSaves)}; manager ${said(managerSaves)}`,
  )

  // ══ 2. ONLY AS FAR AS THE SAVER MAY READ ═════════════════════════════════
  console.log('\n▶ what the designer’s template holds, and a private project')
  const designerTemplate = (await templatesNamed(`${TAG} by the designer`))[0]?.payload ?? ''
  const managerTemplate = (await templatesNamed(`${TAG} by the manager`))[0]?.payload ?? ''
  const savesClosed = await save(designer, `${TAG} of the private project`, closed.projectId)
  chk(
    designerTemplate.includes(OPEN_TITLE) && !designerTemplate.includes(PRIVATE_TITLE)
      && managerTemplate.includes(PRIVATE_TITLE)
      && savesClosed.status === 404 && (await templatesNamed(`${TAG} of the private project`)).length === 0,
    'the designer’s template holds the task they read and not the private one — the manager’s, who reads it, holds both — and a project the designer cannot open is saved by nobody’s key (404, none made)',
    `designer's template: open ${designerTemplate.includes(OPEN_TITLE)}, PRIVATE ${designerTemplate.includes(PRIVATE_TITLE)}; manager's private ${managerTemplate.includes(PRIVATE_TITLE)}; the private project ${said(savesClosed)}`,
  )

  // ══ 3. MAKING AND DELETING ═══════════════════════════════════════════════
  console.log('\n▶ making a template from a payload, and deleting one')
  const payload = { name: `${TAG} made`, targetType: 'project', payload: { lists: [{ name: 'Made list', position: 0, tasks: [] }] } }
  const plainMakes = await plain.as(`/workspaces/${WS}/project-templates`, { method: 'POST', body: { ...payload, name: `${TAG} made by plain` } })
  const designerMakes = await designer.as(`/workspaces/${WS}/project-templates`, { method: 'POST', body: payload })
  const madeId = designerMakes.data?.id ?? (await sql`select id from project_templates where workspace_id = ${WS} and name = ${`${TAG} made`}`)[0]?.id
  const plainDeletes = madeId ? await plain.as(`/workspaces/${WS}/project-templates/${madeId}`, { method: 'DELETE' }) : { status: 0 }
  const designerDeletes = madeId ? await designer.as(`/workspaces/${WS}/project-templates/${madeId}`, { method: 'DELETE' }) : { status: 0 }
  const left = madeId ? (await sql`select count(*)::int as n from project_templates where id = ${madeId}`)[0].n : -1
  chk(
    plainMakes.status === 403 && designerMakes.status < 300 && plainDeletes.status === 403 && designerDeletes.status < 300 && left === 0,
    'a plain member neither makes nor deletes a template (403 each) — the member granted template.manage makes one and deletes it',
    `plain makes ${said(plainMakes)}, deletes ${said(plainDeletes)}; designer makes ${said(designerMakes)}, deletes ${said(designerDeletes)}; ${left} left`,
  )

  // ══ 4. THE TEMPLATES PAGE ════════════════════════════════════════════════
  console.log('\n▶ the templates page’s Save as template, for the designer and for a plain member')
  browser = await (await resolveChromium()).launch(launchOptions())
  const offered = async (who) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } })
    const page = await ctx.newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', who.email)
    await page.fill('input[type=password]', who.password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    await page.goto(`${B}/app/${WS}/templates`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: 'Templates' }).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    // What the page offers waits on the person's keys.
    await waitUntil(async () => (await page.getByTestId('templates-save-open').count()) > 0, { timeoutMs: 4000 })
    const n = await page.getByTestId('templates-save-open').count().catch(() => -1)
    await ctx.close().catch(() => {})
    return n
  }
  const designerSees = await offered(designer)
  const plainSees = await offered(plain)
  chk(
    designerSees === 1 && plainSees === 0,
    'the templates page offers Save as template to the member granted template.manage, and not to a plain member',
    `designer ${designerSees}; plain ${plainSees}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
  }
  // Only now: the DELETE above goes through this proxy, and a closed one refuses it.
  stack.close()
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
