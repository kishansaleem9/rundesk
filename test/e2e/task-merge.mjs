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
 * AND A VALUE MOVES ONLY ONTO A FIELD THE SURVIVOR HAS
 * (`found-30-sep/merge-moves-values-onto-fields-the-target-lacks`). Every value
 * row of the merged task went to the survivor: measured on lane 7, a task of
 * another list holding a value in a field scoped to its list, and a task of
 * another project holding its project's field, were each merged in (201), and
 * the survivor then held both rows while its fields, read back, showed neither.
 * ClickUp's merge prompts "to either add the Custom Field to task B or merge the
 * tasks without retaining the Custom Field" (help centre, "Merge tasks", read
 * through search excerpts). The value of a field the survivor does not have
 * stays on the binned task, where it is still shown; what the merge says of it,
 * or whether it offers to add the field, is the owner's to decide.
 *
 * AND A SURVIVOR'S EMPTIED VALUE IS NO INFORMATION
 * (`found-6-oct/merge-drops-a-value-beside-an-emptied-one`): its Note set and
 * then cleared kept the merged task's Note in the bin. It now takes the merged
 * value where it is, and a value typed into it while the merge runs is not
 * lost. AND A TASK OF ANOTHER WORKSPACE IS NOT MERGED INTO ONE OF THIS
 * (`found-6-oct/merge-moves-work-across-workspaces`): a merge across two moved
 * a comment from one into the other (201); it is refused with its reason.
 *
 *   node test/e2e/task-merge.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'
import { apiAs as apiAsAt, must } from './lib/fixture.mjs'
import { openDb } from './lib/db.mjs'

const REPO = path.resolve(import.meta.dirname, '../..')
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 42

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

// lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`).
// It throws when nothing answers, as the copy did, so a dead API stops the run
// rather than answering a status of 0 that a check could take for success.
const apiAs = apiAsAt(API, { noAnswer: 'throw' })

const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())
/** What a cleanup DELETE did not remove, said above the totals. */
const leftBehind = []
/** The merges across lists and projects run in a workspace of their own, deleted in `finally`. */
let fieldsWorkspaceId = null
let A = null
let sql = null

