/**
 * A TASK IS MADE ONLY IN A LIST ITS MAKER MAY MAKE ONE IN.
 *
 * NOT A FRAME ROW: `found-24-sep/task-makers-skip-the-list-rule` and
 * `found-24-sep/tasks-created-in-view-only-spaces`. `POST /tasks` had its
 * guard; every other way of making a task reached `createTask`, which asked
 * only whether the maker was a guest. Measured on lane 1 before the fix:
 *   - a member refused a private list made a task in it from a chat message,
 *     and from an AI plan sent straight to the executor (201 each);
 *   - a user of ANOTHER organisation made a task in this workspace's list from
 *     a message of their own (201);
 *   - `/task` filed the task in the workspace's oldest list, whoever asked;
 *   - and in a space whose default permission is "view only" or "comment", a
 *     member made tasks through `POST /tasks` itself (201) — ClickUp's view
 *     and comment permissions make none.
 *
 * `createTask` now asks one rule for its maker — a member who may open the
 * list, not a guest, on a space that lets them add to it — so each of these
 * is refused, and each refusal is read back from the list beside a twin that
 * the same route still makes a task where it may.
 *
 *   node test/e2e/task-creation-access.mjs --api 3021
 */
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 6

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
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

/* NEVER THROWS — `{status, data, error, text}`. Every call site reads `status`. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, { ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined })
    .catch(() => null)
  if (!res) return { status: 0, data: null, error: { message: 'no answer' }, text: '' }
  const text = await res.text().catch(() => '')
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { status: res.status, data: json?.data, error: json?.error, text }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `tca-${stamp}`
let sql = null
let WS = null
let SWS = null
let A = null
let S = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what each list holds is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, {
      fullName: `Maker ${who}`, email, password: 'Member@12345!',
      organizationName: `Maker ${who} ${stamp}`, organizationSlug: `maker-${who}-${stamp}`,
    })
    if (role) {
      const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
      if (added.status >= 300) throw new Error(`could not add the ${who}: ${said(added)}`)
    }
    return { id: signed.user?.id, as: apiAs(signed.accessToken) }
  }
  const member = await person('member', 'member')
  const guest = await person('guest', 'guest')
  const stranger = await person('stranger', null)
  const M = member.as
  S = stranger.as

  const make = async (C, route, body, what) => {
    const res = await C(route, { method: 'POST', body })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`)
    return res.data.id
  }
  const place = async (C, workspaceId, name, space = {}) => {
    const sp = await make(C, '/spaces', { workspaceId, name: `${TAG} ${name}`, ...space }, `the ${name} space`)
    const pr = await make(C, '/projects', { spaceId: sp, name: `${TAG} ${name}` }, `the ${name} project`)
    return make(C, '/lists', { projectId: pr, name: `${TAG} ${name}` }, `the ${name} list`)
  }
  // The workspace's own first list ("To do") is made private by SQL, so the
  // oldest list in the workspace is one the member is refused.
  const [first] = await sql`select l.id from lists l join projects p on p.id = l.project_id join spaces s on s.id = p.space_id where s.workspace_id = ${WS} order by l.created_at limit 1`
  if (!first) throw new Error('the new workspace has no list of its own')
  await sql`update lists set visibility = 'private', created_by_id = ${auth.user?.id ?? (await A('/users/me')).data?.id} where id = ${first.id}`
  const PRIVATE = await place(A, WS, 'private', { visibility: 'private' })
  const OPEN = await place(A, WS, 'open')
  const VIEW = await place(A, WS, 'view only', { defaultPermission: 'view' })
  const COMMENT = await place(A, WS, 'comment', { defaultPermission: 'comment' })
  const gates = await Promise.all([M(`/tasks/list/${first.id}`), M(`/tasks/list/${PRIVATE}`)])
  if (!gates.every((g) => g.status === 403)) throw new Error(`the member was not refused the two private lists (${gates.map((g) => g.status).join(', ')})`)
  const channel = await make(A, `/workspaces/${WS}/chat/channels`, { name: `${TAG}-talk` }, 'the channel')
  const titled = async (list, title) => (await sql`select count(*)::int as n from tasks where list_id = ${list} and title = ${title}`)[0].n
  const message = async (C, ch, body) => make(C, `/chat/channels/${ch}/messages`, { body }, `the message "${body}"`)

  // ══ 1. FROM A CHAT MESSAGE ═══════════════════════════════════════════════
  console.log('\n▶ "create task" on a chat message')
  const msg = await message(M, channel, `${TAG} turn me into a task`)
  const intoPrivate = await M(`/chat/messages/${msg}/create-task`, { method: 'POST', body: { listId: PRIVATE, title: `${TAG} from a message, private` } })
  const intoOpen = await M(`/chat/messages/${msg}/create-task`, { method: 'POST', body: { listId: OPEN, title: `${TAG} from a message, open` } })
  const [privMade, openMade] = [await titled(PRIVATE, `${TAG} from a message, private`), await titled(OPEN, `${TAG} from a message, open`)]
  chk(
    intoPrivate.status === 404 && privMade === 0 && intoOpen.status === 201 && openMade === 1,
    'a member makes no task from a message in a list they may not open (not found, none made) — in the open list, one is made',
    `into the private list ${said(intoPrivate)} (${privMade} made); into the open list ${said(intoOpen)} (${openMade} made)`,
  )

  // ══ 2. ANOTHER ORGANISATION ══════════════════════════════════════════════
  console.log('\n▶ a user of another organisation, from a message of their own')
  const theirs = await S('/workspaces', { method: 'POST', body: { name: `${TAG} theirs` } })
  if (theirs.status >= 300 || !theirs.data?.id) throw new Error(`the stranger could not make a workspace: ${said(theirs)}`)
  SWS = theirs.data.id
  const ownList = await place(S, SWS, 'their own')
  const theirChannel = await make(S, `/workspaces/${SWS}/chat/channels`, { name: `${TAG}-theirs` }, 'their channel')
  const theirMsg = await message(S, theirChannel, `${TAG} from outside`)
  const across = await S(`/chat/messages/${theirMsg}/create-task`, { method: 'POST', body: { listId: OPEN, title: `${TAG} from another organisation` } })
  const home = await S(`/chat/messages/${theirMsg}/create-task`, { method: 'POST', body: { listId: ownList, title: `${TAG} in their own list` } })
  const [acrossMade, homeMade] = [await titled(OPEN, `${TAG} from another organisation`), await titled(ownList, `${TAG} in their own list`)]
  chk(
    across.status === 404 && acrossMade === 0 && home.status === 201 && homeMade === 1,
    'a user of another organisation makes no task in this workspace’s list from a message of their own (not found, none made) — in their own list, they do',
    `into this workspace ${said(across)} (${acrossMade} made); into their own ${said(home)} (${homeMade} made)`,
  )

  // ══ 3. AN AI PLAN, SENT STRAIGHT TO THE EXECUTOR ═════════════════════════
  console.log('\n▶ an AI plan’s create_task')
  const plan = (listId, title) => ({ workspaceId: WS, actions: [{ tool: 'create_task', args: { listId, title }, humanLabel: title }] })
  const planPrivate = await M('/ai/command/execute', { method: 'POST', body: plan(PRIVATE, `${TAG} from a plan, private`) })
  const planOpen = await M('/ai/command/execute', { method: 'POST', body: plan(OPEN, `${TAG} from a plan, open`) })
  const [planPrivMade, planOpenMade] = [await titled(PRIVATE, `${TAG} from a plan, private`), await titled(OPEN, `${TAG} from a plan, open`)]
  const outcome = (res) => res.data?.results?.[0]?.status
  chk(
    outcome(planPrivate) !== 'succeeded' && planPrivMade === 0 && outcome(planOpen) === 'succeeded' && planOpenMade === 1,
    'an AI plan’s create_task into a list the member may not open is not carried out and makes nothing — into the open list it is',
    `into the private list: ${outcome(planPrivate) ?? said(planPrivate)} (${planPrivMade} made); into the open list: ${outcome(planOpen) ?? said(planOpen)} (${planOpenMade} made)`,
  )

  // ══ 4. /task, WHICH NAMES NO LIST ════════════════════════════════════════
  console.log('\n▶ /task in a channel')
  const slash = async (C) => C(`/chat/channels/${channel}/commands`, { method: 'POST', body: { command: 'task', text: `${TAG} by slash` } })
  const mSlash = await slash(M)
  const aSlash = await slash(A)
  const mList = mSlash.data?.task?.listId
  const aList = aSlash.data?.task?.listId
  chk(
    mSlash.status < 300 && mList && mList !== first.id && mList !== PRIVATE && aSlash.status < 300 && aList === first.id,
    'the member’s /task goes to the oldest list they may make a task in, not the older one they are refused — the admin’s goes to the oldest',
    `the member's ${said(mSlash)} went to ${mList === first.id ? 'the REFUSED oldest list' : mList === PRIVATE ? 'the PRIVATE list' : mList === OPEN ? 'the open list' : JSON.stringify(mList)}; the admin's ${said(aSlash)} to ${aList === first.id ? 'the oldest' : JSON.stringify(aList)}`,
  )

  // ══ 5. A SPACE'S DEFAULT PERMISSION ══════════════════════════════════════
  console.log('\n▶ "view only" and "comment" spaces')
  const create = (listId, title) => M('/tasks', { method: 'POST', body: { listId, title } })
  const inView = await create(VIEW, `${TAG} in a view-only space`)
  const inComment = await create(COMMENT, `${TAG} in a comment space`)
  const inEdit = await create(OPEN, `${TAG} in an edit space`)
  const [viewMade, commentMade] = [await titled(VIEW, `${TAG} in a view-only space`), await titled(COMMENT, `${TAG} in a comment space`)]
  chk(
    inView.status === 403 && inComment.status === 403 && viewMade === 0 && commentMade === 0 && inEdit.status === 201,
    'a member makes no task in a space whose default is “view only” or “comment” (403 each, none made) — in an “edit” space, one is made',
    `view only ${said(inView)} (${viewMade} made), comment ${said(inComment)} (${commentMade} made); edit ${said(inEdit)}`,
  )

  // ══ 6. A GUEST ═══════════════════════════════════════════════════════════
  console.log('\n▶ a guest')
  // The guest's message is planted by SQL: whether a guest may post is not what this asks.
  const [{ id: guestMsg }] = await sql`insert into chat_messages (channel_id, author_id, body) values (${channel}, ${guest.id}, ${`${TAG} a guest's message`}) returning id`
  const byGuest = await guest.as(`/chat/messages/${guestMsg}/create-task`, { method: 'POST', body: { listId: OPEN, title: `${TAG} by the guest` } })
  const guestMade = await titled(OPEN, `${TAG} by the guest`)
  chk(
    byGuest.status === 403 && guestMade === 0 && intoOpen.status === 201,
    'a guest makes no task from a message (403, none made) — the member, into the same list, does',
    `the guest ${said(byGuest)} (${guestMade} made); the member ${said(intoOpen)}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  if (WS && A) await A(`/workspaces/${WS}`, { method: 'DELETE' }).catch(() => {})
  if (SWS && S) await S(`/workspaces/${SWS}`, { method: 'DELETE' }).catch(() => {})
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
