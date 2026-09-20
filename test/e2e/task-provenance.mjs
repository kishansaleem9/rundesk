/**
 * §V2-04 — a task says what made it.
 *
 * `[03:26]` "yeh TASK TYPES hain: MILESTONE, FORM RESPONSE, ya MEETING NOTE se
 * task create hue" — the type is where a task came from. Frame `03:25` shows
 * the picker offering Task (default) · Milestone · Form Response · Meeting Note.
 *
 * Rundesk has turned form submissions into tasks since forms shipped, and the
 * only trace was the title reading "Form submission: …". That is prose a person
 * has to read; it is invisible to the type filter, to the list badge, and to
 * anyone scanning for what came in from the website this week.
 *
 * WHAT THIS ASSERTS, and why it is not the type's NAME.
 *
 * The stamping resolves the type by an `origin` marker on the row, not by
 * matching the string "Form Response" — task types are the workspace's
 * vocabulary to change, and a rename or a translation must not quietly stop it.
 * So the checks read `origin`, and one of them renames the type first and
 * insists the stamping survives. A check written against the name would pass
 * under a build that matches on the name, which is the build this design exists
 * to rule out.
 *
 *   node test/e2e/task-provenance.mjs --api 3011
 */
import { signInApi } from './lib/signin.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 8

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
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${bad ?? good}`) }
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

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const anon = apiAs(null)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id
  if (!workspaceId) throw new Error('no workspace to work in')
  const stamp = Date.now()

  console.log('\n▶ §V2-04 — the workspace knows the two provenance types')
  const types = (await A(`/workspaces/${workspaceId}/task-types`)).data ?? []
  const formType = types.find((t) => t.origin === 'form')
  const meetingType = types.find((t) => t.origin === 'meeting')
  chk(!!formType, 'a type stands for "a form made this"',
    `no type carries origin 'form' — types: ${JSON.stringify(types.map((t) => [t.name, t.origin]))}`)
  chk(!!meetingType, 'and another for "a meeting made this"',
    `no type carries origin 'meeting' — types: ${JSON.stringify(types.map((t) => [t.name, t.origin]))}`)

  /*
   * A list of this suite's own. Routing a form at somebody's real list would
   * leave a stray task behind on every run.
   */
  const spaces = (await A(`/spaces/workspace/${workspaceId}`)).data ?? []
  let listId = null
  for (const s of spaces) {
    for (const p of (await A(`/projects/space/${s.id}`)).data ?? []) {
      const ls = (await A(`/lists/project/${p.id}`)).data ?? []
      if (ls[0]?.id) { listId = ls[0].id; break }
    }
    if (listId) break
  }
  if (!listId) throw new Error('no list to route a form at')

  console.log('\n▶ a submission arrives as a task that says so')
  const form = (await A(`/workspaces/${workspaceId}/forms`, {
    method: 'POST',
    body: { title: `Provenance form ${stamp}`, targetListId: listId, isPublic: true },
  })).data
  if (!form?.slug) throw new Error(`could not create a form: ${JSON.stringify(form)}`)

  const submitted = await anon(`/forms/${form.slug}/submit`, {
    method: 'POST',
    body: { data: { note: `from the website ${stamp}` }, submitterEmail: `visitor-${stamp}@rundesk.invalid` },
  })
  chk(submitted.status < 400, 'the public form accepts a submission',
    `submit returned ${submitted.status}: ${JSON.stringify(submitted.error)}`)

  const submissions = (await A(`/workspaces/${workspaceId}/forms/${form.id}/submissions`)).data ?? []
  // `createdTaskId`, not `taskId` — the column is `created_task_id`. The first
  // version of this read the wrong name, found undefined, and reported the
  // product as broken when routing had worked perfectly.
  const routedTaskId = submissions.find((s) => s.createdTaskId)?.createdTaskId
  chk(!!routedTaskId, 'and it is routed into a task',
    `no submission carried a createdTaskId: ${JSON.stringify(submissions.map((s) => s.createdTaskId))}`)

  const routed = routedTaskId ? (await A(`/tasks/${routedTaskId}`)).data : null
  chk(
    !!routed && routed.taskTypeId === formType?.id,
    'the task carries the type that means "a form made this"',
    `task type was ${JSON.stringify(routed?.taskTypeId)}, the form type is ${JSON.stringify(formType?.id)}`,
  )

  /*
   * The control. Without it every check above passes under a build that stamps
   * the form type onto EVERY task it creates.
   */
  console.log('\n▶ and an ordinary task is left alone')
  const plain = (await A('/tasks', { method: 'POST', body: { listId, title: `Typed by hand ${stamp}` } })).data
  chk(
    !!plain?.id && plain.taskTypeId !== formType?.id,
    'a task a person makes is not stamped as a form response',
    `a hand-made task came back with the form type (${JSON.stringify(plain?.taskTypeId)})`,
  )

  /*
   * The design under test, stated as a check.
   *
   * The stamping resolves the type by its `origin` marker, not by the name
   * "Form Response". Renaming is the difference between the two: a build that
   * matched on the string stops stamping here, silently, and every other check
   * in this file would still pass.
   */
  console.log('\n▶ renaming the type does not stop it')
  const renamed = `Enquiry ${stamp}`
  const patched = await A(`/workspaces/${workspaceId}/task-types/${formType?.id}`, {
    method: 'PATCH', body: { name: renamed },
  })
  chk(patched.status < 400, 'the workspace can rename its own type',
    `PATCH task-type returned ${patched.status}: ${JSON.stringify(patched.error)}`)

  const second = await anon(`/forms/${form.slug}/submit`, {
    method: 'POST',
    body: { data: { note: `after the rename ${stamp}` }, submitterEmail: `visitor2-${stamp}@rundesk.invalid` },
  })
  const afterRename = (await A(`/workspaces/${workspaceId}/forms/${form.id}/submissions`)).data ?? []
  const newestTaskId = afterRename
    .filter((s) => s.createdTaskId && s.createdTaskId !== routedTaskId)
    .map((s) => s.createdTaskId)[0]
  const afterTask = newestTaskId ? (await A(`/tasks/${newestTaskId}`)).data : null
  chk(
    second.status < 400 && !!afterTask && afterTask.taskTypeId === formType?.id,
    'a submission after the rename is still stamped',
    `submit ${second.status}; task type ${JSON.stringify(afterTask?.taskTypeId)} vs ${JSON.stringify(formType?.id)}`,
  )

  // Put the name back — this runs against a real workspace.
  if (formType?.id) {
    await A(`/workspaces/${workspaceId}/task-types/${formType.id}`, {
      method: 'PATCH', body: { name: formType.name },
    }).catch(() => {})
  }
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
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
