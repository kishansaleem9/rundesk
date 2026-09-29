/**
 * §V2-S16 frames `17:44` → `18:45` → `18:48` — the AI brings a CONTAINER into
 * existence.
 *
 * `[17:44]` she types *"create a folder name as ddddd on rundesk space"*;
 * `18:45` draws **Handling** over *"Checking the rundesk setup"* / *"Creating
 * the new rundesk list"*; `18:48` settles to *"Done, created `rundesk > ddddd`
 * in rundesk with standard task statuses."*
 *
 * WHAT THIS SUITE IS GUARDING, and why every check ends in a SELECT:
 *
 *   1. THE ROW EXISTS. This row's failure mode is the one the audit names as
 *      the worst — a tool the model can call that reports success and writes
 *      nothing, with the transcript of the conversation left standing as
 *      evidence that it worked. So nothing here trusts the response: the id
 *      that comes back is looked up in Postgres, and the list is read back
 *      through the ordinary REST path a person's list is read through.
 *
 *   2. THE STATUS PIPELINE IS ON IT. A list created by a raw insert gets no
 *      statuses, and a list with no statuses accepts `status = 'done'` while
 *      keeping `status_category = 'open'` forever — work marked complete that
 *      never counts as complete, silently, in every report. `seedListStatuses`
 *      is the one way, and `ListsService.createList` is the one caller; this
 *      asserts the six rows are really there.
 *
 *   3. PERMISSION IS CHECKED WHERE THE REST PATH CHECKS IT. An action arrives
 *      in the BODY of `/ai/command/execute`, so it is attacker-supplied. A
 *      space in a workspace this account is not a member of must be refused,
 *      and must leave no row — which is checked by counting, not by reading the
 *      refusal.
 *
 *   4. THE MODEL-FACING HALF ANSWERS WHAT `/ai/status` SAYS. With no model
 *      configured — CI, and every lane `RUNDESK_LANE_MODEL` does not name —
 *      `/ai/command` and `/ai/chat` refuse with 503, and that is a real failure
 *      path rather than something to work around; where a model answers they
 *      must not refuse. Checked here so the difference between "no key" and
 *      "no tools" stays visible. The tool layer is exercised through
 *      `/ai/command/execute`, which makes no model call at all — the same door
 *      the five task tools already use — so it runs the same either way.
 *
 * ITS OWN FIXTURES. Everything is created inside one space this run makes,
 * named with a unique tag, and every count is scoped to that space. The
 * unreachable-workspace fixture is direct SQL because no endpoint can create a
 * workspace you are not a member of — that is the whole point of it.
 *
 *   node test/e2e/ai-create-containers.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { apiClient, login, pickWorkspace } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { openDb } from './lib/db.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". Exact, so a skipped branch is a failure. */
const EXPECTED_CHECKS = 33

const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'
const REPO = path.resolve(import.meta.dirname, '../..')

const TAG = `e2e-aic-${Date.now()}`
const LIST_NAME = `${TAG}-list`
const FOLDER_NAME = `${TAG}-folder`

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
// THE SENTENCE, THEN THE REASON: a failing check that printed only its reason
// named no check `check-break-reddened.mjs` could find when the reason was
// built from the run (`found-29-sep/failing-checks-print-only-their-reason`).
const chk = (c, good, badMsg) => (c ? ok(good) : bad(badMsg && badMsg !== good ? `${good} \u2014 ${badMsg}` : good))

const auth = await login(`${B}/api/v1`, EMAIL, PASSWORD)
const api = apiClient(`${B}/api/v1`, auth.accessToken)
const WS = process.env.E2E_WS ?? (await pickWorkspace(api)).id

/** Run one plan action through the confirm path. No model is involved. */
const execute = (action) =>
  api('/ai/command/execute', { method: 'POST', body: { workspaceId: WS, actions: [action] } })

let sql = null
let spaceId = null
let strangerWorkspace = null
let strangerSpace = null

