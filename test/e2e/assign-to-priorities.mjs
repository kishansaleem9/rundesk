/**
 * §V2-S16 — THE ASSIGN → PRIORITIES CHAIN, frames `15:50`–`16:05`.
 *
 * The walkthrough's own words for it are the `[15:47]`–`[16:19]` chain, and it
 * has four links:
 *
 *   `15:50`  assigning offers: "Add this task to … priorities?" with
 *            **Don't ask again** / **Add to priorities →**
 *   `15:55`  a toast, "Task added to your Priorities.", with **Open Priorities**
 *   `16:05`  the task is sitting in the Planner's Priorities rail, with a Done
 *            button and a "1 Priority" counter
 *
 * Rundesk had none of the four. Assigning wrote an assignee and stopped.
 *
 * AND FOR A COLLEAGUE (`ledger-rows/row-850`). The frame's prompt names the
 * assignee ("…to Hamda Tahir's priorities?") and the toast that follows says
 * "your Priorities" — she was assigning to herself — and this suite first held
 * the prompt to that: assigning a teammate had to raise nothing, because the
 * only write took no `:userId` and filling a colleague's day was a permission
 * the product had not given. ClickUp settles what the frame could not (help
 * centre, "Personal Priorities", formerly LineUp): "Members, Admins, and
 * Owners can add tasks to other people's priorities", assigning asks "Add this
 * task to <assignee>'s priorities?", and the owner's list shows who added each
 * task. So assigning a teammate offers THEIR priorities, by name, and the
 * later sections follow that write to the teammate:
 *
 *   · read back AS THEM, by id, with who added it — and not on yours;
 *   · in the panel the toast's link opens, and in their own Planner, "Added
 *     by" and the assigner's name;
 *   · held by the server whatever a client sends: a guest is refused (403),
 *     so is a task the teammate cannot open (403) and somebody who is not in
 *     the workspace (404); a second add answers with the row that is there;
 *     and the row is the teammate's — whoever added it cannot take it off.
 *
 * WHAT MAKES THE CHAIN EASY TO FAKE. Each link photographs fine on its own — a
 * prompt that appears, a toast that says a thing happened, a rail with a row in
 * it. So every check here crosses a boundary: the prompt is followed to the
 * server, the toast's link is followed to the Planner, and the rail is read for
 * THAT task rather than for any row at all.
 *
 *   node test/e2e/assign-to-priorities.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil, readText } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 28

const REPO = path.resolve(import.meta.dirname, '../..')
const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ME = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}
/** The teammate's, the guest's and the outsider's. */
const PERSON_PASSWORD = 'Teammate@123!'

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

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())
let sql = null
const TAG = `e2e-a2p-${Date.now()}`
let A = null
let workspaceId = null
const myPriorities = () => A(`/workspaces/${workspaceId}/priorities`)

