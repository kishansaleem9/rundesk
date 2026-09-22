/**
 * §G15-10 [21:49–21:54] — "pehle space hoti hai. Iske baad LIST aati hai."
 *
 * She narrates two levels and makes a List by choosing a Space. Ours forced a
 * Project in between: three mandatory dropdowns on every task-create, and a
 * Project you had to invent before you could have a list.
 *
 * WHAT IS AND IS NOT DONE, because the checks only make sense against it.
 * `lists.project_id` is still NOT NULL. 114 inner joins across 34 files reach a
 * list's workspace THROUGH its project — the resource guard among them — so a
 * list without one would 404 for everybody while quietly vanishing from search,
 * the knowledge index, notifications and reminders. The hierarchy the person
 * sees is Space → List, carried by one hidden container per space that is
 * created on demand and never listed.
 *
 * So half these checks are about the feature and half are about that container
 * staying invisible, because a container that leaks is the whole reason not to
 * do it this way.
 *
 *   node test/e2e/list-under-space.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'

const REPO = path.resolve(import.meta.dirname, '../..')
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran": a selector matching nothing reports a clean sweep. */
const EXPECTED_CHECKS = 13

const chromium = await resolveChromium()
const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  // The SENTENCE, then the reason. This printed `${bad ?? good}`, so a failing
  // check named only its reason and never itself — and for a check inside a
  // loop the reason is all a reader (or `check-break-reddened.mjs`) has to go
  // on. Seventy suites shared the line.
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` \u2014 ${bad}` : ''}`) }
}

const apiAs = (token) => async (route, init = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, {
    ...init,
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}

const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())

try {
  const login = await signInApi(API, ADMIN.email, ADMIN.password)
  const A = apiAs(login.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id
  const stamp = Date.now()
  /*
   * Its OWN space, freshly made.
   *
   * Reusing an existing one meant the hidden container was usually already
   * there from an earlier run, so `defaultContainerForSpace` returned early and
   * the creation path — the thing under test — never ran. Break-testing found
   * it: a deliberately broken container that minted a new project per list
   * passed cleanly, because no container was ever minted at all.
   */
  const space = await A('/spaces', {
    method: 'POST',
    body: { workspaceId, name: `Space-list check ${stamp}` },
  })
  const spaceId = space.data?.id
  if (!spaceId) throw new Error(`could not create a space: ${space.status} ${JSON.stringify(space.error)}`)
  /*
   * A list in an ORDINARY project in the same space, so "belongs to the space"
   * has something it must NOT include.
   *
   * `lus-3-the-space-listing-reads-every-project` makes `getListsBySpace`
   * return everything under the space and ran GREEN, because the check below
   * asked only whether the space-level list was among the rows — which it is,
   * in a listing that returns everything. A check that names only what SHOULD
   * be there cannot see a filter that has stopped filtering; the absence is
   * the claim. Fourth instance of that shape in this audit.
   *
   * STAGED BEFORE `projectsBefore` IS READ, on purpose. This project is one
   * anybody can see, so creating it after that read would make the
   * "making one did not add a Project anybody can see" check below fail
   * against a correct build — a fixture breaking a check three screens away,
   * which is the trap this document already records twice.
   */
  const ordinaryProject = await A('/projects', {
    method: 'POST', body: { spaceId, name: `Ordinary project ${stamp}` },
  })
  const projectList = ordinaryProject.data?.id
    ? await A('/lists', { method: 'POST', body: { projectId: ordinaryProject.data.id, name: `In a project ${stamp}` } })
    : { data: null }
  chk(
    !!projectList.data?.id,
    'a list can also be made the ordinary way, inside a Project',
    `could not stage a project-level list: project ${ordinaryProject.status}, list ${projectList.status}`,
  )

  const projectsBefore = (await A(`/projects/space/${spaceId}`)).data ?? []

  console.log('\n▶ §G15-10 — a List that lives in a Space')

  // ── The feature ───────────────────────────────────────────────────────────
  const made = await A('/lists', {
    method: 'POST',
    body: { spaceId, name: `Space list ${stamp}` },
  })
  chk(
    made.status < 400 && !!made.data?.id,
    'a List can be made by choosing a Space and nothing else',
    `POST /lists with only a spaceId returned ${made.status}: ${JSON.stringify(made.error)}`,
  )
  const listId = made.data?.id

  const spaceLists = (await A(`/lists/space/${spaceId}`)).data ?? []
  chk(
    spaceLists.some((l) => l.id === listId),
    'and the space can be asked for the lists that belong to it',
    `GET /lists/space returned ${spaceLists.length} rows, none of them the new one`,
  )
  chk(
    !!projectList.data?.id && !spaceLists.some((l) => l.id === projectList.data.id),
    'and it answers about the space DIRECTLY — a list inside a Project is not in it',
    `GET /lists/space returned ${JSON.stringify(spaceLists.map((l) => l.name))}, which ` +
      'includes a list that lives in a Project — the two levels have collapsed into one bag',
  )

  // ── The container stays invisible ─────────────────────────────────────────
  const projectsAfter = (await A(`/projects/space/${spaceId}`)).data ?? []
  /*
   * Two things, and the second is the one that matters.
   *
   * Counting before against after only catches a container created by THIS
   * run: with one already in the space from an earlier run, both counts
   * include it and a leak passes. Break-testing found exactly that. The check
   * that holds is identity — the container this list actually went into must
   * not be among the projects anybody is offered.
   */
  chk(
    projectsAfter.length === projectsBefore.length,
    'making one did not add a Project anybody can see',
    `projects went ${projectsBefore.length} → ${projectsAfter.length}: ${JSON.stringify(projectsAfter.map((p) => p.name))}`,
  )
  chk(
    !!made.data?.projectId &&
      !projectsAfter.some((p) => p.id === made.data.projectId),
    'and the container it really went into is offered to nobody',
    `the container ${made.data?.projectId} is listed among ${JSON.stringify(projectsAfter.map((p) => p.name))}`,
  )

  // A second list must reuse the same container, not mint another.
  const second = await A('/lists', {
    method: 'POST',
    body: { spaceId, name: `Space list two ${stamp}` },
  })
  chk(
    second.data?.projectId && second.data.projectId === made.data?.projectId,
    'a second one reuses the same container rather than making another',
    `containers: ${made.data?.projectId} vs ${second.data?.projectId}`,
  )

  // ── Not invisible: the property that makes this approach safe ─────────────
  chk(
    (await A(`/lists/${listId}`)).status === 200,
    'the list resolves through the permission guard like any other',
    'the guard could not resolve a space-level list',
  )

  const task = await A('/tasks', {
    method: 'POST',
    body: { listId, title: `Task in a space list ${stamp}` },
  })
  chk(
    task.status < 400 && (await A(`/tasks/${task.data?.id}`)).status === 200,
    'a task in it can be created and read back',
    `create ${task.status}; read ${(await A(`/tasks/${task.data?.id}`)).status}`,
  )

  /*
   * Search is the one that would betray the whole approach. A list that exists,
   * opens by URL and cannot be found is worse than one that was never made.
   */
  const hits = (await A(`/search/${workspaceId}?q=${encodeURIComponent(`Task in a space list ${stamp}`)}`)).data ?? []
  chk(
    hits.some((h) => h.id?.includes(task.data?.id) || h.title?.includes(String(stamp))),
    'and search can find what is in it',
    `search returned ${hits.length} hits, none of them the new task`,
  )

  // ── The tree ──────────────────────────────────────────────────────────────
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.goto(`${stack.base}/app/${workspaceId}/inbox`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4500)
  await page.getByTestId(`space-toggle-${spaceId}`).click().catch(() => {})
  await page.waitForTimeout(2500)

  const rows = await page.locator('[data-testid^="space-list-"]').count()
  chk(
    rows > 0,
    'the tree shows it directly under the Space, not buried in a Project',
    'a space-level list is openable by URL and absent from the sidebar',
  )
  const treeText = await page.locator('aside, nav').first().innerText().catch(() => '')
  chk(
    treeText.includes(`Space list ${stamp}`),
    'and shows it by name',
    `the tree does not name the new list`,
  )
  /*
   * The container is called "Lists" in the table so anybody reading it directly
   * can tell what it is. It must never reach a person.
   */
  chk(
    !/(^|\n)\s*Lists\s*(\n|$)/.test(treeText),
    'and never shows the container it is really in',
    'the hidden container leaked into the tree as a project',
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
  await browser.close().catch(() => {})
  stack?.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(
      `\n✗ only ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