try {
  console.log('\n▶ a space of our own to build in')
  const made = await api('/spaces', { method: 'POST', body: { workspaceId: WS, name: TAG } })
  chk(
    made.status < 400 && !!made.data?.id,
    'the suite has its own space, so every count below is about its own rows',
    `creating the fixture space returned ${made.status} ${JSON.stringify(made.data).slice(0, 160)}`,
  )
  if (!made.data?.id) throw new Error('no fixture space; the remaining checks would measure nothing')
  spaceId = made.data.id

  sql = await openDb()
  chk(
    !!sql,
    'the suite can reach the database to assert what was written',
    'no DATABASE_URL — every "the row exists" check below would have to trust the response, ' +
      'which is the exact thing this row is about, so they are reported as failures rather than skipped',
  )
  if (!sql) throw new Error('no database handle; the remaining checks cannot be honest')

  // ── The list ───────────────────────────────────────────────────────────────
  console.log('\n▶ `[18:48]` "Done, created rundesk > ddddd … with standard task statuses"')
  const listRes = await execute({
    tool: 'create_list',
    args: { spaceId, name: LIST_NAME },
    humanLabel: `Create list ${TAG} > ${LIST_NAME}`,
  })
  chk(
    listRes.status < 400,
    'the confirm path accepts a create_list action',
    `/ai/command/execute returned ${listRes.status} ${JSON.stringify(listRes.data).slice(0, 200)}`,
  )
  const listResult = listRes.data?.results?.[0]
  chk(
    listResult?.status === 'succeeded',
    'and reports it succeeded',
    `it reported ${JSON.stringify(listResult)}`,
  )
  /*
   * THE ID, NOT THE SENTENCE. Everything below addresses the row by the id the
   * response handed back: a tool that invented an id, or returned none, fails
   * here rather than three checks later on a name that happens to match.
   */
  const listId = listResult?.container?.id
  chk(
    typeof listId === 'string' && listId.length === 36,
    'and hands back the id of what it made',
    `the result carried container=${JSON.stringify(listResult?.container)} — an action that reports ` +
      'success without an id is a claim with nothing behind it',
  )
  if (!listId) throw new Error('no list id was returned; the database checks cannot address anything')

  const [listRow] = await sql`select id, name, project_id, is_archived from lists where id = ${listId}`
  chk(
    !!listRow && listRow.name === LIST_NAME,
    'THE ROW IS IN POSTGRES, under exactly that id and name',
    `select by id returned ${JSON.stringify(listRow ?? null)} — the assistant said it created a list ` +
      'and the database does not have one',
  )
  chk(
    listRow?.is_archived === false,
    'and it is live, not born archived',
    `is_archived was ${JSON.stringify(listRow?.is_archived)}`,
  )
  const statusRows = await sql`select key, category from list_statuses where list_id = ${listId} order by position`
  chk(
    statusRows.length === 6,
    'with the whole default status pipeline seeded on it — six statuses',
    `it has ${statusRows.length} statuses; a list with none accepts status='done' while keeping ` +
      "status_category='open' forever, which is work completed that never counts as completed",
  )
  chk(
    statusRows.some((s) => s.category === 'closed') && statusRows.some((s) => s.category === 'open'),
    'covering both an open and a closed category, so a task can actually be finished in it',
    `the categories present were ${JSON.stringify([...new Set(statusRows.map((s) => s.category))])}`,
  )
  /*
   * READ BACK THROUGH THE PRODUCT, not only through SQL. A row that exists but
   * is invisible to the ordinary list reader is not a list anybody has.
   */
  const spaceLists = await api(`/lists/space/${spaceId}`)
  chk(
    spaceLists.status === 200 && (spaceLists.data ?? []).some((l) => l.id === listId),
    'and the ordinary "lists in this space" endpoint returns it, like any other list',
    `GET /lists/space returned ${spaceLists.status} with ids ${JSON.stringify((spaceLists.data ?? []).map((l) => l.id))}`,
  )
  /*
   * EXACT, not `includes`. The list's own name contains the tag, so an
   * `includes(TAG)` check would still pass on a path whose SPACE half had been
   * replaced with something else — which is precisely the failure that matters
   * here: a container created one space over still reads correctly in the
   * answer, and nobody goes looking for a list that is exactly where it was
   * asked for.
   */
  chk(
    listResult?.container?.path === `${TAG} > ${LIST_NAME}`,
    'the path it reports names the space it really went into',
    `the reported path was ${JSON.stringify(listResult?.container?.path)}, not ${JSON.stringify(`${TAG} > ${LIST_NAME}`)}`,
  )

  // ── The folder ─────────────────────────────────────────────────────────────
  console.log('\n▶ `[17:44]` "create a folder name as ddddd on rundesk space"')
  const folderRes = await execute({
    tool: 'create_folder',
    args: { spaceId, name: FOLDER_NAME },
    humanLabel: `Create folder ${TAG} > ${FOLDER_NAME}`,
  })
  const folderResult = folderRes.data?.results?.[0]
  chk(
    folderResult?.status === 'succeeded' && typeof folderResult?.container?.id === 'string',
    'a create_folder action succeeds and returns an id',
    `it reported ${JSON.stringify(folderResult)}`,
  )
  const folderId = folderResult?.container?.id
  const folderRows = folderId
    ? await sql`select id, name, space_id from folders where id = ${folderId}`
    : []
  chk(
    folderRows.length === 1 && folderRows[0].space_id === spaceId,
    'and the folder row is in Postgres, in that space',
    `select by id returned ${JSON.stringify(folderRows)}`,
  )
  const folderList = await api(`/spaces/${spaceId}/folders`)
  chk(
    folderList.status === 200 && (folderList.data ?? []).some((f) => f.id === folderId),
    'and the space’s own folders endpoint returns it',
    `GET /spaces/:id/folders returned ${folderList.status} with ${JSON.stringify((folderList.data ?? []).map((f) => f.id))}`,
  )

  // ── The refusals ───────────────────────────────────────────────────────────
  console.log('\n▶ a refusal has to leave nothing behind, not just say no')
  const beforeDup = Number(
    (await sql`select count(*)::int as n from lists l join projects p on p.id = l.project_id where p.space_id = ${spaceId}`)[0].n,
  )
  const dup = await execute({
    tool: 'create_list',
    args: { spaceId, name: LIST_NAME },
    humanLabel: 'duplicate',
  })
  const dupResult = dup.data?.results?.[0]
  chk(
    dupResult?.status === 'skipped' && dupResult?.reason === 'name_taken',
    'a second list with the same name is refused as `name_taken`',
    `it reported ${JSON.stringify(dupResult)} — §V2-S11 08:50 is "List name taken", not a 500`,
  )
  const afterDup = Number(
    (await sql`select count(*)::int as n from lists l join projects p on p.id = l.project_id where p.space_id = ${spaceId}`)[0].n,
  )
  chk(
    afterDup === beforeDup,
    'and the refusal wrote nothing — the list count in this space did not move',
    `the space went from ${beforeDup} to ${afterDup} lists on a refused create`,
  )

  const nowhere = await execute({
    tool: 'create_list',
    args: { spaceId: '00000000-0000-4000-8000-000000000000', name: `${TAG}-nowhere` },
    humanLabel: 'nowhere',
  })
  chk(
    nowhere.data?.results?.[0]?.status === 'skipped' &&
      nowhere.data.results[0].reason === 'unknown_space',
    'a space id that does not exist is refused as `unknown_space`',
    `it reported ${JSON.stringify(nowhere.data?.results?.[0])}`,
  )
  const strayByName = await sql`select id from lists where name = ${`${TAG}-nowhere`}`
  chk(
    strayByName.length === 0,
    'and nothing by that name exists anywhere in the database',
    `${strayByName.length} row(s) were created for a refused action`,
  )

  console.log('\n▶ a space in a workspace this account is not a member of')
  /*
   * DIRECT SQL, and this is the legitimate case for it: no endpoint can create
   * a workspace you are not a member of, because creating one makes you one.
   * The action is then handed straight to `/ai/command/execute` with OUR
   * workspaceId in the body and a foreign spaceId in the args — which is
   * exactly the shape of the attack, and proves the executor resolves the
   * workspace from the SPACE rather than trusting the body.
   */
  const [ws] = await sql`
    insert into workspaces (organization_id, name, slug)
    select organization_id, ${`${TAG}-stranger`}, ${`${TAG}-stranger`} from workspaces where id = ${WS}
    returning id
  `
  strangerWorkspace = ws?.id ?? null
  chk(
    !!strangerWorkspace,
    'a second workspace exists that this account has no membership row in',
    'the stranger workspace could not be created, so the permission check below would prove nothing',
  )
  const [sp] = await sql`
    insert into spaces (workspace_id, name) values (${strangerWorkspace}, ${`${TAG}-stranger-space`}) returning id
  `
  strangerSpace = sp?.id ?? null
  const members = await sql`
    select count(*)::int as n from workspace_members where workspace_id = ${strangerWorkspace}
  `
  chk(
    Number(members[0].n) === 0,
    'with nobody in it at all, so membership cannot accidentally pass',
    `the stranger workspace already has ${members[0].n} member(s)`,
  )
  const trespass = await execute({
    tool: 'create_list',
    args: { spaceId: strangerSpace, name: `${TAG}-trespass` },
    humanLabel: 'trespass',
  })
  const trespassResult = trespass.data?.results?.[0]
  chk(
    trespassResult?.status === 'skipped' && trespassResult?.reason === 'no_permission',
    'creating there is refused as `no_permission`',
    `it reported ${JSON.stringify(trespassResult)} — the workspace in the BODY must not be what is ` +
      'checked; the space names its own workspace and that is the one that counts',
  )
  const trespassRows = await sql`
    select l.id from lists l join projects p on p.id = l.project_id where p.space_id = ${strangerSpace}
  `
  chk(
    trespassRows.length === 0,
    'and no list was written into the stranger’s space',
    `${trespassRows.length} list(s) landed in a space this account may not touch`,
  )
  /*
   * AND NO CONTAINER PROJECT EITHER. `defaultContainerForSpace` inserts a
   * hidden project before the list is made; if the permission check ran after
   * it, a refused action would still have written a row into somebody else's
   * space. That is the half of this that a "no list was created" check cannot
   * see.
   */
  const trespassProjects = await sql`select id from projects where space_id = ${strangerSpace}`
  chk(
    trespassProjects.length === 0,
    'and not even the hidden container project — the check runs before the first write',
    `${trespassProjects.length} project(s) were created in the stranger’s space by a refused action`,
  )

  // ── The model-facing half ──────────────────────────────────────────────────
  /*
   * ASKED AGAINST THE CONFIGURATION, NOT AGAINST THE ENVIRONMENT THIS HAPPENED
   * TO RUN IN.
   *
   * These three checks were `=== 503` three times, under the heading "with no
   * provider key". True of every lane, because no lane had a model — and the
   * third check said so itself: "if this says available:true, the two 503s
   * above mean something else entirely and this suite is measuring the wrong
   * thing." That trap was right, and `lane-env.sh` can now spring it: on a
   * lane `RUNDESK_LANE_MODEL` names (`all`, or a list of lane numbers) the API
   * talks to `model-stub.mjs`, and the two endpoints answer instead of
   * refusing.
   *
   * So the claim is rewritten as the one that was always meant: THE THREE
   * AGREE. `/ai/status` says whether a model is configured, and `/ai/command`
   * and `/ai/chat` must answer the same question the same way — 503 when it
   * says no, something other than 503 when it says yes. That holds in either
   * environment, it is a stronger statement than "503" was, and it still
   * reddens for every patch that made the old one redden: a route that 503s
   * while the status says available is exactly as broken as the reverse.
   *
   * THE COUNT IS THE SAME EITHER WAY, deliberately. A suite that runs three
   * checks in one environment and two in another cannot hold an EXACT
   * `EXPECTED_CHECKS`, and "0 failed" would stop meaning "it ran".
   */
  const status = await api('/ai/status')
  const modelConfigured = status.status === 200 && status.data?.available === true
  console.log(
    `\n▶ the model-facing endpoints answer what /ai/status says (a model is ` +
      `${modelConfigured ? 'CONFIGURED' : 'not configured'} on this lane)`,
  )
  chk(
    status.status === 200 && typeof status.data?.available === 'boolean',
    'the product says plainly whether a model is configured',
    `/ai/status returned ${status.status} ${JSON.stringify(status.data)} — the two checks below ` +
      'are about agreeing with it, so an answer that is neither true nor false makes them meaningless',
  )
  /*
   * "NOT REFUSING" IS AN ANSWER, NOT THE ABSENCE OF ONE STATUS. Where a model is
   * configured these asked `!== 503`, which a 404 (the route gone) or a 500
   * passes. Not refusing means answering: `/ai/command` with a plan — a 2xx
   * carrying its summary and its actions — and `/ai/chat` with a 2xx that
   * opens an event stream.
   */
  const planned = await api('/ai/command', { method: 'POST', body: { workspaceId: WS, message: 'create a list' } })
  const plannedAnswer = planned.status >= 200 && planned.status < 300 &&
    typeof planned.data?.summary === 'string' && Array.isArray(planned.data?.actions)
  chk(
    modelConfigured ? plannedAnswer : planned.status === 503,
    '/ai/command agrees with it — refusing outright when there is no model, and not refusing when there is',
    `it returned ${planned.status} ${JSON.stringify(planned.data).slice(0, 160)} while /ai/status said ` +
      `available=${JSON.stringify(status.data?.available)}`,
  )
  const streamed = await fetch(`${B}/api/v1/ai/chat`, {
    method: 'POST',
    headers: { authorization: `Bearer ${auth.accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ workspaceId: WS, messages: [{ role: 'user', content: 'create a list' }] }),
  })
  /*
   * THE DISTINCTION THIS SUITE EXISTS TO KEEP VISIBLE, and it survives the
   * rewrite. "No key" and "no tools" both produce a chat that cannot create
   * anything. The execute path above proves the tools are real; this proves
   * the refusal — when there is one — is about the key and arrives as a status
   * code before a stream is opened, rather than as an error inside one.
   */
  const streamType = streamed.headers.get('content-type') ?? ''
  chk(
    modelConfigured
      ? streamed.status >= 200 && streamed.status < 300 && /text\/event-stream/.test(streamType)
      : streamed.status === 503,
    'and /ai/chat agrees too, before opening a stream, so a refusal is a status code rather than a message inside one',
    `it returned ${streamed.status} (${streamType || 'no content-type'}) while /ai/status said ` +
      `available=${JSON.stringify(status.data?.available)}`,
  )

  // ── What a chip in an answer resolves to ───────────────────────────────────
  console.log('\n▶ `20:10` — the reference an answer would carry resolves to the real row')
  /*
   * 200 IS PART OF THE CLAIM, not boilerplate. Resolving the chips in an answer
   * is a READ whose argument happens to be a body; Nest answers a `@Post` with
   * 201 Created unless told otherwise, and a read that reports Created is wrong
   * in the access log, wrong for any client that branches on the status, and
   * indistinguishable here from the create path this suite is about. It shipped
   * that way and this check is what found it.
   */
  const refs = await api('/ai/refs', { method: 'POST', body: { workspaceId: WS, listIds: [listId] } })
  chk(
    refs.status === 200 && (refs.data?.lists ?? []).some((l) => l.id === listId),
    'the list the AI made resolves through /ai/refs, and the read answers 200 rather than "Created"',
    `it returned ${refs.status} ${JSON.stringify(refs.data).slice(0, 200)} — 201 from a route that writes ` +
      'nothing is a read announcing a create',
  )
  chk(
    (refs.data?.lists ?? []).find((l) => l.id === listId)?.path?.includes(LIST_NAME),
    'with the path a chip prints',
    `the resolved path was ${JSON.stringify((refs.data?.lists ?? [])[0]?.path)}`,
  )
  const foreignRef = await api('/ai/refs', { method: 'POST', body: { workspaceId: WS, listIds: [listId], taskIds: ['not-a-uuid'] } })
  chk(
    foreignRef.status === 200 && (foreignRef.data?.tasks ?? []).length === 0,
    'a malformed id is dropped rather than turned into a database error',
    `it returned ${foreignRef.status} ${JSON.stringify(foreignRef.data).slice(0, 160)} — an unchecked id ` +
      'reaches a uuid column as a query Postgres refuses, which surfaces as a 500',
  )

  console.log('\n▶ the per-status breakdown a project-status answer is built from')
  const breakdown = await api(`/ai/project-status?workspaceId=${WS}`)
  chk(
    breakdown.status === 200 && Array.isArray(breakdown.data?.byStatus),
    'GET /ai/project-status answers without a model at all',
    `it returned ${breakdown.status} ${JSON.stringify(breakdown.data).slice(0, 200)}`,
  )
  const sumByStatus = (breakdown.data?.byStatus ?? []).reduce((n, s) => n + s.count, 0)
  const cat = breakdown.data?.byCategory ?? {}
  chk(
    sumByStatus === breakdown.data?.total &&
      (cat.open ?? 0) + (cat.in_progress ?? 0) + (cat.closed ?? 0) === breakdown.data?.total,
    'and its two breakdowns each add up to its own total',
    `byStatus summed to ${sumByStatus}, byCategory to ${(cat.open ?? 0) + (cat.in_progress ?? 0) + (cat.closed ?? 0)}, ` +
      `total is ${breakdown.data?.total} — a breakdown that does not add up is the confident zero with extra steps`,
  )
  /*
   * MEASURED AGAINST A TASK THIS SUITE PUTS THERE, so it is a delta against
   * rows it owns rather than an assertion about the shared database. A
   * breakdown that ignored its query key would not move.
   */
  const seeded = await api('/tasks', {
    method: 'POST',
    body: { listId, title: `${TAG}-task`, status: 'in_progress' },
  })
  chk(
    seeded.status < 400 && !!seeded.data?.id,
    'a task can be created in the list the AI made — it is a real, usable list',
    `creating a task in it returned ${seeded.status} ${JSON.stringify(seeded.data).slice(0, 160)}`,
  )
  const after = await api(`/ai/project-status?workspaceId=${WS}`)
  chk(
    (after.data?.total ?? 0) - (breakdown.data?.total ?? 0) === 1 &&
      (after.data?.byCategory?.in_progress ?? 0) - (cat.in_progress ?? 0) === 1,
    'and the breakdown moves by exactly one, in the in-progress bucket',
    `total moved by ${(after.data?.total ?? 0) - (breakdown.data?.total ?? 0)} and in_progress by ` +
      `${(after.data?.byCategory?.in_progress ?? 0) - (cat.in_progress ?? 0)} for one in-progress task`,
  )
} catch (e) {
  bad(`threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  // Everything this run made, taken back. The stranger workspace cascades.
  if (sql) {
    if (strangerWorkspace) await sql`delete from workspaces where id = ${strangerWorkspace}`.catch(() => {})
    if (spaceId) {
      await sql`delete from tasks where list_id in (
        select l.id from lists l join projects p on p.id = l.project_id where p.space_id = ${spaceId}
      )`.catch(() => {})
      await sql`delete from lists where project_id in (select id from projects where space_id = ${spaceId})`.catch(() => {})
      await sql`delete from folders where space_id = ${spaceId}`.catch(() => {})
      await sql`delete from projects where space_id = ${spaceId}`.catch(() => {})
      await sql`delete from spaces where id = ${spaceId}`.catch(() => {})
    }
    await sql.end({ timeout: 5 }).catch(() => {})
  }
}

const failed = () => results.filter((x) => !x).length
if (results.length !== EXPECTED_CHECKS) {
  console.log(`  \x1b[31mFAIL\x1b[0m ran ${results.length} checks, expected ${EXPECTED_CHECKS}`)
  results.push(0)
}
console.log(`\n${results.length - failed()} passed, ${failed()} failed`)
await stack?.close?.()
process.exit(failed() ? 1 : 0)
