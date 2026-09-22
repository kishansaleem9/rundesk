/**
 * Work marked done has to count as done.
 *
 * `ListsService.create` seeds a list's status pipeline. Three other paths that
 * insert into `lists` did not — a workspace's starter list, a list from a
 * project template, and a list from the ClickUp import — so those lists were
 * permanently status-less. And `resolveStatusForList` answered
 * `{ key: requestedKey, category: 'open' }` for ANY key when a list had none.
 *
 * So a task on a new workspace's first list could be set to `done`, store
 * `status = 'done'`, and keep `statusCategory = 'open'`. Accepted, no 400, no
 * warning. The UI renders the status the person picked; lists, reports, the
 * planner, Workload and the teams work preview all reason on the CATEGORY.
 * They disagreed permanently and invisibly, and work completed in a new
 * workspace's first list never counted as completed anywhere.
 *
 * Found because a fixture could not close a task — the suite that needed it
 * refused to continue rather than let the check pass vacuously, which is the
 * only reason anybody looked.
 *
 * The check with teeth is the pair at the end: `status` says done AND
 * `statusCategory` says closed AND a reader that reasons on the category
 * agrees. Asserting the stored key alone passes on the bug — that was never
 * the broken half.
 *
 * AND THE READER-AGREES HALF WAS VACUOUS UNTIL IT HAD A CONTROL. It asserted
 * the closed task is ABSENT from the teams work preview — and the task was
 * created with no assignee, while `workPreview` joins `task_assignees`. An
 * unassigned task is absent from it whatever its category says, so the check
 * passed on the very bug it was written for. The task is assigned now, and the
 * check above it asserts the preview DOES list it while it is open. An absence
 * means something only next to the presence it replaced.
 *
 *   node test/e2e/list-statuses-seeded.mjs --api 3011
 */
import { signInApi } from './lib/signin.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 10

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

const TAG = `lss-${Date.now()}`
const made = []
let A

