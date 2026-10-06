/**
 * THE PLANNER'S "DEFAULT LIST FOR NEW TASKS" DECIDES WHERE THEY LAND.
 *
 * Frame `14:20`, Time blocking: **Default list for new tasks** — "Defaults to
 * your personal list". The gap audit reads it as the answer to where a task
 * made by `/task`, from a chat message, or by the AI lands.
 * `found-24-sep/planner-default-list-read-by-nothing`: the picker saved a list
 * and nothing read it. `/task` and the AI's "Create task from this" took the
 * oldest list the person could add to, and the chat page made a message into
 * a task in the first list of the first project of the first space, chosen in
 * the browser.
 *
 * A list is chosen, and each of the three is asked for a task. With none
 * chosen, the oldest list the person can add to is still where they land; and
 * a chosen list is passed over where it cannot be used — in another workspace,
 * or where the person may not add to it.
 *
 * And deleted after it was chosen (`found-5-oct/default-list-files-into-an-archived-list`):
 * the list went on taking those tasks, in the trash where nobody could find
 * them. Now each of the three is refused, saying the Default list is in the
 * trash, and the chat page says so in those words. What to do is said by the
 * Trash's rule: a member whose list an admin deleted is told to ask for it to
 * be restored, not to restore it (found by the review). And the picker the
 * refusal sends them to shows the deleted choice as what it is: it showed "The
 * first list I can add to" as chosen, and choosing that saved nothing. In
 * another workspace, where that list is not the workspace's and /task passes it
 * over, the picker still shows the first list they can add to.
 *
 *   node test/e2e/planner-default-list.mjs --api 3021
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 11

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

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* lib/fixture.mjs's one API client, not a copy (`suite-hygiene/apiAs-duplicated-62`);
 * like the `call` and `asMember` helpers it replaces, it throws when nothing
 * answers at all. */
