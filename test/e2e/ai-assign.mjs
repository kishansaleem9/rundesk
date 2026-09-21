/**
 * §V2-S17 frame `15:50` — **"⚡ Assign with AI"**, and the half of it that did
 * not exist: CHOOSING the person.
 *
 * `assign_task` has been in `ai-command.ts` the whole time and its schema is
 * `required: ['taskId', 'assigneeEmail']`, resolved by an exact match on that
 * email. So the AI could carry out an assignment somebody had already decided.
 * The frame's menu item is pressed when you do NOT know who should take it.
 *
 * WHAT THIS SUITE IS GUARDING, and it is one thing said four ways:
 *
 *   1. THE ANSWER MOVES WITH THE DATA. The suite asks who should take its task,
 *      piles work onto whoever it named, and asks again. The member list has not
 *      changed and its order has not changed; only the numbers have. A
 *      `members[0]` implementation — the break patch
 *      `assign-4-first-member.py` is exactly that — returns the same person
 *      both times and fails here. This is the check the row lives or dies on.
 *
 *   2. THE NUMBERS ARE THE PRODUCT'S NUMBERS. `pick.openTasks` is compared
 *      against the load the §7.12 workload endpoint reports for the same person
 *      in the same workspace. Two different counts of "how much is Ana
 *      carrying" is how the balance panel and this feature end up recommending
 *      opposite things on the same afternoon — the duplicated-list defect, in
 *      arithmetic.
 *
 *   3. IT RECOMMENDS AND DOES NOT ASSIGN. The task's assignees are read back
 *      after every suggestion. A "who should take this" that quietly took the
 *      decision would pass every other check on this page.
 *
 *   4. A REFUSAL SAYS WHICH REFUSAL. "That task does not exist", "you may not
 *      assign it" and "there is nobody to choose between" are three answers, and
 *      they all arrive as 200 with a reason code precisely because a status two
 *      mechanisms both produce cannot tell them apart. The code is asserted, not
 *      the status.
 *
 * NARROWED TO ITS OWN FIXTURES. The e2e database is shared, so nothing here
 * asserts an absolute — not "Ana is picked", not "there are three candidates".
 * Every check is about a CHANGE this suite caused: it makes its own list, its
 * own tasks under a run-unique tag, and asserts the answer before against the
 * answer after. Its tasks are archived in `finally`.
 *
 * NO PROVIDER KEY EXISTS HERE, so `/ai/chat` 503s and the `suggest_assignee`
 * TOOL cannot be exercised through a model. The tool's schema and its "does NOT
 * assign" instruction are pinned in `apps/api/src/modules/ai/ai-assign.test.ts`;
 * what is exercised here is the service and the route beneath it, which is
 * where the choosing actually happens — the same split `ai-create-containers`
 * and `ai-answer-rendering` take.
 *
 *   node test/e2e/ai-assign.mjs --api 3011
 */
import path from 'node:path'
import { apiClient, login, pickWorkspace } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". Exact, so a skipped branch is a failure. */
const EXPECTED_CHECKS = 23

const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'
const REPO = path.resolve(import.meta.dirname, '../..')
const TAG = `e2e-aiassign-${Date.now()}`

let stack = null
let B = (process.env.BASE ?? '').replace(/\/$/, '')
if (!B) {
  stack = await startLocalStack({
    dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')),
    apiPort: Number(argOf('--api', process.env.E2E_API_PORT ?? 3011)),
  })
  B = stack.base
}

const results = []
const ok = (m) => { results.push(1); console.log(`  \x1b[32mPASS\x1b[0m ${m}`) }
const bad = (m) => { results.push(0); console.log(`  \x1b[31mFAIL\x1b[0m ${m}`) }
const chk = (c, good, badMsg) => (c ? ok(good) : bad(badMsg ?? good))

const auth = await login(`${B}/api/v1`, EMAIL, PASSWORD)
const api = apiClient(`${B}/api/v1`, auth.accessToken)
const WS = process.env.E2E_WS ?? (await pickWorkspace(api)).id

/** Everything this run made, put back in `finally` whatever happens. */
const ownedTaskIds = []
const ownedListIds = []
let ownedListId = null

