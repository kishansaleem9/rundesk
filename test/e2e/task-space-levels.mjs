/**
 * A SPACE'S PERMISSION REACHES ITS TASKS: "VIEW ONLY" IS VIEW, "COMMENT" IS COMMENT.
 *
 * NOT A FRAME ROW: `found-24-sep/view-only-spaces-take-comments-and-edits`,
 * beside §V2-06's "Default permission" (frame `06:52`), whose reader was built
 * for containers. Measured on lane 1 before the fix, as a plain member: in a
 * space whose default is "view only" the member commented on a task (201) and
 * changed the status of a task assigned to them (200).
 *
 * ClickUp's levels (help.clickup.com "Permissions in detail"): view only
 * cannot comment or edit; comment may comment and, on a task assigned to them,
 * change its status or its assignees; edit may do what the item rule allows.
 * Each level is tried here side by side, every refusal read back from the row,
 * and an explicit grant of "edit" on the view-only space lifts it.
 *
 *   node test/e2e/task-space-levels.mjs --api 3021
 */
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 5

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

/* NEVER THROWS — `{status, data, error, text}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `tsl-${stamp}`
let sql = null
let WS = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — tasks and comments are read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const person = async (who) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, {
      fullName: `Level ${who}`, email, password: 'Member@12345!',
      organizationName: `Level ${who} ${stamp}`, organizationSlug: `level-${who}-${stamp}`,
    })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
    if (added.status >= 300) throw new Error(`could not add the ${who}: ${said(added)}`)
    return { id: signed.user?.id, as: apiAs(signed.accessToken) }
  }
  const member = await person('member')
  const colleague = await person('colleague')
  const M = member.as

  const make = async (route, body, what) => {
    const res = await A(route, { method: 'POST', body })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`)
    return res.data.id
  }
  /** A space at `level`, with a task assigned to the member and one that is not. */
  const place = async (level) => {
    const space = await make('/spaces', { workspaceId: WS, name: `${TAG} ${level}`, defaultPermission: level }, `the ${level} space`)
    const project = await make('/projects', { spaceId: space, name: `${TAG} ${level}` }, `the ${level} project`)
    const list = await make('/lists', { projectId: project, name: `${TAG} ${level}` }, `the ${level} list`)
    const mine = await make('/tasks', { listId: list, title: `${TAG} ${level} mine`, assigneeIds: [member.id] }, `the ${level} task of the member's`)
    return { space, list, mine }
  }
  const view = await place('view')
  const comment = await place('comment')
  const editable = await place('edit')
  const row = async (id) => (await sql`select title, status from tasks where id = ${id}`)[0]
  const comments = async (task) => (await sql`select count(*)::int as n from task_comments where task_id = ${task}`)[0].n
  const assignees = async (task) => (await sql`select user_id from task_assignees where task_id = ${task}`).map((r) => r.user_id)
  const doneStatus = async (list) => {
    const lists = await A(`/lists/${list}`)
    const statuses = lists.data?.statuses ?? lists.data?.customStatuses ?? []
    return statuses.find((s) => s.category === 'closed' || /done|complete/i.test(s.name ?? s.key ?? ''))?.key ?? 'done'
  }
  const setStatus = async (task, list) => M(`/tasks/${task}`, { method: 'PATCH', body: { status: await doneStatus(list) } })

  // ══ 1. VIEW ONLY ═════════════════════════════════════════════════════════
  console.log('\n▶ "view only"')
  const vComment = await M(`/tasks/${view.mine}/comments`, { method: 'POST', body: { body: `${TAG} said in view only` } })
  const vStatus = await setStatus(view.mine, view.list)
  const eComment = await M(`/tasks/${editable.mine}/comments`, { method: 'POST', body: { body: `${TAG} said in edit` } })
  chk(
    vComment.status === 403 && (await comments(view.mine)) === 0 && eComment.status === 201 && (await comments(editable.mine)) === 1,
    'in a “view only” space a member cannot comment (403, none written) — in an “edit” space they do',
    `view only ${said(vComment)}; edit ${said(eComment)}`,
  )
  const vAfter = await row(view.mine)
  const eStatus = await setStatus(editable.mine, editable.list)
  const eAfter = await row(editable.mine)
  chk(
    vStatus.status === 403 && vAfter.status !== (await doneStatus(view.list)) && eStatus.status === 200 && eAfter.status === (await doneStatus(editable.list)),
    'nor change the status of a task assigned to them (403, unchanged) — in an “edit” space they do',
    `view only ${said(vStatus)}, now "${vAfter.status}"; edit ${said(eStatus)}, now "${eAfter.status}"`,
  )

  // ══ 2. COMMENT ═══════════════════════════════════════════════════════════
  console.log('\n▶ "comment"')
  const cComment = await M(`/tasks/${comment.mine}/comments`, { method: 'POST', body: { body: `${TAG} said in comment` } })
  const cStatus = await setStatus(comment.mine, comment.list)
  const cTitle = await M(`/tasks/${comment.mine}`, { method: 'PATCH', body: { title: `${TAG} renamed in comment` } })
  const cAfter = await row(comment.mine)
  chk(
    cComment.status === 201 && cStatus.status === 200 && cAfter.status === (await doneStatus(comment.list)) &&
      cTitle.status === 403 && cAfter.title === `${TAG} comment mine`,
    'in a “comment” space a member comments and changes the status of a task assigned to them — but not its title (403, unchanged)',
    `comment ${said(cComment)}, status ${said(cStatus)} (now "${cAfter.status}"), title ${said(cTitle)} (now "${cAfter.title}")`,
  )
  const cAssign = await M(`/tasks/${comment.mine}/assignees`, { method: 'POST', body: { userId: colleague.id } })
  const vAssign = await M(`/tasks/${view.mine}/assignees`, { method: 'POST', body: { userId: colleague.id } })
  chk(
    cAssign.status < 300 && (await assignees(comment.mine)).includes(colleague.id) &&
      vAssign.status === 403 && !(await assignees(view.mine)).includes(colleague.id),
    'an assignee in a “comment” space may add a colleague to their task — in a “view only” space not (403, not added)',
    `comment ${said(cAssign)}; view only ${said(vAssign)}`,
  )

  // ══ 3. AN EXPLICIT GRANT WINS ════════════════════════════════════════════
  console.log('\n▶ "edit" granted on the view-only space')
  await sql`insert into space_members (space_id, user_id, role) values (${view.space}, ${member.id}, 'edit') on conflict (space_id, user_id) do update set role = 'edit'`
  const gComment = await M(`/tasks/${view.mine}/comments`, { method: 'POST', body: { body: `${TAG} said with a grant` } })
  const gTitle = await M(`/tasks/${view.mine}`, { method: 'PATCH', body: { title: `${TAG} renamed with a grant` } })
  chk(
    gComment.status === 201 && gTitle.status === 200 && (await row(view.mine)).title === `${TAG} renamed with a grant`,
    'a member given “edit” on the view-only space comments and renames their task there — the grant wins over the default',
    `comment ${said(gComment)}, rename ${said(gTitle)}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
  }
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
