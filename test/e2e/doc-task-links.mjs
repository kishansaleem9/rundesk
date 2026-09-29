/**
 * §V2-10 — a task↔doc link is readable from BOTH ends.
 *
 * `[06:04]` "aap task ko kisi aur task ke saath LINK kar sakte ho — yeh
 * RELATIONSHIP se hoga; woh koi bhi document hai, kuch bhi", and `[06:15]`
 * "acha, is document ka yeh task hai" — she reads the relationship from the
 * DOCUMENT.
 *
 * Rundesk has stored `task_doc_links` since relationships shipped and read it in
 * exactly one direction: `where(taskDocLinks.taskId)`. A task knew its docs; a
 * doc knew nothing. You could link them from the task, open the doc, and see no
 * sign it had happened. Half a relationship is not a relationship.
 *
 * THE CHECK THAT IS NOT ABOUT THE FEATURE.
 *
 * Doc access is workspace membership, but a linked task can be PRIVATE. A doc
 * that lists its tasks is therefore a way to read titles you are not allowed to
 * see, unless the same visibility filter the task lists use is applied. So this
 * signs in a second, non-manager member and insists the private task is absent
 * for them while present for its owner — a check that passes trivially if you
 * forget to link anything, which is why it also asserts the PUBLIC one IS
 * visible to that same person.
 *
 * AND THE PANEL, which this suite did not look at until §V2-10 was re-audited.
 * It checked the API from both ends, thoroughly, and never opened a browser —
 * so the fact that frame `06:10`'s Related Items panel did not exist went
 * unnoticed while the item was marked complete. An API-only suite cannot tell
 * you a screen is missing.
 *
 *   node test/e2e/doc-task-links.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 13

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
    ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}

const REPO = path.resolve(import.meta.dirname, '../..')
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))
const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())

/*
 * TIDY-UP RUNS WHATEVER HAPPENED.
 *
 * These three deletes — two tasks and a signed-up member — used to sit at the
 * end of the `try`, after all thirteen checks, so any run that threw earlier
 * left them behind. This suite signs a person up and puts them in a real
 * workspace, and `request-access` already showed what accumulating those
 * costs: `ui-sweep`'s reports-to picker failed on ten identically-named
 * people. Break-testing makes it bite, because a patch's whole job is to make
 * a run fail.
 *
 * Each step is pushed as it becomes possible, so a run that dies half way
 * removes exactly what it had made by then.
 */
