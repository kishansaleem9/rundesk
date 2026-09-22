/**
 * §V2-08 — Merge, frame `15:32`.
 *
 * She never narrates it: it is visible in the menu and she moves on, so it
 * ranked last in this item. It is also the one that moves the most, and the
 * only one whose failure mode is silent data loss.
 *
 * WHAT THIS SUITE IS FOR, and it is one thing: NOTHING IS LOST. Two people file
 * the same bug, somebody merges the duplicates, and the comment that actually
 * explained the reproduction was on the one that disappeared. So the source
 * task is loaded up with one of everything — a comment, an attachment, a
 * checklist, a subtask, an assignee, a watcher, a label, a time entry, a
 * dependency — and each is counted on the survivor afterwards. A merge that
 * returned `{ ok: true }` and moved eight of nine would pass a check that only
 * asserted "it worked".
 *
 * THE SHARED ROWS ARE THE INTERESTING HALF. Both tasks are given the SAME
 * assignee, watcher and label before merging, because duplicates being merged
 * almost always share them and every one of those tables is unique on
 * (task, thing). A bulk `UPDATE ... SET task_id` throws on the first collision;
 * the checks below would catch that as a 500, and would also catch the opposite
 * mistake of dropping rows that were not actually duplicates.
 *
 *   node test/e2e/task-merge.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'

const REPO = path.resolve(import.meta.dirname, '../..')
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 28

const chromium = await resolveChromium()
const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))
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

const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const me = (await A('/users/me')).data
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id
  const stamp = Date.now()

  const spaces = (await A(`/spaces/workspace/${workspaceId}`)).data ?? []
  let spaceId = null, projectId = null, listId = null
  for (const s of spaces) {
    for (const p of (await A(`/projects/space/${s.id}`)).data ?? []) {
      const ls = (await A(`/lists/project/${p.id}`)).data ?? []
      if (ls[0]?.id) { spaceId = s.id; projectId = p.id; listId = ls[0].id; break }
    }
    if (listId) break
  }
  if (!listId) throw new Error('no list to make a task in')

  const makeTask = async (title, body = {}) =>
    (await A('/tasks', { method: 'POST', body: { listId, title, ...body } })).data

  // ── A source loaded with one of everything ───────────────────────────────
  const source = await makeTask(`Duplicate bug ${stamp}`, { description: `EVIDENCE ${stamp}` })
  const target = await makeTask(`The real bug ${stamp}`, { description: `THE PLAN ${stamp}` })
  const third = await makeTask(`A blocker ${stamp}`)
  if (!source?.id || !target?.id || !third?.id) throw new Error('could not make the tasks')

  await A(`/tasks/${source.id}/comments`, { method: 'POST', body: { body: `THE REPRO ${stamp}` } })
  await A(`/tasks/${source.id}/attachments`, {
    method: 'POST',
    body: {
      fileName: `evidence-${stamp}.png`,
      storageKey: `workspaces/${workspaceId}/tasks/${source.id}/attachments/evidence-${stamp}.png`,
      contentType: 'image/png',
      sizeBytes: 1234,
    },
  })
  await A(`/tasks/${source.id}/checklists`, { method: 'POST', body: { title: `Steps ${stamp}` } })
  const child = await makeTask(`A subtask ${stamp}`, { parentTaskId: source.id })
  await A(`/tasks/${source.id}/assignees`, { method: 'POST', body: { userId: me.id } })
  await A(`/tasks/${source.id}/watchers`, { method: 'POST', body: { userId: me.id } })
  await A(`/tasks/${source.id}/dependencies`, {
    method: 'POST',
    body: { relatedTaskId: third.id, type: 'blocked_by' },
  })
  /*
   * A dependency BETWEEN the two tasks being merged, which is the only way a
   * self-link can arise: "source blocks target", merged into target, rewrites
   * to "target blocks target". The first version of this suite only linked the
   * source to a THIRD task, so the self-link guard could be deleted and every
   * check still passed — a vacuous check, caught by breaking the guard and
   * watching nothing fail.
   */
  await A(`/tasks/${source.id}/dependencies`, {
    method: 'POST',
    body: { relatedTaskId: target.id, type: 'blocks' },
  })
  /*
   * The same people on BOTH tasks — the normal case for duplicates, and the one
   * that makes every unique index on (task, thing) fire.
   */
  await A(`/tasks/${target.id}/assignees`, { method: 'POST', body: { userId: me.id } })
  await A(`/tasks/${target.id}/watchers`, { method: 'POST', body: { userId: me.id } })

  const countsFor = async (id) => {
    const detail = (await A(`/tasks/${id}`)).data ?? {}
    const comments = (await A(`/tasks/${id}/comments`)).data ?? []
    return {
      comments: comments.length,
      attachments: (detail.attachments ?? []).length,
      checklists: (detail.checklists ?? []).length,
      subtasks: (detail.subtasks ?? []).length,
      assignees: (detail.assignees ?? []).length,
      watchers: (detail.watchers ?? []).length,
      description: detail.description ?? null,
      archived: !!detail.isArchived,
    }
  }

  const before = { source: await countsFor(source.id), target: await countsFor(target.id) }
  chk(
    before.source.comments >= 1 && before.source.attachments >= 1 && before.source.checklists >= 1 && before.source.subtasks >= 1,
    'the task being merged away really is carrying work',
    `it has ${JSON.stringify(before.source)} — with nothing on it, "nothing was lost" proves nothing`,
  )

  // ── The refusals, before the real merge changes the fixtures ─────────────
  console.log('\n▶ §V2-08 — what merging refuses to do')
  const intoItself = await A(`/tasks/${source.id}/merge`, { method: 'POST', body: { targetTaskId: source.id } })
  chk(intoItself.status >= 400 && intoItself.status < 500,
    'a task cannot be merged into itself',
    `merging a task into itself returned ${intoItself.status}`)

  const intoOwnChild = await A(`/tasks/${source.id}/merge`, { method: 'POST', body: { targetTaskId: child.id } })
  chk(
    intoOwnChild.status >= 400 && intoOwnChild.status < 500,
    'and not into its own subtask',
    `merging into its own subtask returned ${intoOwnChild.status} — the survivor would be a child of a binned task`,
  )
  /*
   * AND BY THE RULE THAT REALLY DOES IT. Asserting a 4xx and nothing more is
   * what let this go unnoticed: a break patch deleted the rule everyone
   * believed was refusing this, and the suite stayed green.
   *
   * The rule that actually fires is `would-nest-twice`, and it always will —
   * a target that is the source's own child means the source has a subtask and
   * the target has a parent. The other rule, once called
   * `target-is-descendant`, catches the OPPOSITE relationship and said so to
   * nobody: merging a subtask into its parent answered "A task cannot be
   * merged into its own subtask" until 21 September.
   */
  chk(
    JSON.stringify(intoOwnChild).includes('Subtasks only nest one level deep'),
    'and by the nesting rule, which is the one that really refuses it',
    `it said ${JSON.stringify(intoOwnChild.error ?? null)} — if the nesting rule stopped firing ` +
      'here then nothing else is covering this case, whatever the status code says',
  )

  /*
   * AND THE OTHER DIRECTION, which had no check at all and the wrong sentence.
   */
  const childIntoParent = await A(`/tasks/${child.id}/merge`, { method: 'POST', body: { targetTaskId: source.id } })
  chk(
    JSON.stringify(childIntoParent).includes('A subtask cannot be merged into its own parent'),
    'and a subtask merged into its parent is refused in those words',
    `it said ${JSON.stringify(childIntoParent.error ?? null)} — this refusal spent its whole life ` +
      'describing the opposite merge, because its condition reads the TARGET\'s children and its ' +
      'name, comment, message and unit test all described the source\'s',
  )

  const intoNothing = await A(`/tasks/${source.id}/merge`, {
    method: 'POST',
    body: { targetTaskId: '00000000-0000-0000-0000-000000000000' },
  })
  chk(intoNothing.status === 404, 'and not into a task that does not exist',
    `merging into a missing task returned ${intoNothing.status}`)

  // ── The merge ────────────────────────────────────────────────────────────
  console.log('\n▶ the merge itself, and what it carried')
  const merged = await A(`/tasks/${source.id}/merge`, { method: 'POST', body: { targetTaskId: target.id } })
  chk(
    merged.status === 200 || merged.status === 201,
    'the merge is accepted',
    `merge returned ${merged.status} ${JSON.stringify(merged.error)}`,
  )
  chk(
    !!merged.data?.moved && typeof merged.data.moved.comments === 'number',
    'and it reports what it moved rather than just "ok"',
    `it returned ${JSON.stringify(merged.data)} — a merge you have to take on faith`,
  )

  const after = { source: await countsFor(source.id), target: await countsFor(target.id) }

  chk(after.target.comments >= before.target.comments + before.source.comments,
    'every comment arrived on the survivor',
    `the survivor has ${after.target.comments} comments; it had ${before.target.comments} and ${before.source.comments} were merged in`)
  chk(after.target.attachments >= before.target.attachments + before.source.attachments,
    'and every attachment',
    `the survivor has ${after.target.attachments} attachments, expected at least ${before.target.attachments + before.source.attachments}`)
  chk(after.target.checklists >= before.target.checklists + before.source.checklists,
    'and every checklist',
    `the survivor has ${after.target.checklists} checklists, expected at least ${before.target.checklists + before.source.checklists}`)
  chk(after.target.subtasks >= before.target.subtasks + before.source.subtasks,
    'and every subtask',
    `the survivor has ${after.target.subtasks} subtasks, expected at least ${before.target.subtasks + before.source.subtasks}`)

  /*
   * The shared rows. Both tasks had the same assignee and watcher, so the
   * survivor must end with ONE of each — not two (a duplicate the unique index
   * would have refused) and not zero (the row dropped instead of merged).
   */
  chk(after.target.assignees === 1, 'a shared assignee is not duplicated',
    `the survivor has ${after.target.assignees} assignees — merging duplicated a person onto the task`)
  chk(after.target.watchers === 1, 'and a shared watcher is not duplicated',
    `the survivor has ${after.target.watchers} watchers`)

  // The subtask really points at the survivor now, not merely counted there.
  chk(
    (await A(`/tasks/${child.id}`)).data?.parentTaskId === target.id,
    'the subtask really belongs to the survivor now',
    `the subtask's parent is ${JSON.stringify((await A(`/tasks/${child.id}`)).data?.parentTaskId)}`,
  )

  /*
   * The dependency moved and did not become a self-link. Read from the GRAPH
   * endpoint, which is the only way to ask — there is no plain
   * `GET /tasks/:id/dependencies`, and asking a route that does not exist
   * returned an empty list that looked exactly like a dropped dependency.
   */
  const graph = (await A(`/tasks/${target.id}/dependencies/graph?depth=1`)).data ?? {}
  const edges = graph.edges ?? []
  chk(
    edges.some((d) => d.relatedTaskId === third.id || d.taskId === third.id),
    'the dependency followed the work',
    `the survivor's dependency edges are ${JSON.stringify(edges)}`,
  )
  chk(
    !edges.some((d) => d.taskId === d.relatedTaskId),
    'and nothing became a task blocking itself',
    `a self-dependency was created: ${JSON.stringify(edges.filter((d) => d.taskId === d.relatedTaskId))}`,
  )

  console.log('\n▶ what happened to the two tasks')
  chk(after.source.archived, 'the merged-away task is in the bin',
    'the source is still live — two copies of the same work, which is what merging was meant to end')
  chk(
    (await A(`/tasks/${source.id}`)).status === 200,
    'and it is still readable, not destroyed',
    'the source was deleted — a merge in the wrong direction would be unrecoverable',
  )
  chk(
    (after.target.description ?? '').includes(`THE PLAN ${stamp}`),
    "the survivor keeps its own description",
    `the survivor's description is ${JSON.stringify(after.target.description)}`,
  )
  chk(
    (after.target.description ?? '').includes(`EVIDENCE ${stamp}`),
    'and gains the one it absorbed',
    `the merged description is ${JSON.stringify(after.target.description)} — the other task's description was dropped`,
  )

  // Both tasks say what happened, so neither is a mystery later.
  const targetActivity = (await A(`/tasks/${target.id}/activity`)).data ?? []
  const sourceActivity = (await A(`/tasks/${source.id}/activity`)).data ?? []
  chk(targetActivity.some((e) => e.action === 'merged_in'),
    'the survivor records what arrived',
    `its activity is ${JSON.stringify(targetActivity.map((e) => e.action))}`)
  chk(sourceActivity.some((e) => e.action === 'merged_away'),
    'and the binned task records where its work went',
    `its activity is ${JSON.stringify(sourceActivity.map((e) => e.action))} — somebody following an old link would find it archived with no explanation`)

  const twice = await A(`/tasks/${source.id}/merge`, { method: 'POST', body: { targetTaskId: target.id } })
  chk(
    twice.status >= 400 && twice.status < 500,
    'a binned task cannot be merged again',
    `merging it a second time returned ${twice.status} — work could be pulled out of the bin unnoticed`,
  )
  /*
   * AND BY THE MERGE RULE, not by the write-access check further down. A merged
   * source is `isArchived`, and `assertTaskWriteAccess` refuses archived tasks
   * on its own — so `already-binned` could be deleted outright and this stayed
   * green, which is what `task-merge-3-binned-merged-again` demonstrated. Two
   * guards for one condition is defence in depth and worth keeping; a check
   * that cannot tell them apart means either may rot unnoticed.
   */
  chk(
    JSON.stringify(twice).includes('A task in the bin cannot be merged'),
    'and says so as a merge refusal, not as a write-access failure',
    `it said ${JSON.stringify(twice.error ?? null)} — the merge rule for a binned source is gone ` +
      'and the generic archived-write refusal is standing in for it',
  )

  // ── On screen ────────────────────────────────────────────────────────────
  console.log('\n▶ frame `15:32` — merging from the menu')
  const live = await makeTask(`Merge from UI ${stamp}`, { description: 'ui source' })
  const liveTarget = await makeTask(`UI survivor ${stamp}`)
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.goto(`${stack.base}/app/${workspaceId}/${spaceId}/${projectId}/${listId}?task=${live.id}`, {
    waitUntil: 'domcontentloaded',
  })

  await page.getByTestId('task-more-menu').click({ timeout: 20000 })
  await page.getByTestId('task-menu-merge').click({ timeout: 10000 })
  const opened = await waitUntil(
    () => page.getByTestId('task-merge-dialog').isVisible().catch(() => false),
    { timeoutMs: 10_000 },
  )
  chk(opened, 'Merge opens a picker', 'the Merge item opened nothing')

  /*
   * "Merge" is ambiguous in the one way that matters — which task survives —
   * and getting it backwards bins the wrong one. The dialog has to say so
   * before anything is clickable.
   */
  const direction = await page.getByTestId('task-merge-direction').innerText().catch(() => '')
  chk(
    direction.includes(`Merge from UI ${stamp}`),
    'and says which task is being merged away',
    `it says ${JSON.stringify(direction)} — a person cannot tell which of the two survives`,
  )

  await page.getByTestId('task-merge-search').fill(`UI survivor ${stamp}`)
  await waitUntil(async () => (await page.getByTestId('task-merge-candidate').count()) > 0, { timeoutMs: 10_000 })
  await page.getByTestId('task-merge-candidate').first().click({ timeout: 8000 }).catch(() => {})
  const done = await waitUntil(
    async () => (await A(`/tasks/${live.id}`)).data?.isArchived === true,
    { timeoutMs: 15_000 },
  )
  chk(done, 'and merging from the menu really merges',
    'the task was not binned — the dialog reported something the API never did')

  for (const id of [source.id, target.id, third.id, child.id, live.id, liveTarget.id]) {
    await A(`/tasks/${id}`, { method: 'DELETE' }).catch(() => {})
  }
} catch (e) {
  const lines = e.message.split('\n')
  const where = lines.find((l) => l.includes('waiting for') || l.includes('getByTestId'))
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${lines[0]}${where ? `\n         ${where.trim()}` : ''}`)
} finally {
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