const suggestFor = (taskId) => api(`/ai/assignee-suggestion?taskId=${taskId}`)
const mkTask = async (listId, title) => {
  const res = await api('/tasks', { method: 'POST', body: { listId, title } })
  if (res.status < 400 && res.data?.id) ownedTaskIds.push(res.data.id)
  return res.status < 400 ? res.data : null
}

try {
  console.log('\n▶ a list of this run’s own, in a space this account can already see')
  const spaces = (await api(`/spaces/workspace/${WS}`)).data ?? []
  const spaceId = spaces[0]?.id
  const projects = spaceId ? ((await api(`/projects/space/${spaceId}`)).data ?? []) : []
  const projectId = projects[0]?.id
  chk(
    !!spaceId && !!projectId,
    'the workspace has somewhere to put a list',
    `spaces=${spaces.length} projects=${projects.length}`,
  )
  if (!projectId) throw new Error('no project; every check below would be vacuous')

  const listRes = await api('/lists', { method: 'POST', body: { projectId, name: `${TAG}-list` } })
  ownedListId = listRes.data?.id ?? null
  if (ownedListId) ownedListIds.push(ownedListId)
  chk(
    listRes.status < 400 && !!ownedListId,
    'and the suite owns the list it will measure in',
    `creating it returned ${listRes.status} ${JSON.stringify(listRes.data).slice(0, 140)}`,
  )
  if (!ownedListId) throw new Error('no list; the suite cannot narrow to its own data')

  const subject = await mkTask(ownedListId, `${TAG}-subject`)
  chk(!!subject?.id, 'with an unassigned task to find somebody for', `creating it gave ${JSON.stringify(subject)}`)
  if (!subject?.id) throw new Error('no subject task')

  const members = (await api(`/workspaces/${WS}/members`)).data ?? []
  chk(
    Array.isArray(members) && members.length >= 2,
    'and at least two people to choose between',
    `the workspace has ${Array.isArray(members) ? members.length : 0} member(s) — with one there is no choice ` +
      'to make and nothing below could distinguish a ranking from a constant',
  )
  if (!Array.isArray(members) || members.length < 2) throw new Error('not enough members to rank')

  console.log('\n▶ `15:50` — it names somebody, and says why')
  const first = await suggestFor(subject.id)
  chk(
    first.status === 200 && first.data?.ok === true,
    'the route answers with a suggestion',
    `it returned ${first.status} ${JSON.stringify(first.data).slice(0, 180)}`,
  )
  const pick1 = first.data?.pick
  chk(
    !!pick1?.userId && !!pick1?.email,
    'naming a real person rather than a position',
    `the pick was ${JSON.stringify(pick1 ?? null)}`,
  )
  if (!pick1?.userId) throw new Error('no pick; the rest of the suite has nothing to compare')
  /*
   * THE REASON CARRIES THIS CANDIDATE'S OWN NUMBERS. A reason that reads the
   * same for everybody is a label, not a justification — the same shape as the
   * two unroutable providers each having to name their own provider, where
   * "a reason is present" passes on the bug.
   */
  chk(
    typeof pick1.reason === 'string' && pick1.reason.includes(`${pick1.openTasks} open task`),
    'and giving the count the choice was made from, in the sentence',
    `the reason read ${JSON.stringify(pick1.reason)} for someone with openTasks=${pick1.openTasks}`,
  )
  const runner1 = first.data?.runnerUp
  chk(
    !!runner1?.userId && runner1.userId !== pick1.userId && runner1.reason !== pick1.reason,
    'with a runner-up, whose reason is a different sentence about a different person',
    `runner-up was ${JSON.stringify(runner1 ?? null)} against a pick of ${pick1.userId}`,
  )
  const ranked = first.data?.ranked ?? []
  chk(
    ranked.length >= 2 && ranked[0]?.userId === pick1.userId &&
      new Set(ranked.map((r) => r.userId)).size === ranked.length,
    'over a ranking that lists each candidate once, best first',
    `ranked ${ranked.length} with ${new Set(ranked.map((r) => r.userId)).size} distinct ids, ` +
      `headed by ${ranked[0]?.userId}`,
  )

  console.log('\n▶ the count is the product’s count, not a second opinion')
  /*
   * CROSS-SOURCE. `suggestAssignee` and the §7.12 workload endpoint both answer
   * "how much open work does this person have". They read through the same
   * `collectWorkloadLoads`, and this is what says so from outside: two
   * independent counts drifting apart is the duplicated-list defect in
   * arithmetic, and it is invisible from either endpoint alone.
   */
  const balance = await api('/ai/workload-balance', { method: 'POST', body: { workspaceId: WS } })
  const balanceLoad = (balance.data?.loads ?? []).find((l) => l.userId === pick1.userId)
  chk(
    balance.status === 200 && !!balanceLoad && balanceLoad.open === pick1.openTasks,
    'the suggestion’s open-task count matches what the workload endpoint reports for the same person',
    `the suggestion said ${pick1.openTasks} and workload-balance said ${balanceLoad?.open ?? '(absent)'} ` +
      `(status ${balance.status})`,
  )

  console.log('\n▶ it recommends; it does not assign')
  const afterAsking = await api(`/tasks/${subject.id}`)
  chk(
    afterAsking.status === 200 && (afterAsking.data?.assignees ?? []).length === 0,
    'asking who should take it leaves the task unassigned',
    `the task came back with ${JSON.stringify(afterAsking.data?.assignees ?? null)} after a suggestion — ` +
      'a "who should take this" that took the decision is worse than no feature',
  )

  console.log('\n▶ the answer MOVES when the numbers move — the check this row lives on')
  /*
   * Pile enough open work onto the person who was just chosen to put them
   * behind the runner-up, then ask the same question about the same task with
   * the same members in the same order.
   *
   * The gap has to be crossed deliberately: the pick leads on context first and
   * load second, so the load added is the runner-up's load plus a margin rather
   * than an arbitrary number.
   */
  const gap = Math.max(0, (runner1?.openTasks ?? 0) - pick1.openTasks) + 4
  const ballast = await api('/lists', { method: 'POST', body: { projectId, name: `${TAG}-ballast` } })
  const ballastListId = ballast.data?.id ?? ownedListId
  /*
   * A SECOND LIST ON PURPOSE. The load has to move without the context moving:
   * ballast dropped into the subject's own list would raise `inList` too, and
   * the check below could then pass or fail for either reason.
   */
  if (ballast.data?.id) ownedListIds.push(ballast.data.id)
  for (let i = 0; i < gap; i++) {
    const t = await mkTask(ballastListId, `${TAG}-ballast-${i}`)
    if (t?.id) await api(`/tasks/${t.id}/assignees`, { method: 'POST', body: { userId: pick1.userId } })
  }
  const second = await suggestFor(subject.id)
  const pick2 = second.data?.pick
  chk(
    second.status === 200 && !!pick2?.userId,
    'it still answers after the workspace changed underneath it',
    `it returned ${second.status} ${JSON.stringify(second.data).slice(0, 160)}`,
  )
  /*
   * NO ESCAPE HATCH. The subject's list was created by this run, so every
   * candidate starts with `inList = 0` and the first pick was decided on open
   * load alone; `gap` puts the chosen person strictly above the runner-up on
   * that same number, with nothing else changed. So "somebody else" is the only
   * correct answer, and an `|| pick2.openTasks === 0`-style let-out here would
   * be a check that passes on the bug it was written for.
   */
  chk(
    !!pick2 && pick2.userId !== pick1.userId,
    'and names SOMEBODY ELSE once the first person is carrying the load',
    `it named ${pick2?.userId} again after ${gap} more open task(s) were put on them — ` +
      'a ranking that does not move when the only input moves is not a ranking',
  )
  const movedTo = (second.data?.ranked ?? []).find((r) => r.userId === pick1.userId)
  chk(
    !!movedTo && movedTo.openTasks >= pick1.openTasks + gap,
    'the person who was chosen first is still in the ranking, now carrying the work that was added',
    `they report openTasks=${movedTo?.openTasks} against ${pick1.openTasks} before ${gap} were added`,
  )
  chk(
    !!movedTo && movedTo.reason.includes(`${movedTo.openTasks} open task`),
    'and their reason now reads the new number, not the old one',
    `their reason still reads ${JSON.stringify(movedTo?.reason)}`,
  )

  console.log('\n▶ context: work in THIS list counts, and is counted right')
  const contextTask = await mkTask(ownedListId, `${TAG}-context`)
  if (contextTask?.id) {
    await api(`/tasks/${contextTask.id}/assignees`, { method: 'POST', body: { userId: pick1.userId } })
  }
  const third = await suggestFor(subject.id)
  const inThisList = (third.data?.ranked ?? []).find((r) => r.userId === pick1.userId)
  /*
   * The number, not the ranking. The list is this suite's own and holds exactly
   * one open task assigned to that person, so `inList` has a right answer that
   * nothing else in the shared database can supply.
   */
  chk(
    third.status === 200 && inThisList?.inList === 1,
    'the candidate’s in-this-list count is the one task this run put there',
    `it reported inList=${inThisList?.inList} for a list holding exactly one assigned open task`,
  )
  chk(
    (third.data?.ranked ?? []).every((r) => typeof r.overdue === 'number' && r.overdue >= 0),
    'and every candidate carries an overdue figure rather than a missing field',
    `the overdue values were ${JSON.stringify((third.data?.ranked ?? []).map((r) => r.overdue))}`,
  )

  console.log('\n▶ somebody already on the task is not somebody to choose')
  const before = (third.data?.ranked ?? []).map((r) => r.userId)
  await api(`/tasks/${subject.id}/assignees`, { method: 'POST', body: { userId: pick1.userId } })
  const fourth = await suggestFor(subject.id)
  const after = (fourth.data?.ranked ?? []).map((r) => r.userId)
  chk(
    before.includes(pick1.userId) && !after.includes(pick1.userId),
    'assigning them removes them from the candidates — there is nothing to choose about someone who has it',
    `before ${JSON.stringify(before)} / after ${JSON.stringify(after)}`,
  )
  chk(
    fourth.data?.ok === false ? fourth.data?.reason === 'already_assigned' : after.length === before.length - 1,
    'and everybody else is still in the running',
    `the second ask returned ${JSON.stringify(fourth.data).slice(0, 160)}`,
  )

  console.log('\n▶ refusals say WHICH refusal, in the body')
  const ghost = await suggestFor('00000000-0000-4000-8000-0000000000aa')
  chk(
    ghost.status === 200 && ghost.data?.ok === false && ghost.data?.reason === 'unknown_task',
    'a task that does not exist is refused by NAME, at 200 rather than a bare 404',
    `it returned ${ghost.status} ${JSON.stringify(ghost.data)} — a 404 here is also the answer for ` +
      '"you may not see it", and the two must be tellable apart',
  )
  chk(
    typeof ghost.data?.message === 'string' && /nothing was assigned/i.test(ghost.data.message),
    'saying plainly that nothing was assigned',
    `the message read ${JSON.stringify(ghost.data?.message)}`,
  )
  const malformed = await suggestFor('not-a-uuid')
  chk(
    malformed.status === 200 && malformed.data?.reason === 'unknown_task',
    'and a malformed id is the same refusal rather than a 500 from Postgres',
    `it returned ${malformed.status} ${JSON.stringify(malformed.data).slice(0, 140)}`,
  )
  const noId = await api('/ai/assignee-suggestion')
  chk(
    noId.status === 400,
    'asking with no task at all is a bad request, not a suggestion about nothing',
    `it returned ${noId.status}`,
  )
} catch (e) {
  bad(`threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  /*
   * The e2e database is shared and this run created real tasks on real people's
   * workloads. Archiving them puts every other suite's arithmetic back.
   */
  for (const id of ownedTaskIds) await api(`/tasks/${id}`, { method: 'DELETE' })
  for (const id of ownedListIds) await api(`/lists/${id}`, { method: 'DELETE' })
}

const failed = () => results.filter((x) => !x).length
if (results.length !== EXPECTED_CHECKS) {
  console.log(`  \x1b[31mFAIL\x1b[0m ran ${results.length} checks, expected ${EXPECTED_CHECKS}`)
  results.push(0)
}
console.log(`\n${results.length - failed()} passed, ${failed()} failed`)
await stack?.close?.()
process.exit(failed() ? 1 : 0)