const apiAs = apiAsAt(API, { noAnswer: 'throw' })
const stamp = Date.now()
const TAG = `pdl-${stamp}`
let browser = null
let sql = null
let WS = null
let WS2 = null
let token = null
let call = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — where each task landed is read by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  token = auth.accessToken
  const me = auth.user.id
  call = apiAs(token)
  const make = async (route, body, what) => {
    const res = await call(route, { method: 'POST', body })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make ${what}: ${res.status}`)
    return res.data.id
  }
  WS = await make('/workspaces', { name: TAG }, 'the workspace')
  const SPACE = await make('/spaces', { workspaceId: WS, name: `${TAG} space` }, 'the space')
  const PROJECT = await make('/projects', { spaceId: SPACE, name: `${TAG} project` }, 'the project')
  await make('/lists', { projectId: PROJECT, name: `${TAG} an older list` }, 'the older list')
  const CHOSEN = await make('/lists', { projectId: PROJECT, name: `${TAG} the chosen list` }, 'the chosen list')
  const CHANNEL = await make(`/workspaces/${WS}/chat/channels`, { name: `pdl-${stamp}` }, 'the channel')
  const [oldest] = await sql`
    select l.id from lists l join projects p on p.id = l.project_id join spaces s on s.id = p.space_id
    where s.workspace_id = ${WS} and not l.is_archived order by l.created_at limit 1`
  const listOf = async (title) => (await sql`select list_id from tasks where title = ${title} limit 1`)[0]?.list_id ?? null
  const named = (id) => (id === CHOSEN ? 'the chosen list' : id === oldest?.id ? 'the oldest list' : JSON.stringify(id))

  const chose = await call(`/planner/${WS}/settings`, { method: 'PATCH', body: { defaultListId: CHOSEN } })
  if (chose.status >= 300) throw new Error(`could not choose the list: ${chose.status}`)

  // ══ 1. /task ═════════════════════════════════════════════════════════════
  console.log('\n▶ /task in a channel')
  const SLASH = `${TAG} made with slash task`
  const slash = await call(`/chat/channels/${CHANNEL}/commands`, { method: 'POST', body: { command: 'task', text: SLASH } })
  const slashList = await listOf(SLASH)
  chk(
    slash.status < 300 && slashList === CHOSEN,
    '/task puts its task in the list chosen as the default for new tasks',
    `/task answered ${slash.status}; the task is in ${named(slashList)}`,
  )

  // ══ 2. A MESSAGE, MADE INTO A TASK IN THE CHAT ═══════════════════════════
  console.log('\n▶ a message made into a task, in the chat')
  const WORDS = `${TAG} a message worth a task`
  const posted = await call(`/chat/channels/${CHANNEL}/messages`, { method: 'POST', body: { body: WORDS } })
  if (posted.status >= 300 || !posted.data?.id) throw new Error(`could not post the message: ${posted.status}`)
  browser = await chromium.launch(launchOptions())
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  await page.goto(`${B}/app/${WS}/chat?channel=${CHANNEL}`, { waitUntil: 'domcontentloaded' })
  const text = page.getByText(WORDS, { exact: true }).first()
  await text.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  await text.click({ button: 'right', timeout: 8000 }).catch(() => {})
  await page.getByRole('button', { name: /Create task from message/ }).first().click({ timeout: 8000 }).catch(() => {})
  const draft = page.getByTestId('chat-task-draft')
  await draft.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  await draft.getByRole('button', { name: /^Create task$/ }).click({ timeout: 8000 }).catch(() => {})
  let fromMessage = null
  await waitUntil(async () => (fromMessage = await listOf(WORDS)) !== null, { timeoutMs: 10_000 })
  chk(
    fromMessage === CHOSEN,
    'a chat message made into a task lands in that list too',
    `the task is in ${named(fromMessage)}`,
  )

  // ══ 3. THE AI'S "CREATE TASK FROM THIS" ══════════════════════════════════
  console.log('\n▶ an AI answer made into a task')
  const ANSWER = `${TAG} an answer worth a task`
  const [thread] = await sql`insert into ai_chat_threads (workspace_id, user_id, title) values (${WS}, ${me}, ${`${TAG} thread`}) returning id`
  const [message] = await sql`insert into ai_chat_messages (thread_id, role, content) values (${thread.id}, 'assistant', ${ANSWER}) returning id`
  const fromAi = await call(`/workspaces/${WS}/ai-chats/${thread.id}/messages/${message.id}/task`, { method: 'POST', body: {} })
  const aiList = await listOf(ANSWER)
  chk(
    fromAi.status < 300 && aiList === CHOSEN,
    'and so does an AI answer made into a task',
    `the AI's create-task answered ${fromAi.status}; the task is in ${named(aiList)}`,
  )

  // ══ 4. NONE CHOSEN ═══════════════════════════════════════════════════════
  console.log('\n▶ /task again, with no list chosen')
  await call(`/planner/${WS}/settings`, { method: 'PATCH', body: { defaultListId: null } })
  const PLAIN = `${TAG} made with no list chosen`
  await call(`/chat/channels/${CHANNEL}/commands`, { method: 'POST', body: { command: 'task', text: PLAIN } })
  const plainList = await listOf(PLAIN)
  chk(
    !!oldest && plainList === oldest.id,
    'with no list chosen, /task still lands in the oldest list the person can add to',
    `the task is in ${named(plainList)}`,
  )

  // ══ 5. A LIST CHOSEN IN ANOTHER WORKSPACE ════════════════════════════════
  console.log('\n▶ the list chosen is in another workspace')
  WS2 = await make('/workspaces', { name: `${TAG} elsewhere` }, 'the other workspace')
  const SPACE2 = await make('/spaces', { workspaceId: WS2, name: `${TAG} elsewhere` }, 'the other space')
  const PROJECT2 = await make('/projects', { spaceId: SPACE2, name: `${TAG} elsewhere` }, 'the other project')
  const ELSEWHERE = await make('/lists', { projectId: PROJECT2, name: `${TAG} a list elsewhere` }, 'the other list')
  await call(`/planner/${WS}/settings`, { method: 'PATCH', body: { defaultListId: ELSEWHERE } })
  const CROSS = `${TAG} not to leave this workspace`
  await call(`/chat/channels/${CHANNEL}/commands`, { method: 'POST', body: { command: 'task', text: CROSS } })
  const crossList = await listOf(CROSS)
  chk(
    !!oldest && crossList === oldest.id,
    'a list chosen in another workspace is not where this workspace’s tasks go: the oldest list here is',
    `the task is in ${crossList === ELSEWHERE ? 'THE OTHER WORKSPACE’S LIST' : named(crossList)}`,
  )
  await call(`/planner/${WS}/settings`, { method: 'PATCH', body: { defaultListId: null } })

  // ══ 6. A LIST THE PERSON MAY NOT ADD TO ══════════════════════════════════
  console.log('\n▶ a member’s chosen list is in a private space they are not in')
  const PRIVATE_SPACE = await make('/spaces', { workspaceId: WS, name: `${TAG} private`, visibility: 'private' }, 'the private space')
  const PRIVATE_PROJECT = await make('/projects', { spaceId: PRIVATE_SPACE, name: `${TAG} private` }, 'the private project')
  const PRIVATE_LIST = await make('/lists', { projectId: PRIVATE_PROJECT, name: `${TAG} a private list` }, 'the private list')
  const memberEmail = `${TAG}-member@rundesk.invalid`
  const member = await signUpApi(API, {
    fullName: 'Default list member', email: memberEmail, password: 'Member@12345!',
    organizationName: `Default list ${stamp}`, organizationSlug: `default-list-${stamp}`,
  })
  const joined = await call(`/workspaces/${WS}/members`, { method: 'POST', body: { email: memberEmail, role: 'member' } })
  if (joined.status >= 300) throw new Error(`could not add the member: ${joined.status}`)
  const asMember = apiAs(member.accessToken)
  await asMember(`/planner/${WS}/settings`, { method: 'PATCH', body: { defaultListId: PRIVATE_LIST } })
  const memberChannel = await asMember(`/workspaces/${WS}/chat/channels`, { method: 'POST', body: { name: `pdl-m-${stamp}` } })
  const REFUSED = `${TAG} the member's task`
  const made = memberChannel.data?.id
    ? await asMember(`/chat/channels/${memberChannel.data.id}/commands`, { method: 'POST', body: { command: 'task', text: REFUSED } })
    : { status: memberChannel.status }
  const refusedList = await listOf(REFUSED)
  chk(
    made.status < 300 && !!oldest && refusedList === oldest.id,
    'a chosen list the person may not add to is passed over, not refused: the task lands in the oldest list they can add to',
    `/task answered ${made.status}; the task is in ${refusedList === PRIVATE_LIST ? 'THE PRIVATE LIST' : named(refusedList)}`,
  )

  // ══ 7. THE CHOSEN LIST, DELETED ══════════════════════════════════════════
  // `found-5-oct/default-list-files-into-an-archived-list`: deleted after it was
  // chosen, the list went on taking every task made with no list named, where
  // nobody could find them. ClickUp's help does not say what becomes of a
  // deleted Default list, so the person is told, not sent somewhere else.
  console.log('\n▶ the chosen list deleted into the trash: /task, a message and the AI asked again')
  const DOOMED = await make('/lists', { projectId: PROJECT, name: `${TAG} a list to delete` }, 'the list to delete')
  const rechose = await call(`/planner/${WS}/settings`, { method: 'PATCH', body: { defaultListId: DOOMED } })
  const binned = await call(`/lists/${DOOMED}`, { method: 'DELETE' })
  if (rechose.status >= 300 || binned.status >= 300) throw new Error(`could not choose and delete the list: ${rechose.status}, ${binned.status}`)
  const IN_TRASH = 'Your "Default list for new tasks" is in the trash. Restore it from Trash, or choose another in Calendar settings → Time blocking.'
  const T_SLASH = `${TAG} by slash, the list deleted`
  const T_MESSAGE = `${TAG} a message, the list deleted`
  const T_ANSWER = `${TAG} an answer, the list deleted`
  const tSlash = await call(`/chat/channels/${CHANNEL}/commands`, { method: 'POST', body: { command: 'task', text: T_SLASH } })
  const tPosted = await call(`/chat/channels/${CHANNEL}/messages`, { method: 'POST', body: { body: T_MESSAGE } })
  if (tPosted.status >= 300 || !tPosted.data?.id) throw new Error(`could not post the message: ${tPosted.status}`)
  const tFromMessage = await call(`/chat/messages/${tPosted.data.id}/create-task`, { method: 'POST', body: {} })
  const [tAnswer] = await sql`insert into ai_chat_messages (thread_id, role, content) values (${thread.id}, 'assistant', ${T_ANSWER}) returning id`
  const tFromAi = await call(`/workspaces/${WS}/ai-chats/${thread.id}/messages/${tAnswer.id}/task`, { method: 'POST', body: {} })
  const [{ n: madeAnywhere }] = await sql`select count(*)::int as n from tasks where title in (${T_SLASH}, ${T_MESSAGE}, ${T_ANSWER})`
  const refusedInWords = (res) => res.status === 409 && res.message === IN_TRASH
  chk(
    refusedInWords(tSlash) && refusedInWords(tFromMessage) && refusedInWords(tFromAi) && madeAnywhere === 0,
    'with the chosen list deleted, /task, a chat message made into a task and an AI answer made into one are each refused — 409, saying the Default list is in the trash and what to do — and no task is made, in it or anywhere',
    `/task ${tSlash.status} ${JSON.stringify(tSlash.message)}; message ${tFromMessage.status} ${JSON.stringify(tFromMessage.message)}; AI ${tFromAi.status} ${JSON.stringify(tFromAi.message)}; ${madeAnywhere} made`,
  )

  // ══ 8. THE CHAT PAGE SAYS SO ═════════════════════════════════════════════
  console.log('\n▶ the chat page’s "Create task from message", the list deleted')
  const T_PAGE = `${TAG} a message on the page, the list deleted`
  const pagePosted = await call(`/chat/channels/${CHANNEL}/messages`, { method: 'POST', body: { body: T_PAGE } })
  if (pagePosted.status >= 300) throw new Error(`could not post the message: ${pagePosted.status}`)
  await page.goto(`${B}/app/${WS}/chat?channel=${CHANNEL}`, { waitUntil: 'domcontentloaded' })
  const onPage = page.getByText(T_PAGE, { exact: true }).first()
  await onPage.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  await onPage.click({ button: 'right', timeout: 8000 }).catch(() => {})
  await page.getByRole('button', { name: /Create task from message/ }).first().click({ timeout: 8000 }).catch(() => {})
  const pageDraft = page.getByTestId('chat-task-draft')
  await pageDraft.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  await pageDraft.getByRole('button', { name: /^Create task$/ }).click({ timeout: 8000 }).catch(() => {})
  const toldOnPage = await page.getByText(IN_TRASH, { exact: true }).first()
    .waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false)
  const [{ n: madeFromPage }] = await sql`select count(*)::int as n from tasks where title = ${T_PAGE}`
  chk(
    toldOnPage && madeFromPage === 0,
    'and the chat page says why, in the server’s words, when its Create task is refused — no task made',
    `the refusal shown: ${toldOnPage}; ${madeFromPage} made`,
  )

  // ══ 9. A MEMBER WHOSE CHOSEN LIST AN ADMIN DELETED ═══════════════════════
  console.log('\n▶ the member’s chosen list, deleted by the admin: the member’s /task')
  const MEMBERS = await make('/lists', { projectId: PROJECT, name: `${TAG} the member's choice, to delete` }, 'the member’s chosen list')
  const memberChose = await asMember(`/planner/${WS}/settings`, { method: 'PATCH', body: { defaultListId: MEMBERS } })
  const memberBinned = await call(`/lists/${MEMBERS}`, { method: 'DELETE' })
  if (memberChose.status >= 300 || memberBinned.status >= 300) throw new Error(`could not choose and delete the member’s list: ${memberChose.status}, ${memberBinned.status}`)
  const ASK = 'Your "Default list for new tasks" is in the trash. Ask a workspace admin, or whoever deleted it, to restore it, or choose another in Calendar settings → Time blocking.'
  const M_SLASH = `${TAG} the member's, their list deleted`
  const memberSlash = memberChannel.data?.id
    ? await asMember(`/chat/channels/${memberChannel.data.id}/commands`, { method: 'POST', body: { command: 'task', text: M_SLASH } })
    : { status: memberChannel.status }
  const [{ n: memberMade }] = await sql`select count(*)::int as n from tasks where title = ${M_SLASH}`
  chk(
    memberSlash.status === 409 && memberSlash.message === ASK && memberMade === 0,
    'and a member whose chosen list an admin deleted is told to ask a workspace admin, or whoever deleted it, to restore it — the Trash will not let them — or to choose another; no task made',
    `the member’s /task ${memberSlash.status} ${JSON.stringify(memberSlash.message)}; ${memberMade} made`,
  )

  // ══ 10. THE PICKER THE REFUSAL SENDS THEM TO ═════════════════════════════
  console.log('\n▶ Calendar settings → Time blocking, the chosen list deleted — in the other workspace, then in this one')
  const picker = page.getByTestId('planner-default-list')
  /** What the picker shows chosen in `workspaceId`, once its lists have loaded (more options than the first). */
  const pickerShows = async (workspaceId) => {
    await page.goto(`${B}/app/${workspaceId}/calendar?settings=timeBlocking`, { waitUntil: 'domcontentloaded' })
    await picker.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    await waitUntil(async () => (await picker.locator('option').count().catch(() => 0)) > 1, { timeoutMs: 15_000 })
    // The settings and the lists are two reads: let the second land.
    await page.waitForTimeout(1500)
    return picker.evaluate((el) => ({ value: el.value, text: el.options[el.selectedIndex]?.text ?? null })).catch(() => null)
  }
  const elsewhere = await pickerShows(WS2)
  const shown = await pickerShows(WS)
  await picker.selectOption('').catch(() => {})
  let afterChoice = null
  await waitUntil(async () => {
    afterChoice = (await call(`/planner/${WS}/settings`)).data?.defaultListId
    return afterChoice === null || afterChoice === undefined
  }, { timeoutMs: 10_000 })
  const T_AFTER = `${TAG} by slash, the first list chosen again`
  const tAfter = await call(`/chat/channels/${CHANNEL}/commands`, { method: 'POST', body: { command: 'task', text: T_AFTER } })
  const afterList = await listOf(T_AFTER)
  chk(
    shown?.value === DOOMED && shown?.text === 'A list in the trash' && elsewhere?.text === 'The first list I can add to'
      && (afterChoice === null || afterChoice === undefined) && tAfter.status < 300 && !!oldest && afterList === oldest.id,
    'and the picker it sends them to shows the deleted choice as a list in the trash, not “The first list I can add to” — which it still shows in another workspace, where /task passes that list over — and choosing that saves it, so /task lands in the oldest list again',
    `the picker showed ${JSON.stringify(shown)} (in the other workspace ${JSON.stringify(elsewhere)}); after choosing the first list the setting holds ${JSON.stringify(afterChoice)}; /task ${tAfter.status}, in ${named(afterList)}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  // The admin's own planner settings: left with no list chosen. They are the
  // person's, not the workspace's, so every later suite reads them and a
  // refused restore is this run's failure. With no client nothing was chosen.
  let cleared = null
  if (WS && call) {
    try {
      cleared = await call(`/planner/${WS}/settings`, { method: 'PATCH', body: { defaultListId: null } })
    } catch (err) {
      cleared = { status: `no answer (${err?.message ?? err})` }
    }
  }
  chk(
    !cleared || cleared.status < 300,
    'and the admin’s planner is left with no default list for the suites after this one',
    `PATCH /planner/${WS}/settings answered ${cleared?.status}`,
  )
  for (const ws of call ? [WS, WS2] : []) {
    if (!ws) continue
    try {
      const gone = await call(`/workspaces/${ws}`, { method: 'DELETE' })
      if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${ws} answered ${gone.status}`)
    } catch (err) {
      console.log(`  cleanup left behind: DELETE /workspaces/${ws} got no answer (${err?.message ?? err})`)
    }
  }
  // Only now: the calls above go through this proxy, and a closed one refuses them.
  stack.close()
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