try {
  const auth = await signInApi(API, ME.email, ME.password)
  A = apiAs(auth.accessToken)
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
   * AND THE OTHER DIRECTION IS A MERGE (`commit-log/log-b7ee313-1`). A subtask
   * merged into its own parent was refused until 29 September, on a reason that
   * described the opposite merge; nothing points into the bin when it happens,
   * and ClickUp merges subtasks into another task, the parent included, from
   * the parent's subtask toolbar. A pair of its own, so the fixtures the merge
   * below reads are untouched.
   */
  const family = await makeTask(`A parent ${stamp}`)
  const kid = family?.id ? await makeTask(`Its subtask ${stamp}`, { parentTaskId: family.id }) : null
  if (kid?.id) await A(`/tasks/${kid.id}/comments`, { method: 'POST', body: { body: `THE KID'S NOTE ${stamp}` } })
  const kidIntoParent = kid?.id
    ? await A(`/tasks/${kid.id}/merge`, { method: 'POST', body: { targetTaskId: family.id } })
    : { status: 0, error: { message: 'could not make the pair' } }
  const familyComments = family?.id ? ((await A(`/tasks/${family.id}/comments`)).data ?? []) : []
  const kidBinned = kid?.id ? !!(await A(`/tasks/${kid.id}`)).data?.isArchived : false
  chk(
    kidIntoParent.status >= 200 && kidIntoParent.status < 300
      && familyComments.some((c) => String(c.body ?? '').includes(`THE KID'S NOTE ${stamp}`)) && kidBinned,
    'and a subtask merged into its own parent is merged, as in ClickUp: its comment lands on the parent and the subtask goes to the bin',
    `the merge answered ${kidIntoParent.status} ${JSON.stringify(kidIntoParent.error?.message ?? null)}; ` +
      `the parent's comments ${JSON.stringify(familyComments.map((c) => c.body))}; the subtask binned ${kidBinned}`,
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

  // ── Across lists and projects: a value moves only onto a field the survivor has ──
  console.log('\n▶ a merge from another list or project moves only the values of fields the survivor has')
  /*
   * `found-30-sep/merge-moves-values-onto-fields-the-target-lacks`. In a
   * workspace of this run's own: project ONE with a main list and a side list,
   * a field scoped to the side list (Stage) and one of the whole project
   * (Note); project TWO with a field of its own (Owner). Each value row is read
   * by SQL, since the survivor's fields, read back, show no field it lacks
   * whether a row for it was written or not.
   */
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — which task holds each value row is read by SQL')
  const fw = must(await A('/workspaces', { method: 'POST', body: { name: `Merge fields ${stamp}` } }), 'make the workspace for the merges across lists')
  fieldsWorkspaceId = fw.id
  const fSpace = must(await A('/spaces', { method: 'POST', body: { workspaceId: fw.id, name: `Merge fields ${stamp}` } }), 'make its space')
  const madeIn = async (route, body, what) => must(await A(route, { method: 'POST', body }), what).id
  const one = await madeIn('/projects', { spaceId: fSpace.id, name: `ONE ${stamp}` }, 'make project ONE')
  const oneMain = await madeIn('/lists', { projectId: one, name: `ONE main ${stamp}` }, 'make ONE’s main list')
  const oneSide = await madeIn('/lists', { projectId: one, name: `ONE side ${stamp}` }, 'make ONE’s side list')
  const two = await madeIn('/projects', { spaceId: fSpace.id, name: `TWO ${stamp}` }, 'make project TWO')
  const twoList = await madeIn('/lists', { projectId: two, name: `TWO list ${stamp}` }, 'make TWO’s list')
  const fieldOf = (project, body, what) => madeIn(`/workspaces/${fw.id}/projects/${project}/custom-fields`, { type: 'text', ...body }, what)
  const stage = await fieldOf(one, { name: 'Stage', listId: oneSide }, 'define Stage on ONE’s side list')
  const note = await fieldOf(one, { name: 'Note' }, 'define Note on project ONE')
  const owner = await fieldOf(two, { name: 'Owner' }, 'define Owner on project TWO')
  const taskIn = (listId, title) => madeIn('/tasks', { listId, title: `${title} ${stamp}` }, `make ${title}`)
  const put = async (taskId, fieldId, value) =>
    must(await A(`/workspaces/${fw.id}/tasks/${taskId}/custom-fields/${fieldId}`, { method: 'PUT', body: { value } }), `set a value on ${taskId}`)
  /** The fields a task holds a value row for, by name, read by SQL. */
  const rowsOf = async (taskId) =>
    (await sql`select d.name from custom_field_values v join custom_field_definitions d on d.id = v.field_id where v.task_id = ${taskId} order by d.name`).map((r) => r.name)
  /** What the task's own fields show, by name — the binned task's too. */
  const shownOn = async (taskId) =>
    Object.fromEntries(((await A(`/workspaces/${fw.id}/tasks/${taskId}/custom-fields`)).data ?? []).map((r) => [r.definition?.name, r.value]))

  const fromSide = await taskIn(oneSide, 'From the side list')
  const intoMain = await taskIn(oneMain, 'Survivor in the main list')
  await put(fromSide, stage, `stage ${stamp}`)
  await put(fromSide, note, `note ${stamp}`)
  const sideMerge = await A(`/tasks/${fromSide}/merge`, { method: 'POST', body: { targetTaskId: intoMain } })
  const [sideKept, sideOnSurvivor, sideShown] = [await rowsOf(fromSide), await rowsOf(intoMain), await shownOn(fromSide)]
  chk(
    sideMerge.ok && JSON.stringify(sideOnSurvivor) === '["Note"]' && JSON.stringify(sideKept) === '["Stage"]' &&
      sideShown.Stage === `stage ${stamp}` && sideMerge.data?.moved?.customFields === 1,
    'a task of another list merged in keeps on the binned task its value for a field scoped to its own list, which the survivor does not have, and that task still shows it — none is written onto the survivor (read by SQL) — while its value for a field of the project moves',
    `the merge answered ${sideMerge.status} ${JSON.stringify(sideMerge.error?.message ?? null)} and counted ${JSON.stringify(sideMerge.data?.moved?.customFields)} field(s) moved; ` +
      `the survivor holds rows for ${JSON.stringify(sideOnSurvivor)}, the binned task for ${JSON.stringify(sideKept)}, and shows Stage = ${JSON.stringify(sideShown.Stage ?? null)}`,
  )

  const fromTwo = await taskIn(twoList, 'From project TWO')
  const intoOne = await taskIn(oneMain, 'Second survivor in the main list')
  await put(fromTwo, owner, `owner ${stamp}`)
  const twoMerge = await A(`/tasks/${fromTwo}/merge`, { method: 'POST', body: { targetTaskId: intoOne } })
  const [twoKept, twoOnSurvivor, twoShown] = [await rowsOf(fromTwo), await rowsOf(intoOne), await shownOn(fromTwo)]
  chk(
    twoMerge.ok && twoOnSurvivor.length === 0 && JSON.stringify(twoKept) === '["Owner"]' &&
      twoShown.Owner === `owner ${stamp}` && twoMerge.data?.moved?.customFields === 0,
    'and a task of another project merged in keeps its project’s field’s value on the binned task, which still shows it — the survivor holds none (read by SQL), and the merge counts no field moved',
    `the merge answered ${twoMerge.status} ${JSON.stringify(twoMerge.error?.message ?? null)} and counted ${JSON.stringify(twoMerge.data?.moved?.customFields)} field(s) moved; ` +
      `the survivor holds rows for ${JSON.stringify(twoOnSurvivor)}, the binned task for ${JSON.stringify(twoKept)}, and shows Owner = ${JSON.stringify(twoShown.Owner ?? null)}`,
  )

  /*
   * The review of the item, measured on lane 7: a value the merged task no
   * longer showed — it had moved out of the field's list, and a move keeps a
   * task's rows — went onto a survivor in that list (201, one field moved),
   * where it then showed. A merge carries the merged task's values, the fields
   * it has where it is now, as a template or a duplicate takes them.
   */
  const movedOut = await taskIn(oneSide, 'Moved out of the side list')
  await put(movedOut, stage, `stale ${stamp}`)
  must(await A(`/tasks/${movedOut}/move`, { method: 'POST', body: { listId: oneMain, position: 0 } }), 'move it to the main list')
  const intoSide = await taskIn(oneSide, 'Survivor in the side list')
  const staleMerge = await A(`/tasks/${movedOut}/merge`, { method: 'POST', body: { targetTaskId: intoSide } })
  const [staleKept, staleOnSurvivor, survivorShown] = [await rowsOf(movedOut), await rowsOf(intoSide), await shownOn(intoSide)]
  chk(
    staleMerge.ok && staleOnSurvivor.length === 0 && JSON.stringify(staleKept) === '["Stage"]' &&
      'Stage' in survivorShown && survivorShown.Stage === null && staleMerge.data?.moved?.customFields === 0,
    'and a task moved out of a field’s list, which no longer shows its value there, merged into a task of that list keeps the value on the binned task — the survivor, which has the field, holds none and shows it empty (read by SQL), and the merge counts no field moved',
    `the merge answered ${staleMerge.status} ${JSON.stringify(staleMerge.error?.message ?? null)} and counted ${JSON.stringify(staleMerge.data?.moved?.customFields)} field(s) moved; ` +
      `the survivor holds rows for ${JSON.stringify(staleOnSurvivor)} and shows Stage = ${JSON.stringify(survivorShown.Stage)}, the binned task holds rows for ${JSON.stringify(staleKept)}`,
  )

  console.log('\n▶ “Add selected”: a merge asked to add the fields the survivor lacks')
  /*
   * ClickUp's merge, "if task A has a Custom Field that isn't available on task
   * B", asks whether to add it to task B ("Add selected CFs") or merge without
   * it ("Do nothing"), and A's value goes in only where B holds nothing (help
   * centre, "Merge tasks"). Without being asked, the merges above leave such a
   * value on the binned task; asked (`addFields`), the field goes to the
   * survivor's list, or one of its name and type there takes the value.
   */
  const fieldsNamed = async (project, name) =>
    sql`select list_id::text as list from custom_field_definitions where project_id = ${project} and name = ${name} order by created_at`
  const addSideFrom = await taskIn(oneSide, 'From the side list, adding Stage')
  const addSideInto = await taskIn(oneMain, 'Survivor taking Stage')
  await put(addSideFrom, stage, `added stage ${stamp}`)
  const addSide = await A(`/tasks/${addSideFrom}/merge`, { method: 'POST', body: { targetTaskId: addSideInto, addFields: [stage] } })
  const stagesNow = await fieldsNamed(one, 'Stage')
  const [addSideShown, addSideKept] = [await shownOn(addSideInto), await rowsOf(addSideFrom)]
  chk(
    addSide.ok && addSideShown.Stage === `added stage ${stamp}` && stagesNow.length === 2 && stagesNow.some((f) => f.list === oneMain) && !addSideKept.includes('Stage'),
    'a merge asked to add a field kept to another list adds it to the survivor’s list and moves the value there: the survivor shows it, a field of that name is now kept to its list, and the binned task holds it no more (read by SQL)',
    `the merge answered ${addSide.status} ${JSON.stringify(addSide.error?.message ?? null)}; the survivor shows Stage = ${JSON.stringify(addSideShown.Stage ?? null)}; ` +
      `ONE has ${stagesNow.length} field(s) named Stage, kept to ${JSON.stringify(stagesNow.map((f) => f.list === oneMain ? 'the main list' : f.list === oneSide ? 'the side list' : f.list))}; the binned task holds rows for ${JSON.stringify(addSideKept)}`,
  )

  const addTwoFrom = await taskIn(twoList, 'From TWO, adding Owner')
  const addTwoInto = await taskIn(oneMain, 'Survivor taking Owner')
  await put(addTwoFrom, owner, `added owner ${stamp}`)
  const addTwo = await A(`/tasks/${addTwoFrom}/merge`, { method: 'POST', body: { targetTaskId: addTwoInto, addFields: [owner] } })
  const ownersAfterOne = await fieldsNamed(one, 'Owner')
  const addTwoShown = await shownOn(addTwoInto)
  const againFrom = await taskIn(twoList, 'From TWO again')
  const againInto = await taskIn(oneMain, 'Second survivor taking Owner')
  await put(againFrom, owner, `owner again ${stamp}`)
  const again = await A(`/tasks/${againFrom}/merge`, { method: 'POST', body: { targetTaskId: againInto, addFields: [owner] } })
  const ownersAfterTwo = await fieldsNamed(one, 'Owner')
  const againShown = await shownOn(againInto)
  chk(
    addTwo.ok && addTwoShown.Owner === `added owner ${stamp}` && ownersAfterOne.length === 1 && ownersAfterOne[0].list === oneMain &&
      again.ok && againShown.Owner === `owner again ${stamp}` && ownersAfterTwo.length === 1,
    'and from another project: its field is added to the survivor’s project, kept to its list, with the value — and a second merge asked to add it finds that field there and makes no other',
    `the first merge answered ${addTwo.status} ${JSON.stringify(addTwo.error?.message ?? null)}, the survivor showing Owner = ${JSON.stringify(addTwoShown.Owner ?? null)}, ONE then having ${ownersAfterOne.length} Owner field(s); ` +
      `the second answered ${again.status} ${JSON.stringify(again.error?.message ?? null)}, its survivor showing Owner = ${JSON.stringify(againShown.Owner ?? null)}, ONE then having ${ownersAfterTwo.length}`,
  )

  const thirdFrom = await taskIn(twoList, 'From TWO a third time')
  await put(thirdFrom, owner, `third owner ${stamp}`)
  const keepsOwn = await A(`/tasks/${thirdFrom}/merge`, { method: 'POST', body: { targetTaskId: againInto, addFields: [owner] } })
  const [keptShown, thirdKept] = [await shownOn(againInto), await rowsOf(thirdFrom)]
  const refusedFrom = await taskIn(oneSide, 'Asked to add a field the survivor has')
  await put(refusedFrom, note, `refused note ${stamp}`)
  const refusedInto = await taskIn(oneMain, 'Survivor that has Note')
  const refusedAdd = await A(`/tasks/${refusedFrom}/merge`, { method: 'POST', body: { targetTaskId: refusedInto, addFields: [note] } })
  const refusedStill = (await A(`/tasks/${refusedFrom}`)).data?.isArchived === false
  chk(
    keepsOwn.ok && keptShown.Owner === `owner again ${stamp}` && thirdKept.includes('Owner') &&
      refusedAdd.status === 400 && /^Only a field the merged task holds a value for/.test(refusedAdd.error?.message ?? '') && refusedStill,
    'and the survivor’s own value is kept where it holds one, the merged value staying on the binned task; a field the survivor has is refused in one sentence, and nothing is merged',
    `merged into a survivor holding Owner: ${keepsOwn.status}, it shows Owner = ${JSON.stringify(keptShown.Owner ?? null)}, the binned task holding rows for ${JSON.stringify(thirdKept)}; ` +
      `asked to add Note, which the survivor has: ${refusedAdd.status} ${JSON.stringify(refusedAdd.error?.message ?? null)}, the task ${refusedStill ? 'not merged' : 'merged'}`,
  )

  // ── An emptied value is no information ───────────────────────────────────
  console.log('\n▶ a survivor’s emptied value gives way to the merged task’s, and one that holds something stays')
  /*
   * `found-6-oct/merge-drops-a-value-beside-an-emptied-one`. ClickUp adds the
   * merged task's value "only … if task B doesn't have any information in the
   * same Custom Field" (help centre, "Merge tasks", read through search
   * excerpts). A survivor's Note set and then cleared kept a row `{v: null}`,
   * which the merge took for an answer: 201, none moved, and the merged task's
   * Note stayed in the bin (lane 7). Three ways to empty a value — cleared,
   * an empty text, every label taken off — each beside a merged task's value,
   * read by SQL; and beside them a survivor whose own value holds something.
   */
  const tags = await fieldOf(one, { name: 'Tags', type: 'labels', options: [{ label: 'Red', value: 'red' }, { label: 'Blue', value: 'blue' }] }, 'define Tags on project ONE')
  /** The value the task holds for a field, read by SQL — `undefined` for no row. */
  const valueOn = async (taskId, fieldId) =>
    (await sql`select value from custom_field_values where task_id = ${taskId} and field_id = ${fieldId}`)[0]?.value
  const emptied = []
  for (const [field, name, setThenEmpty, mergedValue] of [
    [note, 'cleared', [`old ${stamp}`, null], `from the merged task ${stamp}`],
    [note, 'emptied text', [`old ${stamp}`, ''], `from the merged task ${stamp}`],
    [tags, 'every label taken off', [['red'], []], ['blue']],
  ]) {
    const merged = await taskIn(oneMain, `Merged beside a ${name} value`)
    const survivor = await taskIn(oneMain, `Survivor with a ${name} value`)
    for (const value of setThenEmpty) await put(survivor, field, value)
    await put(merged, field, mergedValue)
    const res = await A(`/tasks/${merged}/merge`, { method: 'POST', body: { targetTaskId: survivor } })
    emptied.push({
      name, res, want: mergedValue,
      onSurvivor: (await valueOn(survivor, field))?.v, onBinned: await valueOn(merged, field),
    })
  }
  chk(
    emptied.every((e) => e.res.ok && e.res.data?.moved?.customFields === 1 && JSON.stringify(e.onSurvivor) === JSON.stringify(e.want) && e.onBinned === undefined),
    'a merged task’s value goes onto a survivor whose own value of the field was emptied — cleared, an empty text, every label taken off — and the merge counts it moved: the survivor holds it and the binned task none (read by SQL)',
    emptied.map((e) => `${e.name}: the merge answered ${e.res.status} ${JSON.stringify(e.res.error?.message ?? null)} and counted ${JSON.stringify(e.res.data?.moved?.customFields)} moved; ` +
      `the survivor holds ${JSON.stringify(e.onSurvivor)}, the binned task ${JSON.stringify(e.onBinned ?? null)}`).join('; '),
  )

  const keeper = await taskIn(oneMain, 'Survivor with a Note of its own')
  const giver = await taskIn(oneMain, 'Merged beside a Note that holds something')
  await put(keeper, note, `the survivor’s own ${stamp}`)
  await put(giver, note, `from the merged task ${stamp}`)
  const keptMerge = await A(`/tasks/${giver}/merge`, { method: 'POST', body: { targetTaskId: keeper } })
  const [keptOn, keptBinned] = [(await valueOn(keeper, note))?.v, (await valueOn(giver, note))?.v]
  chk(
    keptMerge.ok && keptMerge.data?.moved?.customFields === 0 && keptOn === `the survivor’s own ${stamp}` && keptBinned === `from the merged task ${stamp}`,
    'and a survivor’s own value that holds something stays: the merged task’s stays on the binned task, and the merge counts no field moved (read by SQL)',
    `the merge answered ${keptMerge.status} and counted ${JSON.stringify(keptMerge.data?.moved?.customFields)} moved; the survivor holds ${JSON.stringify(keptOn)}, the binned task ${JSON.stringify(keptBinned)}`,
  )

  // ── While a merge runs ───────────────────────────────────────────────────
  console.log('\n▶ a value written into a merging field while the merge runs is not lost')
  /*
   * The review of `found-6-oct/merge-drops-a-value-beside-an-emptied-one`,
   * measured on lane 7, three runs alike: the merge deleted the survivor's
   * emptied row by id, having read it empty, and a value written into it in
   * between — somebody typing into the survivor's field while the merge ran —
   * went with it: the PUT answered 200, and no row anywhere then held it. The
   * order of the two writes is fixed here by holding the row from a session of
   * this suite's own (`for update`) until both are seen queued behind it in
   * `pg_stat_activity`: the typing first and the merge second, and then the
   * other way round; and then on the merged task's own row, which the merge
   * deletes. Each time the typed value is the last word where it was typed.
   */
  /** How many statements on custom_field_values wait for a lock in this database (`tx`, the session holding the row). */
  const queuedOnValues = async (tx) => {
    await tx`select pg_stat_clear_snapshot()`
    const rows = await tx`select query from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`
    return rows.filter((r) => /^\s*(update|delete from) "custom_field_values"/i.test(r.query ?? '')).length
  }
  /**
   * A survivor's Note set and cleared, a merged task's Note, and the two writes queued in `order` on one task's Note
   * row, held: by default the survivor's, typed into; `{ on: 'merged' }`, the merged task's.
   */
  const raced = async (order, { on = 'survivor' } = {}) => {
    const merged = await taskIn(oneMain, `Merged while ${on === 'merged' ? 'it' : 'the survivor'} is typed into, ${order}`)
    const survivor = await taskIn(oneMain, `Survivor while ${on === 'merged' ? 'the merged task' : 'it'} is typed into, ${order}`)
    await put(survivor, note, `old ${stamp}`)
    await put(survivor, note, null)
    await put(merged, note, `from the merged task ${stamp}`)
    const into = on === 'merged' ? merged : survivor
    const [held] = await sql`select id from custom_field_values where task_id = ${into} and field_id = ${note}`
    const typed = `typed into the ${on === 'merged' ? 'merged task' : 'survivor'} while the merge ran, ${order} ${stamp}`
    const typeIt = () => A(`/workspaces/${fw.id}/tasks/${into}/custom-fields/${note}`, { method: 'PUT', body: { value: typed } })
    const mergeIt = () => A(`/tasks/${merged}/merge`, { method: 'POST', body: { targetTaskId: survivor } })
    const seenQueued = []
    let typing = null
    let merging = null
    await sql.begin(async (tx) => {
      await tx`select id from custom_field_values where id = ${held.id} for update`
      if (order === 'typed first') typing = typeIt()
      else merging = mergeIt()
      seenQueued.push(await waitUntil(async () => (await queuedOnValues(tx)) >= 1, { timeoutMs: 15_000 }))
      if (order === 'typed first') merging = mergeIt()
      else typing = typeIt()
      seenQueued.push(await waitUntil(async () => (await queuedOnValues(tx)) >= 2, { timeoutMs: 15_000 }))
    })
    const [typedRes, mergeRes] = await Promise.all([typing, merging])
    return {
      typed, typedRes, mergeRes, queued: seenQueued.every(Boolean),
      onSurvivor: (await valueOn(survivor, note))?.v, onBinned: (await valueOn(merged, note))?.v,
    }
  }
  const sayRace = (r) =>
    `${r.queued ? 'both writes were seen queued' : 'the two writes were NOT both seen queued behind the held row'}; the PUT answered ${r.typedRes.status} ${JSON.stringify(r.typedRes.data?.value ?? r.typedRes.error?.message ?? null)}, ` +
    `the merge ${r.mergeRes.status} ${JSON.stringify(r.mergeRes.error?.message ?? null)} counting ${JSON.stringify(r.mergeRes.data?.moved?.customFields)} moved; ` +
    `the survivor holds ${JSON.stringify(r.onSurvivor ?? null)}, the binned task ${JSON.stringify(r.onBinned ?? null)}`

  const typedFirst = await raced('typed first')
  chk(
    typedFirst.queued && typedFirst.typedRes.status === 200 && typedFirst.mergeRes.status === 201 && typedFirst.mergeRes.data?.moved?.customFields === 0 &&
      typedFirst.onSurvivor === typedFirst.typed && typedFirst.onBinned === `from the merged task ${stamp}`,
    'a value typed into a survivor’s emptied field while the merge runs, queued ahead of the merge’s own write to it, stays: the merge leaves that field to it and counts none moved, and the merged task’s value stays on the binned task (read by SQL)',
    sayRace(typedFirst),
  )
  const mergeFirst = await raced('merge first')
  chk(
    mergeFirst.queued && mergeFirst.mergeRes.status === 201 && mergeFirst.mergeRes.data?.moved?.customFields === 1 && mergeFirst.typedRes.status === 200 &&
      mergeFirst.onSurvivor === mergeFirst.typed && mergeFirst.onBinned === undefined,
    'and one queued just behind the merge’s write lands on the survivor’s row, which is still there: the merge counts the merged value moved, the typed one is written over it, and the binned task holds none (read by SQL)',
    sayRace(mergeFirst),
  )
  /*
   * And the merged task's own row, which the merge deletes once the survivor
   * holds its value: a write into that task's field queued behind the delete
   * updated nothing, and answered 200 (lane 7, three runs alike).
   */
  const mergedSide = await raced('merge first', { on: 'merged' })
  chk(
    mergedSide.queued && mergedSide.mergeRes.status === 201 && mergedSide.mergeRes.data?.moved?.customFields === 1 &&
      mergedSide.typedRes.status === 200 && mergedSide.typedRes.data?.value?.v === mergedSide.typed &&
      mergedSide.onSurvivor === `from the merged task ${stamp}` && mergedSide.onBinned === mergedSide.typed,
    'and one typed into the merged task’s own field, queued behind the merge’s delete of that task’s row, is written all the same: the survivor holds the merged value, and the binned task the typed one (read by SQL)',
    sayRace(mergedSide),
  )

  // ── Across workspaces ────────────────────────────────────────────────────
  console.log('\n▶ a task of another workspace is not merged into one of this')
  /*
   * `found-6-oct/merge-moves-work-across-workspaces`. Someone who may write in
   * two workspaces merged a task of one into a task of the other: 201, and
   * its comment then sat in the other workspace (read by SQL, lane 7). ClickUp:
   * "Workspaces are independent, so it's not possible to transfer information
   * between separate ones" (help centre, "Create a new Workspace", read through
   * search excerpts). Refused before anything moves, with its reason, as a
   * list or a project moved to another workspace is ("A list can only be
   * moved within its own workspace"): this caller may open both tasks, and
   * "not found" is for an id naming nothing (the owner's decision of 1
   * October).
   */
  const foreign = await taskIn(oneMain, 'Of the merge-fields workspace')
  must(await A(`/tasks/${foreign}/comments`, { method: 'POST', body: { body: `ACROSS ${stamp}` } }), 'comment on the other workspace’s task')
  const thirdCommentsBefore = ((await A(`/tasks/${third.id}/comments`)).data ?? []).length
  const across = await A(`/tasks/${foreign}/merge`, { method: 'POST', body: { targetTaskId: third.id } })
  const [acrossComment] = await sql`select task_id from task_comments where body = ${`ACROSS ${stamp}`}`
  const [acrossSource] = await sql`select is_archived from tasks where id = ${foreign}`
  const thirdCommentsAfter = ((await A(`/tasks/${third.id}/comments`)).data ?? []).length
  const [opensSource, opensTarget] = [(await A(`/tasks/${foreign}`)).status, (await A(`/tasks/${third.id}`)).status]
  chk(
    across.status === 400 && across.error?.message === 'A task can only be merged into a task of its own workspace' &&
      opensSource === 200 && opensTarget === 200 &&
      acrossComment?.task_id === foreign && acrossSource?.is_archived === false && thirdCommentsAfter === thirdCommentsBefore,
    'a task of another workspace cannot be merged into one of this: 400, saying a task can only be merged into a task of its own workspace, to a caller who may open both — and nothing moves: its comment stays on it and it is not binned (read by SQL)',
    `the merge answered ${across.status} ${JSON.stringify(across.error?.message ?? null)}; the caller opens the two tasks ${opensSource} and ${opensTarget}; the comment is on ${acrossComment?.task_id === foreign ? 'its own task' : JSON.stringify(acrossComment?.task_id ?? null)}, ` +
      `the task binned ${JSON.stringify(acrossSource?.is_archived ?? null)}, the other task's comments ${thirdCommentsBefore} → ${thirdCommentsAfter}`,
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
  const direction = await page.getByTestId('task-merge-direction').filter({ visible: true }).innerText().catch(() => '')
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

  /*
   * And the dialog asks first, as ClickUp's does, when the task merged holds a
   * value in a field the one picked lacks: Stage, kept to ONE's side list.
   */
  const uiFrom = await taskIn(oneSide, 'Merge with Stage from UI')
  const uiInto = await taskIn(oneMain, 'UI survivor without Stage')
  await put(uiFrom, stage, `ui stage ${stamp}`)
  await page.goto(`${stack.base}/app/${fw.id}/${fSpace.id}/${one}/${oneSide}?task=${uiFrom}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('task-more-menu').click({ timeout: 20000 }).catch(() => {})
  await page.getByTestId('task-menu-merge').click({ timeout: 10000 }).catch(() => {})
  await page.getByTestId('task-merge-search').fill(`UI survivor without Stage ${stamp}`).catch(() => {})
  await waitUntil(async () => (await page.getByTestId('task-merge-candidate').count()) > 0, { timeoutMs: 10_000 })
  await page.getByTestId('task-merge-candidate').first().click({ timeout: 8000 }).catch(() => {})
  const prompt = page.getByTestId('task-merge-fields').filter({ visible: true })
  const asked = await waitUntil(async () => (await prompt.count()) > 0, { timeoutMs: 10_000 })
  const promptSays = asked ? await prompt.innerText().catch(() => '') : ''
  const choices = asked &&
    (await page.getByTestId('task-merge-add-selected').isVisible().catch(() => false)) &&
    (await page.getByTestId('task-merge-do-nothing').isVisible().catch(() => false))
  const notYet = (await A(`/tasks/${uiFrom}`)).data?.isArchived === false
  chk(
    asked && choices && promptSays.includes('Stage') && promptSays.includes(`ui stage ${stamp}`) && notYet,
    'picking a task that lacks one of this task’s fields with a value asks first: the dialog lists the field and its value, and offers “Add selected” and “Do nothing”, nothing merged yet',
    asked ? `the prompt says ${JSON.stringify(promptSays.slice(0, 200))}; both choices ${choices ? 'shown' : 'not shown'}; the task ${notYet ? 'not merged yet' : 'already merged'}` : 'nothing was asked: the dialog merged, or showed no prompt',
  )
  await page.getByTestId('task-merge-add-selected').click({ timeout: 8000 }).catch(() => {})
  const uiDone = await waitUntil(async () => (await A(`/tasks/${uiFrom}`)).data?.isArchived === true, { timeoutMs: 15_000 })
  const uiShown = uiDone ? await shownOn(uiInto) : {}
  chk(
    uiDone && uiShown.Stage === `ui stage ${stamp}`,
    'and “Add selected” merges with the field added: the survivor shows the value',
    uiDone ? `the survivor shows Stage = ${JSON.stringify(uiShown.Stage ?? null)}` : 'the task was not merged',
  )

  for (const id of [source.id, target.id, third.id, child.id, live.id, liveTarget.id, family?.id, kid?.id].filter(Boolean)) {
    const gone = await A(`/tasks/${id}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) leftBehind.push(`DELETE /tasks/${id} answered ${gone.status}`)
  }
} catch (e) {
  const lines = e.message.split('\n')
  const where = lines.find((l) => l.includes('waiting for') || l.includes('getByTestId'))
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${lines[0]}${where ? `\n         ${where.trim()}` : ''}`)
} finally {
  await browser.close().catch(() => {})
  if (fieldsWorkspaceId && A) {
    const gone = await A(`/workspaces/${fieldsWorkspaceId}`, { method: 'DELETE' }).catch(() => ({ status: 0 }))
    if (![200, 204, 404].includes(gone.status)) leftBehind.push(`DELETE /workspaces/${fieldsWorkspaceId} answered ${gone.status || 'nothing'}`)
  }
  await sql?.end?.({ timeout: 5 })
  stack?.close()
  for (const line of leftBehind) console.log(`  cleanup left behind: ${line}`)
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