try {
  const auth = await signInApi(API, ME.email, ME.password)
  A = apiAs(auth.accessToken)

  /*
   * A workspace created RIGHT NOW, through the same endpoint a person uses.
   * The point is the starter list this path builds for itself — not a list
   * made afterwards through `POST /lists`, which was never the broken one.
   */
  const mk = await A('/workspaces', { method: 'POST', body: { name: `WS ${TAG}` } })
  if (mk.status >= 300 || !mk.data?.id) throw new Error(`could not create a workspace: ${mk.status}`)
  const ws = mk.data.id
  made.push(ws)

  const spaces = (await A(`/spaces/workspace/${ws}`)).data ?? []
  const projects = spaces[0] ? (await A(`/projects/space/${spaces[0].id}`)).data ?? [] : []
  const lists = projects[0] ? (await A(`/lists/project/${projects[0].id}`)).data ?? [] : []
  const starter = lists[0]
  chk(
    !!starter?.id,
    'a new workspace comes with a starter list',
    `no starter list: ${spaces.length} spaces, ${projects.length} projects, ${lists.length} lists`,
  )
  if (!starter?.id) throw new Error('without a starter list there is nothing to assert')

  const statuses = (await A(`/lists/${starter.id}/statuses`)).data ?? []
  chk(
    Array.isArray(statuses) && statuses.length > 0,
    `the starter list has a status pipeline (${statuses.length} statuses)`,
    'the starter list has NO statuses — every key set on it resolves to category "open"',
  )

  const closed = (Array.isArray(statuses) ? statuses : []).find((s) => s.category === 'closed')
  chk(
    !!closed?.key,
    `and one of them means closed (${closed?.key})`,
    `no status on the starter list has category "closed": ${statuses.map((s) => `${s.key}:${s.category}`).join(', ')}`,
  )
  if (!closed?.key) throw new Error('without a closed status there is no way to finish anything here')

  /*
   * ASSIGNED TO ME, and that is not a detail.
   *
   * The work-preview check at the bottom asserts this task is ABSENT from a
   * reader that reasons on the category. It used to create the task with no
   * assignee — and `workPreview` joins `task_assignees`, so an unassigned task
   * is absent from it whatever its category says. The check passed on the bug
   * it was written to catch, and on a build with no category logic at all. A
   * confident zero: the right answer, for a reason that has nothing to do with
   * the question.
   *
   * Assigning it is half the fix; the control below — that it IS listed while
   * it is open — is the other half, and the half that makes the absence mean
   * something.
   */
  const meId = auth.user?.id ?? auth.userId
  const mkTask = await A('/tasks', {
    method: 'POST',
    body: { listId: starter.id, title: `done-check ${TAG}`, assigneeIds: meId ? [meId] : [] },
  })
  if (mkTask.status >= 300 || !mkTask.data?.id) throw new Error(`could not create a task: ${mkTask.status}`)
  const taskId = mkTask.data.id
  chk(
    mkTask.data.statusCategory === 'open',
    'a new task starts open',
    `a brand new task came back as "${mkTask.data.statusCategory}"`,
  )

  const titlesIn = async () => {
    const res = await A(`/workspaces/${ws}/teams/work-preview`)
    const list = Array.isArray(res.data) ? res.data : (res.data?.people ?? [])
    const row = list.find((r) => (r.userId ?? r.user?.id) === meId)
    return { status: res.status, titles: (row?.items ?? row?.tasks ?? []).map((t) => t.title ?? t.name) }
  }
  const whileOpen = await titlesIn()
  chk(
    whileOpen.status === 200 && whileOpen.titles.includes(`done-check ${TAG}`),
    'and a reader that reasons on the category counts it as current work while it is open',
    `the work preview (${whileOpen.status}) does not list the open task: ${JSON.stringify(whileOpen.titles)} — ` +
      'so its absence after closing would prove nothing',
  )

  const patched = await A(`/tasks/${taskId}`, { method: 'PATCH', body: { status: closed.key } })
  chk(
    patched.status === 200,
    `setting it to ${closed.key} is accepted`,
    `the PATCH answered ${patched.status} — the checks below would be about the wrong thing`,
  )

  /*
   * READ BACK, rather than trusting the PATCH response. The bug lived in what
   * was STORED, and a response echoing the request would have hidden it.
   */
  const after = (await A(`/tasks/${taskId}`)).data
  chk(
    after?.status === closed.key,
    'and the stored status is the key that was asked for',
    `stored status is "${after?.status}", asked for "${closed.key}"`,
  )
  chk(
    after?.statusCategory === 'closed',
    'and the stored CATEGORY says closed — the half that used to disagree',
    `status is "${after?.status}" but statusCategory is "${after?.statusCategory}" — the two disagree, which is the defect`,
  )

  /*
   * A reader that reasons on the category, rather than a second look at the
   * same column. The teams work preview lists a person's OPEN work; a task
   * stored as done-but-open shows up there forever.
   */
  const afterClose = await titlesIn()
  chk(
    afterClose.status === 200 && !afterClose.titles.includes(`done-check ${TAG}`),
    'and a reader that reasons on the category no longer counts it as current work',
    `the work preview (${afterClose.status}) still lists it: ${JSON.stringify(afterClose.titles)}`,
  )

  /*
   * The path that was always correct, asserted so a future "simplification"
   * cannot quietly take the seeding out of `ListsService.create` too.
   */
  const mkList = await A('/lists', { method: 'POST', body: { projectId: projects[0].id, name: `List ${TAG}` } })
  const viaService = mkList.data?.id ? (await A(`/lists/${mkList.data.id}/statuses`)).data ?? [] : []
  chk(
    mkList.status < 300 && viaService.length === statuses.length && viaService.length > 0,
    'a list made through POST /lists gets the same pipeline as the starter one',
    `POST /lists (${mkList.status}) gave ${viaService.length} statuses, the starter list has ${statuses.length}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mSUITE ERROR\x1b[0m ${err?.message ?? err}`)
} finally {
  for (const id of made) {
    // `apiAs` never throws, so a status check is the only way to know.
    const res = await A(`/workspaces/${id}`, { method: 'DELETE' })
    if (res.status >= 300 && res.status !== 404) {
      console.log(`  \x1b[33mCLEANUP\x1b[0m could not archive ${id}: ${res.status}`)
    }
  }
}

const ran = passed + failed
console.log(`\n${passed} passed, ${failed} failed`)
if (ran !== EXPECTED_CHECKS) {
  console.log(`\x1b[31monly ${ran} of ${EXPECTED_CHECKS} checks ran — the suite stopped early\x1b[0m`)
  process.exit(1)
}
process.exit(failed === 0 ? 0 : 1)