try {
  const auth = await signInApi(API, ME.email, ME.password)
  A = apiAs(auth.accessToken)
  const me = (await A('/users/me')).data
  /*
   * ITS OWN WORKSPACE, so the fixture is two people rather than whatever the
   * shared one has accumulated. When this was written the assignee control was
   * a row of the first EIGHT members with no search, and the shared workspace
   * had seventy-odd — so "click your own chip" was a bet on sort order. §V2-S17
   * gave the picker a search box; the isolation is kept because a fixture that
   * depends on other suites' leftovers is a fixture that fails on its own.
   */
  const madeWorkspace = await A('/workspaces', {
    method: 'POST',
    body: { name: `WS ${TAG}` },
  })
  workspaceId = madeWorkspace.data?.id
  if (!workspaceId) throw new Error(`could not create a workspace: ${JSON.stringify(madeWorkspace.error)}`)

  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — this suite stages tasks directly')

  for (const p of (await myPriorities()).data ?? []) {
    await A(`/workspaces/${workspaceId}/priorities/${p.id}`, { method: 'DELETE' })
  }

  const [space] = await sql`
    insert into spaces (workspace_id, name) values (${workspaceId}, ${`Space ${TAG}`}) returning id`
  const [project] = await sql`
    insert into projects (space_id, name) values (${space.id}, ${`Project ${TAG}`}) returning id`
  const [list] = await sql`
    insert into lists (project_id, name) values (${project.id}, ${`List ${TAG}`}) returning id`
  const [task] = await sql`
    insert into tasks (list_id, title) values (${list.id}, ${`Chain subject ${TAG}`}) returning id`
  const [other] = await sql`
    insert into tasks (list_id, title) values (${list.id}, ${`Teammate subject ${TAG}`}) returning id`
  const [muteTask] = await sql`
    insert into tasks (list_id, title) values (${list.id}, ${`Mute subject ${TAG}`}) returning id`
  const [afterMuteTask] = await sql`
    insert into tasks (list_id, title) values (${list.id}, ${`After mute ${TAG}`}) returning id`
  /* Added to somebody's priorities from its Priority field, not by assigning. */
  /* How many rows a person's list holds for one task, read in the database itself. */
  const rowsForTask = async (userId, taskId) =>
    (await sql`
      select count(*)::int as n from user_priorities
      where user_id = ${userId} and workspace_id = ${workspaceId} and task_id = ${taskId}`)[0].n
  const [fieldTask] = await sql`
    insert into tasks (list_id, title) values (${list.id}, ${`Priority field ${TAG}`}) returning id`

  /*
   * PEOPLE, EACH WITH A SESSION OF THEIR OWN. `POST /auth/register` answers
   * with one, so reading as the teammate and being refused as the guest cost
   * nothing out of the login route's ten a minute (`lib/signin.mjs`).
   */
  const register = async (label) => {
    const email = `${label.toLowerCase()}-${Date.now()}@rundesk.invalid`
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, displayName: `${label} ${TAG}`, password: PERSON_PASSWORD }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok || !body?.data?.accessToken) throw new Error(`could not register the ${label}: ${res.status}`)
    return { email, id: body.data.user?.id, as: apiAs(body.data.accessToken) }
  }
  const join = async (who, role) => {
    const added = await A(`/workspaces/${workspaceId}/members`, { method: 'POST', body: { email: who.email, role } })
    if (added.status >= 300) throw new Error(`could not add ${who.email} as ${role}: ${added.status} ${JSON.stringify(added.error)}`)
  }

  /* A second real person, whose priorities the colleague half fills. */
  const mate = await register('Mate')
  await join(mate, 'member')
  const mateEmail = mate.email
  const mateId = ((await A(`/workspaces/${workspaceId}/members`)).data ?? [])
    .find((m) => m.email === mateEmail)?.userId
  if (!mateId) throw new Error('the teammate did not join the workspace')
  const M = mate.as
  const theirPriorities = () => M(`/workspaces/${workspaceId}/priorities`)

  /*
   * A GUEST WHO MAY OPEN THE TASK, so the only thing refusing them is being a
   * guest: the space is shared with them to view (`guest-reach.ts`).
   */
  const guest = await register('Guest')
  await join(guest, 'guest')
  await sql`insert into space_members (space_id, user_id, role) values (${space.id}, ${guest.id}, 'view')`
  /* Somebody in no part of this workspace. */
  const outsider = await register('Outsider')
  /* A task the assigner may open and the teammate may not: private, the admin's, on nobody. */
  const [hidden] = await sql`
    insert into tasks (list_id, title, visibility, created_by_id)
    values (${list.id}, ${`Hidden from the teammate ${TAG}`}, 'private', ${me.id}) returning id`
  /*
   * And one the server's own checks add through the route, so a second add and
   * a removal stand on a row of their own rather than on the prompt's — a
   * defect in the prompt is then not counted again down there.
   */
  const [routed] = await sql`
    insert into tasks (list_id, title) values (${list.id}, ${`Added through the route ${TAG}`}) returning id`

  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })

  /*
   * The privacy banner sits bottom-right and swallows clicks meant for what is
   * behind it. Dismissed the way a person dismisses it rather than hidden with
   * CSS, so the app is in the state it is actually used in.
   */
  const settleCookies = async () => {
    const accept = page.locator('button:has-text("Accept")').first()
    if (await accept.isVisible().catch(() => false)) await accept.click().catch(() => {})
  }
  await settleCookies()

  const openTask = async (id) => {
    await page.goto(
      `${stack.base}/app/${workspaceId}/${space.id}/${project.id}/${list.id}?task=${id}`,
      { waitUntil: 'domcontentloaded' },
    )
    await waitIty()
    await settleCookies()
  }
  const waitIty = () =>
    waitUntil(() => page.getByTestId('task-tab-overview').isVisible().catch(() => false), {
      timeoutMs: 25_000,
    })

  /*
   * §V2-S17 moved assignment behind a picker with a search box, so the member
   * rows exist only once it is open. By user id rather than display name: a
   * name match is a bet on where somebody sorts.
   */
  const assignChip = async (userId) => {
    const row = page.getByTestId(`assign-member-${userId}`)
    if (!(await row.isVisible().catch(() => false))) {
      await page.getByTestId('assignee-picker-open').click({ timeout: 20_000 })
      await waitUntil(() => row.isVisible().catch(() => false), { timeoutMs: 10_000 })
    }
    return row
  }

  await openTask(task.id)

  // -------------------------------------------------------------------------
  console.log('\n▶ frame `15:50` — assigning yourself offers the priority')

  await (await assignChip(me.id)).click({ timeout: 20_000 })
  chk(
    await waitUntil(
      () => page.getByTestId('priority-prompt').isVisible().catch(() => false),
      { timeoutMs: 15_000 },
    ),
    'assigning the task to yourself raises the prompt',
    'nothing was offered — assigning writes an assignee and the chain stops there',
  )

  const promptText = await readText(page.getByTestId('priority-prompt').filter({ visible: true }))
  chk(
    /priorit/i.test(promptText) &&
      /don.t ask again/i.test(promptText),
    'and it offers both ways out the frame shows',
    `the prompt read: ${promptText}`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ frame `15:55` — taking it reaches the server, and says where it went')

  // Bounded and caught: `a2p-5-assigning-writes-an-assignee-and-stops` leaves
  // the prompt without its Add control, and this press waited out the default
  // thirty seconds and ended the run at 3 of 10.
  await page.getByTestId('priority-prompt-add').click({ timeout: 8000 }).catch(() => {})

  /*
   * THE TOAST IS READ FIRST, and its text captured immediately. A toast lives
   * about four seconds; asserting it after a fifteen-second poll of the server
   * means a failure anywhere earlier reports as "no toast" too, and three
   * checks then describe one bug.
   */
  const toast = page.locator('[data-sonner-toast]').first()
  chk(
    await waitUntil(() => toast.isVisible().catch(() => false), { timeoutMs: 10_000 }),
    'a toast confirms it',
    'the write happened silently — the frame shows a confirmation',
  )
  const toastText = (await readText(toast.filter({ visible: true }))).toLowerCase()
  chk(
    toastText.includes('priorities') && /open priorities/i.test(toastText),
    'and the toast offers to open Priorities',
    `the toast read: ${toastText} — "added" with no way to look is a claim taken on trust`,
  )

  /*
   * THE TOAST IS PRESSED BEFORE THE SERVER IS POLLED, and the order is the
   * check's own comment finally applied all the way.
   *
   * It already said "a toast lives about four seconds; asserting it after a
   * fifteen-second poll of the server means a failure anywhere earlier reports
   * as 'no toast' too" — and it moved the toast's TEXT above the poll and left
   * the toast's CLICK below it. So any patch that makes the poll time out also
   * kills the three checks after it: `a2p-3-priority-copies-the-title` was
   * predicted to redden one check and reddened two, stopping the run at 6 of
   * 10, because the fifteen seconds spent not finding the priority outlived
   * the toast it then tried to press.
   *
   * Pressing it first costs nothing — the server poll does not need the page,
   * and the rail read below needs the navigation this click performs.
   */
  console.log('\n▶ frame `16:05` — the link lands on the rail, with the task in it')

  // The cascade's next step. Bounding `priority-prompt-add` above moved the
  // thirty seconds here: `a2p-5-assigning-writes-an-assignee-and-stops` means
  // no priority is written, so the toast that would offer to undo never
  // appears. 3 of 10 became 5 of 10; this is the rest of it.
  await toast.getByRole('button').first().click({ timeout: 8000 }).catch(() => {})
  chk(
    await waitUntil(() => /\/calendar$/.test(page.url()), { timeoutMs: 15_000 }),
    'the link goes to the Planner',
    `it ended up at ${page.url()}`,
  )

  let stored = []
  chk(
    await waitUntil(async () => {
      stored = (await myPriorities()).data ?? []
      return stored.some((p) => p.taskId === task.id)
    }, { timeoutMs: 15_000 }),
    'the task is on your priorities, by id — not a copy of its title',
    `the priorities list held: ${stored.map((p) => `${p.title}(${p.taskId ?? 'no task'})`).join(' | ') || '(empty)'}`,
  )
  const railText = await readText(page.getByTestId('planner-priorities').filter({ visible: true }))
  chk(
    railText.includes(`Chain subject ${TAG}`),
    'and THAT task is in the Priorities rail',
    `the rail held: ${railText.slice(0, 160)}`,
  )
  chk(
    /\b1\b/.test(await readText(page.getByTestId('planner-priority-count').filter({ visible: true }))),
    'with the counter the frame shows',
    `the counter read "${await readText(page.getByTestId('planner-priority-count'))}"`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ "Don\'t ask again" is a preference, not a dismiss button')

  /*
   * Without this check the mute button is a label: it closes the prompt, which
   * is what dismissing does anyway, and the difference only shows on the NEXT
   * assignment. So the check is on a different task, after a full page load.
   */
  await openTask(muteTask.id)
  await (await assignChip(me.id)).click({ timeout: 20_000 })
  await waitUntil(
    () => page.getByTestId('priority-prompt').isVisible().catch(() => false),
    { timeoutMs: 15_000 },
  )
  // Bounded and caught: what stands above it — a check, or a gate whose answer
  // nobody reads — is allowed to fail, so this has to report rather than throw.
  // Bounding one step and leaving the next unbounded only moves the thirty
  // seconds one line down (ledger §10).
  await page.getByTestId('priority-prompt-mute').click({ timeout: 8000 }).catch(() => {})

  await openTask(afterMuteTask.id)
  await (await assignChip(me.id)).click({ timeout: 20_000 })
  await page.waitForTimeout(1500)
  chk(
    !(await page.getByTestId('priority-prompt').isVisible().catch(() => false)),
    'after "Don\'t ask again", assigning stops offering',
    'the prompt came back on the next task — the button dismissed it and remembered nothing',
  )

  // Un-mute, so the last check below is not passing for the wrong reason.
  await page.evaluate(() => window.localStorage.removeItem('rundesk.priorityPromptOff'))

  // -------------------------------------------------------------------------
  console.log('\n▶ assigning a teammate offers THEIR priorities, by name (`ledger-rows/row-850`)')

  /*
   * The prompt is un-muted above, so what decides here is who was assigned.
   * It used to be checked that nothing appeared; ClickUp's prompt asks about
   * "the assigned member's priorities", and so does this one.
   */
  await openTask(other.id)
  await (await assignChip(mateId)).click({ timeout: 20_000 })
  chk(
    await waitUntil(
      () => page.getByTestId('priority-prompt').isVisible().catch(() => false),
      { timeoutMs: 15_000 },
    ),
    'assigning a teammate offers too',
    'nothing was offered — the colleague half of the chain is still refused',
  )
  const theirPrompt = await readText(page.getByTestId('priority-prompt').filter({ visible: true }))
  chk(
    theirPrompt.includes(`Mate ${TAG}'s priorities`),
    'and it names them: "Add this task to <their name>\'s priorities?"',
    `the prompt read: ${theirPrompt}`,
  )

  // Bounded and caught, as the first half's press is: what follows reports.
  await page.getByTestId('priority-prompt-add').click({ timeout: 8000 }).catch(() => {})

  /*
   * The toast first, while it lives — the first half's reason, again — and
   * read the moment it shows. Waiting for the RIGHT words instead let a toast
   * with the wrong ones expire under the wait, and its link then went
   * unpressed: `acp-4` (the toast says "your") reddened the panel check below
   * as well as this one on its first run.
   */
  const theirToast = page.locator('[data-sonner-toast]').first()
  const theirToastShown = await waitUntil(() => theirToast.isVisible().catch(() => false), { timeoutMs: 10_000 })
  const theirToastText = theirToastShown ? await readText(theirToast, { timeoutMs: 2000 }) : ''
  chk(
    theirToastText.includes(`Mate ${TAG}`),
    'the toast says whose priorities it went on',
    `the toast read: ${theirToastText || '(no toast)'} — "your Priorities" would be a sentence about somebody else`,
  )
  // Its link is pressed before the server is polled, for the same reason.
  await theirToast.getByRole('button').first().click({ timeout: 8000 }).catch(() => {})

  let theirs = []
  chk(
    await waitUntil(async () => {
      theirs = (await theirPriorities()).data ?? []
      return theirs.some((p) => p.taskId === other.id)
    }, { timeoutMs: 15_000 }),
    'the task is on THEIR priorities, read back as them, by id',
    `their list held: ${theirs.map((p) => `${p.title}(${p.taskId ?? 'no task'})`).join(' | ') || '(empty)'}`,
  )
  const theirEntry = theirs.find((p) => p.taskId === other.id)
  chk(
    theirEntry?.addedBy?.id === me.id,
    'and it says who added it: the one who assigned it',
    `the entry's addedBy read ${JSON.stringify(theirEntry?.addedBy ?? null)}`,
  )
  /*
   * Only once it IS on theirs: with nothing written anywhere, "not on yours"
   * holds for a build that has no colleague half at all.
   */
  const mineAfter = (await myPriorities()).data ?? []
  chk(
    !!theirEntry && !mineAfter.some((p) => p.taskId === other.id),
    'and it is not on yours',
    !theirEntry && mineAfter.some((p) => p.taskId === other.id)
      ? 'it went onto the assigner\'s own list while the prompt named the teammate'
      : theirEntry
        ? 'the teammate\'s task was written onto the assigner\'s own list as well'
        : 'it is on nobody\'s list — the write never reached the teammate',
  )

  /*
   * The toast's link opens the teammate, whose panel starts on their
   * priorities. Read by the entry's own id, so it is THAT row saying who.
   */
  let panelSays = ''
  chk(
    await waitUntil(async () => {
      panelSays = await readText(page.getByTestId(`priority-added-by-${theirEntry?.id}`).filter({ visible: true }), { timeoutMs: 1000 })
      return panelSays.includes(me.displayName)
    }, { timeoutMs: 15_000 }),
    'the toast\'s link opens their priorities, where the task says who added it',
    `the panel's row read "${panelSays}"${theirEntry ? '' : ' — there was no entry to read'}`,
  )
  /*
   * AND WHEN, DRAWN. ClickUp's expanded Priorities has "Added at" beside "Added
   * by". This was a hover title, which a touch screen never shows
   * (`found-29-sep/priority-added-at-on-hover-only`). The time drawn has to be
   * the entry's own: its `datetime` is the server's `createdAt` for that row.
   */
  const whenOf = async (at) => ({
    text: (await readText(at.filter({ visible: true }), { timeoutMs: 1000 })).trim(),
    at: await at.getAttribute('datetime', { timeout: 1000 }).catch(() => null),
  })
  let panelWhen = null
  chk(
    await waitUntil(async () => {
      panelWhen = await whenOf(page.getByTestId(`priority-added-at-${theirEntry?.id}`))
      return panelWhen.text.length > 0 && !!theirEntry?.createdAt && panelWhen.at === theirEntry.createdAt
    }, { timeoutMs: 10_000 }),
    'and when it was added, drawn beside who rather than left to a hover',
    `the panel's time read ${JSON.stringify(panelWhen)}; the entry was added at ${theirEntry?.createdAt ?? 'no time'}`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ the task\'s Priority field adds it to somebody\'s priorities, as ClickUp\'s does')

  /*
   * `found-29-sep/priority-field-adds-to-nobody-else`. ClickUp: "click on the
   * Priority field for a task, click an avatar (your avatar is always displayed
   * on the left), and search or select a user". Assigning was the only way in.
   * Read from the server, by this task's id, as the prompt's checks are.
   */
  await openTask(fieldTask.id)
  const openPeople = async () => {
    await page.getByTestId('priority-add-person').click({ timeout: 8000 }).catch(() => {})
    await page.getByTestId('priority-people').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  }
  await openPeople()
  const offeredIds = await page
    .getByTestId('priority-people')
    .filter({ visible: true })
    .locator('[data-testid^="priority-person-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')?.slice('priority-person-'.length)))
    .catch(() => [])
  chk(
    offeredIds[0] === me.id && offeredIds.includes(mateId),
    'the Priority field offers Personal Priorities by person, yours first, then your colleagues',
    `it offered ${JSON.stringify(offeredIds)}; you are ${me.id}, the teammate ${mateId}`,
  )
  await page.getByTestId(`priority-person-${mateId}`).click({ timeout: 8000 }).catch(() => {})
  const onTheirs = async () =>
    (await sql`select added_by_id from user_priorities
      where user_id = ${mateId} and workspace_id = ${workspaceId} and task_id = ${fieldTask.id}`)[0] ?? null
  let theirFieldRow = null
  await waitUntil(async () => !!(theirFieldRow = await onTheirs()), { timeoutMs: 10_000 })
  chk(
    !!theirFieldRow && theirFieldRow.added_by_id === me.id && (await rowsForTask(me.id, fieldTask.id)) === 0,
    'choosing a colleague there puts the task on their priorities, as added by you, and not on yours',
    theirFieldRow
      ? `their row says it was added by ${theirFieldRow.added_by_id === me.id ? 'you' : theirFieldRow.added_by_id}; ` +
        `your list holds it ${await rowsForTask(me.id, fieldTask.id)} time(s)`
      : 'nothing reached their list',
  )
  await openPeople()
  await page.getByTestId(`priority-person-${me.id}`).click({ timeout: 8000 }).catch(() => {})
  await waitUntil(async () => (await rowsForTask(me.id, fieldTask.id)) === 1, { timeoutMs: 10_000 })
  chk(
    (await rowsForTask(me.id, fieldTask.id)) === 1,
    'and choosing yourself puts it on yours',
    `your list holds it ${await rowsForTask(me.id, fieldTask.id)} time(s)`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ and the teammate, in their own Planner, sees who put it there')

  /*
   * Signed in as them, through the form — the proxy in `lib/local-stack.mjs`
   * waits out a throttled login. Each step is bounded and caught, so a
   * sign-in that fails is the check below failing in its own words, and the
   * server's rules after it still run.
   */
  const mateContext = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  const matePage = await mateContext.newPage()
  await matePage.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await matePage.fill('input[type=email]', mateEmail, { timeout: 15_000 }).catch(() => {})
  await matePage.fill('input[type=password]', PERSON_PASSWORD, { timeout: 15_000 }).catch(() => {})
  await matePage.click('button[type=submit]', { timeout: 15_000 }).catch(() => {})
  await matePage.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS }).catch(() => {})
  await matePage.goto(`${stack.base}/app/${workspaceId}/calendar`, { waitUntil: 'domcontentloaded' })
  const theirRow = matePage.getByTestId('planner-priority-item').filter({ hasText: `Teammate subject ${TAG}` })
  let railSays = ''
  chk(
    await waitUntil(async () => {
      railSays = await readText(theirRow.getByTestId('planner-priority-added-by').filter({ visible: true }), { timeoutMs: 1000 })
      return /added by/i.test(railSays) && railSays.includes(me.displayName)
    }, { timeoutMs: 20_000 }),
    'in their Planner\'s Priorities, the task says "Added by" and who',
    `the row's label read "${railSays}"`,
  )
  let railWhen = null
  chk(
    await waitUntil(async () => {
      railWhen = await whenOf(theirRow.getByTestId('planner-priority-added-at'))
      return railWhen.text.length > 0 && !!theirEntry?.createdAt && railWhen.at === theirEntry.createdAt
    }, { timeoutMs: 10_000 }),
    'and when, drawn in the rail as well',
    `the rail's time read ${JSON.stringify(railWhen)}; the entry was added at ${theirEntry?.createdAt ?? 'no time'}`,
  )
  await mateContext.close().catch(() => {})

  // -------------------------------------------------------------------------
  console.log('\n▶ the server holds the rules, whatever a client sends')

  /* How many rows this person's list holds for one task, read in the database itself. */
  const rowsFor = async (userId, taskId) =>
    (await sql`
      select count(*)::int as n from user_priorities
      where user_id = ${userId} and workspace_id = ${workspaceId} and task_id = ${taskId}`)[0].n
  const addFor = (as, userId, taskId) =>
    as(`/workspaces/${workspaceId}/people/${userId}/priorities`, { method: 'POST', body: { taskId } })
  /*
   * A refusal is its status AND its sentence: a route that does not exist
   * answers 404 as well, and said nothing about anybody's membership.
   */
  const says = (res, pattern) => pattern.test(res.error?.message ?? '')

  const byGuest = await addFor(guest.as, mateId, task.id)
  chk(
    byGuest.status === 403 && says(byGuest, /guest/i) && (await rowsFor(mateId, task.id)) === 0,
    'a guest may not add to a colleague\'s priorities (403), though the task is open to them',
    `the guest's add answered ${byGuest.status} ${JSON.stringify(byGuest.error?.message ?? null)}`,
  )

  const unreadable = await addFor(A, mateId, hidden.id)
  chk(
    unreadable.status === 403 && says(unreadable, /cannot open this task/i) && (await rowsFor(mateId, hidden.id)) === 0,
    'nor may anybody add a task the colleague cannot open (403)',
    `adding the private task answered ${unreadable.status} ${JSON.stringify(unreadable.error?.message ?? null)}`,
  )

  const stranger = await addFor(A, outsider.id, task.id)
  chk(
    stranger.status === 404 && says(stranger, /not in this workspace/i) && (await rowsFor(outsider.id, task.id)) === 0,
    'nor add to somebody who is not in the workspace (404)',
    `adding for the outsider answered ${stranger.status} ${JSON.stringify(stranger.error?.message ?? null)}`,
  )

  const once = await addFor(A, mateId, routed.id)
  const again = await addFor(A, mateId, routed.id)
  const rowsAfterAgain = await rowsFor(mateId, routed.id)
  chk(
    once.status < 300 && again.status < 300 && !!once.data?.id && again.data?.id === once.data.id && rowsAfterAgain === 1,
    'adding it again answers with the same entry, and their list still holds one row for it',
    `the adds answered ${once.status} then ${again.status}, with ${once.data?.id ?? 'nothing'} then ` +
      `${again.data?.id ?? 'nothing'}; ${rowsAfterAgain} row(s) for the task`,
  )

  const pulled = once.data?.id
    ? await A(`/workspaces/${workspaceId}/priorities/${once.data.id}`, { method: 'DELETE' })
    : { status: 0 }
  const rowsAfterPull = await rowsFor(mateId, routed.id)
  chk(
    pulled.status === 404 && rowsAfterPull === 1,
    'and it is theirs now: the one who added it cannot take it off (404)',
    `the adder's DELETE answered ${pulled.status}; ${rowsAfterPull} row(s) left for the task`,
  )

  /*
   * TICKED OFF, IT HAS LEFT THEIR RAIL, so adding it again puts it back
   * (`found-29-sep/priority-readd-answers-a-ticked-off-row`). The add answered
   * with the done row, so the toast said "added" and the task stayed off the
   * rail. It has to come back open, at the end of their list, as added by
   * whoever put it back, and still as one row. Put back by its owner, whose
   * own add it was not, so "who" has to change for the check to pass.
   */
  const ticked = once.data?.id
    ? await M(`/workspaces/${workspaceId}/priorities/${once.data.id}`, { method: 'PATCH', body: { done: true } })
    : { status: 0 }
  const putBack = await M(`/workspaces/${workspaceId}/priorities`, { method: 'POST', body: { taskId: routed.id } })
  const [back] = await sql`
    select done_at, position, added_by_id from user_priorities
    where user_id = ${mateId} and workspace_id = ${workspaceId} and task_id = ${routed.id}`
  const [{ last }] = await sql`
    select max(position)::int as last from user_priorities
    where user_id = ${mateId} and workspace_id = ${workspaceId}`
  const rowsAfterPutBack = await rowsFor(mateId, routed.id)
  chk(
    ticked.status < 300 && putBack.status < 300 && !!back && back.done_at === null && back.position === last &&
      back.added_by_id === mateId && rowsAfterPutBack === 1,
    'a task they ticked off, added again, is back on their open list, at the end, as added by whoever put it back',
    `ticking it off answered ${ticked.status}, adding it again ${putBack.status}; the row is ` +
      `${back ? `${back.done_at === null ? 'open' : 'still done'}, at ${back.position} of ${last}, added by ${back.added_by_id === mateId ? 'the one who put it back' : back.added_by_id === me.id ? 'the first adder still' : back.added_by_id}` : 'gone'}` +
      `; ${rowsAfterPutBack} row(s) for the task`,
  )
} catch (err) {
  failed += 1
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err)
} finally {
  // Gone, or already gone (404), is fine; any other answer, or none, leaves a
  // priority behind, and is said here above the totals.
  if (A && workspaceId) {
    try {
      for (const p of (await myPriorities()).data ?? []) {
        const route = `/workspaces/${workspaceId}/priorities/${p.id}`
        const res = await A(route, { method: 'DELETE' })
        if (![200, 204, 404].includes(res.status)) console.log(`  cleanup left behind: DELETE ${route} answered ${res.status}`)
      }
    } catch (err) {
      console.log(`  cleanup left behind: this run's priorities got no answer (${err?.message ?? err})`)
    }
  }
  if (sql) {
    await sql`delete from tasks where title like ${'%' + TAG}`.catch(() => {})
    await sql`delete from lists where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from projects where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from spaces where name like ${'%' + TAG}`.catch(() => {})
    /*
     * AND THE WORKSPACE. This suite creates one (`WS <TAG>`) and used to leave
     * it behind, so the shared admin account gained one more per run, for ever.
     * That matters because 46 other suites pick their workspace with
     * `workspaces[0]` — a POSITION, not an identity — and the meaning of
     * element zero drifts as the list grows. It is the mechanism behind the
     * `save-comment` 403 fixed in 5b30bd1, which surfaced as a privacy failure
     * when nothing about privacy was wrong.
     */
    await sql`delete from workspaces where name like ${'%' + TAG}`.catch(() => {})
    await sql.end({ timeout: 5 }).catch(() => {})
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