const cleanup = []

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id
  const stamp = Date.now()

  const spaces = (await A(`/spaces/workspace/${workspaceId}`)).data ?? []
  let listId = null
  for (const s of spaces) {
    for (const p of (await A(`/projects/space/${s.id}`)).data ?? []) {
      const ls = (await A(`/lists/project/${p.id}`)).data ?? []
      if (ls[0]?.id) { listId = ls[0].id; break }
    }
    if (listId) break
  }
  if (!listId) throw new Error('no list to make tasks in')

  const doc = (await A(`/workspaces/${workspaceId}/docs`, {
    method: 'POST', body: { title: `Link doc ${stamp}` },
  })).data
  const other = (await A(`/workspaces/${workspaceId}/docs`, {
    method: 'POST', body: { title: `Unlinked doc ${stamp}` },
  })).data
  if (!doc?.id || !other?.id) throw new Error('could not make docs')

  const open = (await A('/tasks', { method: 'POST', body: { listId, title: `Public linked ${stamp}` } })).data
  const secret = (await A('/tasks', { method: 'POST', body: { listId, title: `Private linked ${stamp}` } })).data
  cleanup.push(() => A(`/tasks/${open.id}`, { method: 'DELETE' }))
  cleanup.push(() => A(`/tasks/${secret.id}`, { method: 'DELETE' }))
  await A(`/tasks/${secret.id}`, { method: 'PATCH', body: { visibility: 'private' } })

  console.log('\n▶ §V2-10 — the doc end of the link')
  const linkA = await A(`/tasks/${open.id}/linked-docs`, { method: 'POST', body: { docId: doc.id } })
  const linkB = await A(`/tasks/${secret.id}/linked-docs`, { method: 'POST', body: { docId: doc.id } })
  chk(linkA.status < 400 && linkB.status < 400, 'a task can be linked to a doc',
    `linking returned ${linkA.status} / ${linkB.status}`)

  const fromTask = (await A(`/tasks/${open.id}/linked-docs`)).data ?? []
  chk(fromTask.some((d) => d.docId === doc.id), 'and the task shows the doc (this half already worked)',
    `the task lists ${JSON.stringify(fromTask.map((d) => d.title))}`)

  const fromDoc = (await A(`/docs/${doc.id}/tasks`)).data ?? []
  chk(
    fromDoc.some((r) => r.taskId === open.id),
    'and now the DOC shows the task',
    `GET /docs/:id/tasks returned ${JSON.stringify(fromDoc.map((r) => r.title))}`,
  )

  /*
   * The control. Without it, a build that answers "every task in the workspace"
   * passes the check above — the linked one would be in that list too.
   */
  const fromOther = (await A(`/docs/${other.id}/tasks`)).data ?? []
  chk(
    fromOther.length === 0,
    'a doc with no links shows none',
    `an unlinked doc listed ${fromOther.length} task(s): ${JSON.stringify(fromOther.map((r) => r.title))}`,
  )

  // ── Visibility ────────────────────────────────────────────────────────────
  console.log('\n▶ and it does not become a way to read private titles')
  const outsider = { email: `docpeer-${stamp}@rundesk.invalid`, password: 'Member@12345!' }
  const signup = await apiAs(null)('/auth/signup', {
    method: 'POST',
    body: {
      fullName: `Doc Peer ${stamp}`,
      email: outsider.email,
      password: outsider.password,
      organizationName: `DocPeer ${stamp}`,
      organizationSlug: `docpeer-${stamp}`,
    },
  })
  if (!signup.data?.accessToken) throw new Error(`signup failed: ${signup.status}`)
  cleanup.push(() => A(`/workspaces/${workspaceId}/members/${signup.data.user?.id}`, { method: 'DELETE' }))
  const added = await A(`/workspaces/${workspaceId}/members`, {
    method: 'POST', body: { email: outsider.email, role: 'member' },
  })
  chk(added.status < 400, 'a plain member can be put in the workspace',
    `addMember returned ${added.status}`)

  const B = apiAs(signup.data.accessToken)
  const peerSees = (await B(`/docs/${doc.id}/tasks`)).data ?? []
  const titles = peerSees.map((r) => r.title)
  chk(
    titles.includes(`Public linked ${stamp}`),
    'a member sees the public task on the doc',
    `the member saw ${JSON.stringify(titles)} — if this is empty the next check proves nothing`,
  )
  chk(
    !titles.includes(`Private linked ${stamp}`),
    'and NOT the private one they were never allowed to read',
    `a private task leaked through the doc: ${JSON.stringify(titles)}`,
  )
  chk(
    (await B(`/docs/${doc.id}/tasks`)).status < 400,
    'while the doc itself stays readable to them',
    'a member could not read the linked tasks of a doc in their own workspace',
  )

  // ── §V2-10 frame `06:10` — the panel, which is where this item was closed
  //    on a different deliverable ─────────────────────────────────────────
  /*
   * Rundesk had both halves and neither was in one place: task↔task links in a
   * tab, task↔doc links in a section hundreds of lines further down the same
   * sheet, under a different heading and with its own add flow. The frame is
   * ONE panel with two tabs.
   */
  console.log('\n▶ §V2-10 — Related Items is one panel with two tabs')
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })

  const openTask = (await A(`/tasks/${open.id}`)).data
  await page.goto(
    `${stack.base}/app/${workspaceId}/${openTask.spaceId}/${openTask.projectId}/${openTask.listId}?task=${open.id}`,
    { waitUntil: 'domcontentloaded' },
  )
  await page.getByTestId('task-tab-dependencies').click({ timeout: 20_000 })

  const panelShown = await waitUntil(
    () => page.getByTestId('related-items-panel').isVisible().catch(() => false),
    { timeoutMs: 20_000 },
  )
  chk(
    panelShown,
    'the task has a Related Items panel',
    'no Related Items panel — the frame shows one, and this item was marked done having ' +
      'built the doc-side backlink instead',
  )
  chk(
    panelShown && (await page.getByTestId('related-tab-relationships').isVisible().catch(() => false)),
    'with a Relationships tab',
    'the Relationships tab is missing',
  )
  chk(
    panelShown && (await page.getByTestId('related-tab-references').isVisible().catch(() => false)),
    'and a References tab beside it',
    'there is no References tab — the frame shows two, and Rundesk had task links and doc ' +
      'links in two unrelated places instead',
  )

  /*
   * THE TABS MUST SHOW DIFFERENT THINGS. Two tabs over one list would be the
   * panel as decoration. Relationships is task↔task, References is task↔doc,
   * and the doc linked earlier in this suite is the evidence for the second.
   */
  await page.getByTestId('related-tab-references').click({ timeout: 8000 }).catch(() => {})
  const docShown = await waitUntil(async () => {
    const body = await page.getByTestId('related-items-panel').filter({ visible: true }).innerText().catch(() => '')
    return body.includes(`Link doc ${stamp}`)
  }, { timeoutMs: 15_000 })
  chk(
    docShown,
    'and References carries the doc this task is linked to',
    `the References tab did not name the linked doc — it read ` +
      `${JSON.stringify((await page.getByTestId('related-items-panel').innerText().catch(() => '')).slice(0, 120))}`,
  )
  await page.getByTestId('related-tab-relationships').click({ timeout: 8000 }).catch(() => {})
  const backToTasks = await waitUntil(async () => {
    // Unfiltered: an absence, where a hidden panel read whole is the stricter read.
    const body = await page.getByTestId('related-items-panel').innerText().catch(() => '') // text-read: absence — the doc is not listed here
    return !body.includes(`Link doc ${stamp}`)
  }, { timeoutMs: 15_000 })
  chk(
    backToTasks,
    'while Relationships does not — the two tabs are not one list twice',
    'the doc was still listed under Relationships, so the tabs show the same thing',
  )

} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
  // Newest first, so a task goes before the member who could see it. Each is a
  // DELETE: gone, or already gone (404), is fine; anything else is left behind,
  // and said above the totals by the call that did not do it.
  for (const fn of cleanup.reverse()) {
    const what = String(fn).replace(/^\(\) => /, '')
    try {
      const res = await fn()
      if (![200, 204, 404].includes(res.status)) console.log(`  cleanup left behind: ${what} answered ${res.status}`)
    } catch (err) {
      console.log(`  cleanup left behind: ${what} got no answer (${err?.message ?? err})`)
    }
  }
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
