/**
 * A MEETING'S ACTION ITEMS BECOME TASKS ONLY WHERE THEIR MAKER MAY MAKE THEM.
 *
 * NOT A FRAME ROW: `found-24-sep/meeting-action-items-into-any-list`, from the
 * audit's "meeting action items created in any list id". Measured on lane 2,
 * with the model stub, before the fix:
 *   - a member refused a private space turned a meeting's action items into a
 *     task in that space's list (201; the task was there);
 *   - a user of another organisation aimed their own meeting's items at this
 *     workspace's list, and was stopped only by accident — their workspace's
 *     "meeting" task type did not belong to this one;
 *   - a meeting could be linked to a private task its maker may not open.
 *
 * The destination is now checked before any model is asked, so every refusal
 * here is measured with or without a model: a list the caller may not open,
 * or one in another workspace, is not found; a guest is refused. The twin of
 * each is a list they may use, which gets PAST the check — to a created task
 * where a model answers (lanes with RUNDESK_LANE_MODEL), and to "AI features
 * are not configured" where none does (CI).
 *
 *   node test/e2e/meeting-access.mjs --api 3021
 */
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 4

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const MODEL = `http://127.0.0.1:${argOf('--model', process.env.E2E_MODEL_PORT ?? String(9200 + (API_PORT - 3020)))}`
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

/* NEVER THROWS — `{status, data, error, text}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? res.data?.created ?? null).slice(0, 100)}`

// Where a model answers, it is told to find one action item, titled so the
// suite can count it; where none does, this does nothing.
const stage = (title) =>
  fetch(`${MODEL}/__control/next`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: JSON.stringify([{ title, description: 'from the meeting', priority: 'normal' }]) }),
  }).catch(() => null)
const reset = () => fetch(`${MODEL}/__control/reset`, { method: 'POST' }).catch(() => null)
/** How many calls the model has had since the last reset — null where there is no model to ask. */
const asked = async () => (await fetch(`${MODEL}/__control/seen`).then((r) => r.json()).catch(() => null))?.calls?.length ?? null
/** Refused before any model was asked: none was called, or there is none. */
const unasked = (calls) => calls === null || calls === 0

/** Got PAST the destination check: made the task where a model answers, or was told there is no model. */
const gotPast = (res, count) =>
  (res.status === 201 && res.data?.created?.length === 1 && count === 1) ||
  (res.status === 400 && /AI features are not configured/.test(res.error?.message ?? '') && count === 0)

const stamp = Date.now()
const TAG = `mac-${stamp}`
let sql = null
let WS = null
let SWS = null
let A = null
let S = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the meetings are planted and the lists counted by SQL')
  await reset()
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const adminId = (await A('/users/me')).data?.id
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, {
      fullName: `Meeting ${who}`, email, password: 'Member@12345!',
      organizationName: `Meeting ${who} ${stamp}`, organizationSlug: `meeting-${who}-${stamp}`,
    })
    if (role) {
      const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
      if (!added.ok) throw new Error(`could not add the ${who}: ${said(added)}`)
    }
    return { id: signed.user?.id, as: apiAs(signed.accessToken) }
  }
  const member = await person('member', 'member')
  const guest = await person('guest', 'guest')
  const stranger = await person('stranger', null)
  S = stranger.as

  const make = async (C, route, body, what) => {
    const res = await C(route, { method: 'POST', body })
    if (!res.ok || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`)
    return res.data.id
  }
  const place = async (C, workspaceId, name, visibility) => {
    const space = await make(C, '/spaces', { workspaceId, name: `${TAG} ${name}`, ...(visibility ? { visibility } : {}) }, `the ${name} space`)
    const project = await make(C, '/projects', { spaceId: space, name: `${TAG} ${name}` }, `the ${name} project`)
    const list = await make(C, '/lists', { projectId: project, name: `${TAG} ${name}` }, `the ${name} list`)
    const task = await make(C, '/tasks', { listId: list, title: `${TAG} ${name} task` }, `the ${name} task`)
    return { list, task }
  }
  const hidden = await place(A, WS, 'private', 'private')
  const open = await place(A, WS, 'open')
  // A guest reads only what is shared with them (`found-24-sep/guests-read-every-open-space`):
  // the open list is shared with this one to EDIT, so the read lets them in, and
  // the refusal below is the one under test — adding a task takes Full edit, a
  // guest's as anybody's (`found-25-sep/guests-with-full-edit-make-no-tasks`;
  // a guest at Full edit adds one, `guest-task-making`).
  await sql`insert into object_shares (workspace_id, object_type, object_id, user_id, level) values (${WS}, 'list', ${open.list}, ${guest.id}, 'edit')`
  const gate = await member.as(`/tasks/list/${hidden.list}`)
  if (gate.status !== 403) throw new Error(`the member was not refused the private list (${said(gate)}), so nothing here would mean anything`)

  // The meetings are planted by SQL: the create route is itself under test (§4).
  const meeting = async (workspaceId, by) =>
    (await sql`insert into meetings (workspace_id, title, notes, created_by_id) values (${workspaceId}, ${`${TAG} standup`}, ${'Alex will send the report by Friday.'}, ${by}) returning id`)[0].id
  const titled = async (list, title) =>
    (await sql`select count(*)::int as n from tasks where list_id = ${list} and title = ${title}`)[0].n
  const extract = (C, workspaceId, meetingId, createIn) =>
    C(`/workspaces/${workspaceId}/meetings/${meetingId}/action-items`, { method: 'POST', body: { createIn } })

  // ══ 1. A MEMBER REFUSED A PRIVATE SPACE ══════════════════════════════════
  console.log('\n▶ a member refused the private space')
  const mMeeting = await meeting(WS, member.id)
  const intoHidden = `${TAG} into the private list`
  await reset()
  await stage(intoHidden)
  const toHidden = await extract(member.as, WS, mMeeting, hidden.list)
  const hiddenCalls = await asked()
  await reset()
  const intoOpen = `${TAG} into the open list`
  await stage(intoOpen)
  const toOpen = await extract(member.as, WS, mMeeting, open.list)
  await reset()
  const [hiddenCount, openCount] = [await titled(hidden.list, intoHidden), await titled(open.list, intoOpen)]
  chk(
    toHidden.status === 404 && hiddenCount === 0 && unasked(hiddenCalls) && gotPast(toOpen, openCount),
    'the member cannot turn a meeting’s action items into tasks in the private list — not found, before any model is asked, and nothing made — while the open list is let through',
    `into the private list ${said(toHidden)} (${hiddenCount} made, the model asked ${hiddenCalls ?? 'never: there is none'}); into the open list ${said(toOpen)} (${openCount} made)`,
  )

  // ══ 2. ANOTHER ORGANISATION ══════════════════════════════════════════════
  console.log('\n▶ a user of another organisation, from a meeting of their own')
  const theirs = await S('/workspaces', { method: 'POST', body: { name: `${TAG} theirs` } })
  if (!theirs.ok || !theirs.data?.id) throw new Error(`the stranger could not make a workspace: ${said(theirs)}`)
  SWS = theirs.data.id
  const own = await place(S, SWS, 'their own')
  const sMeeting = await meeting(SWS, stranger.id)
  const intoVictim = `${TAG} from another organisation`
  await reset()
  await stage(intoVictim)
  const toVictim = await extract(S, SWS, sMeeting, open.list)
  const victimCalls = await asked()
  await reset()
  const intoOwn = `${TAG} into their own list`
  await stage(intoOwn)
  const toOwn = await extract(S, SWS, sMeeting, own.list)
  await reset()
  const [victimCount, ownCount] = [await titled(open.list, intoVictim), await titled(own.list, intoOwn)]
  chk(
    toVictim.status === 404 && victimCount === 0 && unasked(victimCalls) && gotPast(toOwn, ownCount),
    'they cannot aim their meeting’s action items at this workspace’s list (not found, nothing made) — their own list is let through',
    `into this workspace's list ${said(toVictim)} (${victimCount} made, the model asked ${victimCalls ?? 'never: there is none'}); into their own ${said(toOwn)} (${ownCount} made)`,
  )

  // ══ 3. A GUEST ═══════════════════════════════════════════════════════════
  console.log('\n▶ a guest')
  const gMeeting = await meeting(WS, guest.id)
  const byGuest = `${TAG} by the guest`
  await reset()
  await stage(byGuest)
  const guestTry = await extract(guest.as, WS, gMeeting, open.list)
  const guestCalls = await asked()
  await reset()
  const guestCount = await titled(open.list, byGuest)
  chk(
    guestTry.status === 403 && guestCount === 0 && unasked(guestCalls) && gotPast(toOpen, openCount),
    'a guest, who may not make tasks, is refused (403) before any model is asked — the member, into the same list, is let through',
    `the guest ${said(guestTry)} (${guestCount} made, the model asked ${guestCalls ?? 'never: there is none'}); the member ${said(toOpen)}`,
  )

  // ══ 4. A MEETING'S TASK ══════════════════════════════════════════════════
  console.log('\n▶ which task a meeting may be linked to')
  const linkHidden = await member.as(`/workspaces/${WS}/meetings`, { method: 'POST', body: { title: `${TAG} linked to the private task`, taskId: hidden.task } })
  const linkOpen = await member.as(`/workspaces/${WS}/meetings`, { method: 'POST', body: { title: `${TAG} linked to the open task`, taskId: open.task } })
  const [{ n: linkedToHidden }] = await sql`select count(*)::int as n from meetings where task_id = ${hidden.task}`
  chk(
    linkHidden.status === 404 && linkedToHidden === 0 && linkOpen.status === 201 && linkOpen.data?.taskId === open.task,
    'a meeting can be linked only to a task its maker may open: the private task is not found and no meeting is made — the open task links (201)',
    `the private task ${said(linkHidden)} (${linkedToHidden} linked); the open task ${said(linkOpen)}`,
  )
  void adminId
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await reset()
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
  }
  if (SWS && S) {
    const gone = await S(`/workspaces/${SWS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${SWS} answered ${gone.status || 'nothing'}`)
  }
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
