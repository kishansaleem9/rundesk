import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ForbiddenException } from '@nestjs/common'
import { PgDialect } from 'drizzle-orm/pg-core'
import { customFieldDefinitions, customFieldValues, tasks, clickupImportJobs, labels, taskLabelAssignments } from '@rundesk/db'
import { ClickUpImportService } from './clickup-import.service'
import { dupKey } from './clickup-csv.util'
import { GUESTS_CANNOT_IMPORT, IMPORT_ACCESS, type ImportAccess } from './import-access'

/**
 * §12.5 ClickUp import — service behaviour that needs the DB shape:
 *   - duplicate detection in `preview` (against the target scope + within file)
 *   - per-row conflict strategy (skip / create) with the right created/skipped
 *     tallies
 *   - custom-field definitions + values written during import
 *   - the job progress counters streamed into `clickup_import_jobs`
 *
 * A tiny drizzle stand-in records inserts + update payloads and hands back
 * queued select results. Insert `.returning()` yields a synthetic id so the
 * import can wire values/subtasks.
 */
function makeDb(selects: unknown[][] = [], opts: { conflictOn?: unknown[] } = {}) {
  const selectQueue = [...selects]
  const inserts: Array<{ table: unknown; values: any }> = []
  const updates: Array<{ table: unknown; set: any }> = []
  // Every \`where\` asked, so a test can read the condition a lookup put to the database.
  const wheres: unknown[] = []
  let idCounter = 0

  const VERBS = [
    'from', 'limit', 'innerJoin', 'leftJoin', 'orderBy', 'set',
    'returning', 'onConflictDoNothing', 'onConflictDoUpdate',
  ] as const

  const node = (rows: unknown[]) => {
    const p = Promise.resolve(rows) as any
    for (const v of VERBS) p[v] = () => p
    p.where = (cond: unknown) => {
      wheres.push(cond)
      return p
    }
    return p
  }

  const db = {
    select: () => node(selectQueue.shift() ?? []),
    insert: (table: unknown) => ({
      values: (v: any) => {
        const id = `id-${++idCounter}`
        inserts.push({ table, values: v })
        // A row that is there already: ON CONFLICT DO NOTHING returns nothing.
        return node(opts.conflictOn?.includes(table) ? [] : [{ id, ...v }])
      },
    }),
    update: (table: unknown) => ({
      set: (s: any) => {
        updates.push({ table, set: s })
        return node([])
      },
    }),
    delete: () => node([]),
  } as any

  return { db, inserts, updates, wheres }
}

const insertsInto = (inserts: Array<{ table: unknown; values: any }>, table: unknown) =>
  inserts.filter((r) => r.table === table).map((r) => r.values)

/** Who every test imports as. */
const IMPORTER = { id: 'user-1' }

/**
 * THE RULES AN IMPORT ASKS OF ITS IMPORTER (`import-access.ts`), answered for a test: anyone may
 * import; the tasks they may match are the rows the stand-in answers next, as the index was read
 * before it asked the read rule; a merge is allowed unless `refuse` names its task; a subtask link
 * unless `refuseLink` refuses it; and the enrichment may write into any task. What was asked of
 * them is recorded.
 */
type LinkAsked = { childId: string; parentId: string; actorId: string; childWasThere: boolean; parentWasThere: boolean }
function access(opts: { refuse?: Record<string, Error>; refuseLink?: (link: LinkAsked) => Error | null } = {}) {
  const asked = { index: [] as unknown[], merges: [] as unknown[], links: [] as LinkAsked[] }
  const rules: ImportAccess = {
    assertMayImport: async () => {},
    matchableTaskIndex: async (db: any, params) => {
      asked.index.push(params)
      const index = new Map<string, string>()
      for (const r of (await db.select()) as Array<{ id: string; listName: string; title: string }>) {
        const key = dupKey(r.listName, r.title)
        if (!index.has(key)) index.set(key, r.id)
      }
      return index
    },
    assertMayMerge: async (_db, params) => {
      asked.merges.push({ ...params, fields: [...params.fields] })
      const refusal = opts.refuse?.[params.taskId]
      if (refusal) throw refusal
    },
    assertMayLinkSubtask: async (_db, params) => {
      asked.links.push({ ...params })
      const refusal = opts.refuseLink?.(params)
      if (refusal) throw refusal
    },
    enrichmentRefusals: async () => ({ task: null, comments: null, attachments: null }),
  }
  return { rules, asked }
}

/** The service on the stand-in, asking `rules` (by default, `access()`'s). */
const serviceOn = (db: unknown, rules: ImportAccess = access().rules) =>
  Object.assign(new ClickUpImportService(db as any), { access: rules })
const jobUpdates = (updates: Array<{ table: unknown; set: any }>) =>
  updates.filter((r) => r.table === clickupImportJobs).map((r) => r.set)

describe('ClickUpImportService.preview — duplicate detection', () => {
  it('flags rows that already exist in the target and duplicates within the file', async () => {
    // Existing task in the target scope: (Sprint 1, Alpha)
    const existing = [{ id: 'existing-1', listName: 'Sprint 1', title: 'Alpha' }]
    const { db } = makeDb([existing])
    const svc = serviceOn(db)

    const csv = [
      'Task Name,List',
      'Alpha,Sprint 1', // exists-in-target
      'Beta,Sprint 1',
      'Beta,Sprint 1', // duplicate-in-file
    ].join('\n')

    const res = await svc.preview('ws-1', IMPORTER, { csv })
    assert.equal(res.totalRows, 3)
    assert.equal(res.duplicates.count, 2)
    const reasons = res.duplicates.sample.map((d) => d.reason).sort()
    assert.deepEqual(reasons, ['duplicate-in-file', 'exists-in-target'])
    // Comments/attachments are honestly reported as not-imported.
    assert.match(res.notImported.comments, /require.*ClickUp API/i)
  })

  it('surfaces detected custom fields with inferred types', async () => {
    const { db } = makeDb([[]]) // no existing tasks
    const svc = serviceOn(db)
    const csv = 'Task Name,List,Budget\nAlpha,L1,100\nBeta,L1,200'
    const res = await svc.preview('ws-1', IMPORTER, { csv })
    assert.deepEqual(res.customFields, [{ name: 'Budget', type: 'number' }])
  })
})

describe('ClickUpImportService.processImport — conflict strategy + job counters', () => {
  const csv = [
    'Task Name,List,Status,Priority',
    'Alpha,Sprint 1,todo,high',
    'Beta,Sprint 1,in progress,normal',
    'Alpha,Sprint 1,done,urgent', // duplicates the first Alpha within the file
  ].join('\n')

  it('skip: drops the duplicate, creates the rest, and reports counts', async () => {
    // selects: loadMemberIndex → [], the tasks the importer may match → []
    const { db, inserts, updates } = makeDb([[], []])
    const svc = serviceOn(db)

    const summary = await svc.processImport('job-1', 'ws-1', IMPORTER, { csv, strategy: 'skip' })

    assert.equal(summary.tasksCreated, 2)
    assert.equal(summary.tasksSkipped, 1)
    assert.equal(summary.tasksUpdated, 0)
    assert.equal(summary.duplicatesDetected, 1)
    // Only 2 task rows were actually inserted.
    assert.equal(insertsInto(inserts, tasks).length, 2)

    // Final job update marks completion with the streamed counters.
    const done = jobUpdates(updates).find((s) => s.status === 'completed')
    assert.ok(done, 'a completed job update was written')
    assert.equal(done.createdCount, 2)
    assert.equal(done.skippedCount, 1)
    assert.equal(done.processed, 3)
  })

  it('create (import anyway): keeps the duplicate as a new task', async () => {
    const { db, inserts } = makeDb([[], []])
    const svc = serviceOn(db)

    const summary = await svc.processImport('job-2', 'ws-1', IMPORTER, { csv, strategy: 'create' })

    assert.equal(summary.tasksCreated, 3)
    assert.equal(summary.tasksSkipped, 0)
    assert.equal(summary.duplicatesDetected, 1)
    assert.equal(insertsInto(inserts, tasks).length, 3)
  })

  it('merge: updates the existing target task instead of creating a duplicate', async () => {
    // An existing (Sprint 1, Alpha) in the target scope.
    const existing = [{ id: 'existing-alpha', listName: 'Sprint 1', title: 'Alpha' }]
    const { db, inserts, updates } = makeDb([[], existing])
    const svc = serviceOn(db)

    const single = 'Task Name,List,Status\nAlpha,Sprint 1,done'
    const summary = await svc.processImport('job-3', 'ws-1', IMPORTER, { csv: single, strategy: 'merge' })

    assert.equal(summary.tasksUpdated, 1)
    assert.equal(summary.tasksCreated, 0)
    assert.equal(insertsInto(inserts, tasks).length, 0, 'no new task inserted on merge')
    // The existing task row was updated.
    const taskUpdate = updates.find((u) => u.table === tasks)
    assert.ok(taskUpdate, 'existing task was updated')
  })

  it('reports failure on a job when the CSV yields no rows', async () => {
    const { db, updates } = makeDb([])
    const svc = serviceOn(db)
    await assert.rejects(() => svc.processImport('job-4', 'ws-1', IMPORTER, { csv: 'Task Name,List' }))
    const failed = jobUpdates(updates).find((s) => s.status === 'failed')
    assert.ok(failed, 'job marked failed')
  })
})

describe('ClickUpImportService.processImport — custom fields', () => {
  it('creates definitions and sets values, counting both', async () => {
    const { db, inserts } = makeDb([[], []]) // members, existing tasks
    const svc = serviceOn(db)

    const csv = [
      'Task Name,List,Budget,Region',
      'Alpha,L1,100,North',
      'Beta,L1,200,South',
      'Gamma,L1,150,North', // repeat makes Region a genuine dropdown enum
    ].join('\n')

    const summary = await svc.processImport('job-5', 'ws-1', IMPORTER, { csv, strategy: 'create' })

    // Two custom fields detected (Budget=number, Region=dropdown).
    assert.equal(summary.customFieldsCreated, 2)
    const defs = insertsInto(inserts, customFieldDefinitions)
    assert.equal(defs.length, 2)
    const budget = defs.find((d) => d.name === 'Budget')
    const region = defs.find((d) => d.name === 'Region')
    assert.equal(budget.type, 'number')
    assert.equal(region.type, 'dropdown')
    assert.ok(Array.isArray(region.options) && region.options.length === 2)

    // Three tasks × two fields = 6 values written, and the value shape is { v }.
    assert.equal(summary.customFieldValuesSet, 6)
    const values = insertsInto(inserts, customFieldValues)
    assert.equal(values.length, 6)
    assert.ok('v' in values[0].value, 'value stored in the { v } write-path shape')
  })
})

describe('ClickUpImportService — where an import may write (found-5-oct/import-writes-into-another-workspace)', () => {
  it('a space of another workspace is refused 403, and no job row is written', async () => {
    const space = '33333333-3333-4333-8333-333333333333'
    const { db, inserts } = makeDb([[{ id: space, workspaceId: 'ws-other' }]])
    const svc = serviceOn(db)
    await assert.rejects(
      () => svc.startImport('ws-1', IMPORTER, { csv: 'Task Name\nAlpha\n', targetSpaceId: space }),
      (e: unknown) => e instanceof ForbiddenException && e.message === 'That space is not in this workspace',
    )
    assert.deepEqual(inserts, [])
  })
})

describe('ClickUpImportService.processImport — the merge and the tags', () => {
  it('a merge from a CSV with no Status or Priority column writes neither (found-5-oct/import-merge-resets-fields-the-file-lacks)', async () => {
    const existing = [{ id: 'existing-two', listName: 'Alpha', title: 'two' }]
    const { db, updates } = makeDb([[], existing])
    const svc = serviceOn(db)
    const summary = await svc.processImport('job-6', 'ws-1', IMPORTER, { csv: 'Task Name,List,Description\ntwo,Alpha,new words\n', strategy: 'merge' })
    assert.equal(summary.tasksUpdated, 1)
    const set = updates.find((u) => u.table === tasks)?.set
    assert.ok(set, 'the matched task was updated')
    assert.equal(set.description, 'new words')
    assert.equal('status' in set, false, 'status is not written')
    assert.equal('priority' in set, false, 'priority is not written')
  })

  it('a tag is found by its name whatever its case (found-30-sep/spreadsheet-import-skips-task-rules)', async () => {
    // members, existing tasks, then the tag lookup — which finds the workspace's "Urgent-X".
    const { db, inserts, wheres } = makeDb([[], [], [{ id: 'label-urgent' }]])
    const svc = serviceOn(db)
    const summary = await svc.processImport('job-7', 'ws-1', IMPORTER, { csv: 'Task Name,Tags\nAlpha,URGENT-x\n', strategy: 'create' })
    assert.equal(summary.labelsCreated, 0)
    assert.equal(insertsInto(inserts, labels).length, 0)
    assert.deepEqual(insertsInto(inserts, taskLabelAssignments).map((a) => a.labelId), ['label-urgent'])
    const asked = wheres
      .map((w) => { try { return new PgDialect().sqlToQuery(w as any) } catch { return null } })
      .find((q) => q?.sql.includes('"labels"."name"'))
    assert.ok(asked, 'the tag was looked up by its name')
    assert.match(asked!.sql, /lower\("labels"\."name"\) in \(lower\(\$2\), lower\(\$3\)\)/)
    assert.deepEqual(asked!.params, ['ws-1', 'URGENT-x', 'URGENT-x'])
  })

  it('a tag over 60 characters is looked up by the name it is stored under as well, made under it, and found again after a conflict', async () => {
    const long = 'Quarterly-Review-'.padEnd(70, 'Xy')
    const stored = long.slice(0, 60)
    // members, existing tasks, the lookup (nothing), then the re-read after the insert's conflict.
    const { db, inserts, wheres } = makeDb([[], [], [], [{ id: 'label-long' }]], { conflictOn: [labels] })
    const svc = serviceOn(db)
    await svc.processImport('job-8', 'ws-1', IMPORTER, { csv: `Task Name,Tags\nLong one,${long.toLowerCase()}\n`, strategy: 'create' })
    assert.deepEqual(insertsInto(inserts, labels).map((l) => l.name), [stored.toLowerCase()], 'made under the stored name')
    assert.deepEqual(insertsInto(inserts, taskLabelAssignments).map((a) => a.labelId), ['label-long'], 'and not dropped')
    const asked = wheres
      .map((w) => { try { return new PgDialect().sqlToQuery(w as any) } catch { return null } })
      .filter((q) => q?.sql.includes('"labels"."name"'))
    assert.equal(asked.length, 2, 'the lookup and the re-read')
    for (const q of asked) assert.deepEqual(q!.params, ['ws-1', long.toLowerCase(), stored.toLowerCase()])
  })
})

describe('ClickUpImportService — who may import, and which tasks an import may match and merge into', () => {
  it('a guest is refused the preview, the import and the enrichment, 403 “Guests cannot import data into a workspace”, before anything is read or written (found-6-oct/a-guest-who-may-import-makes-a-space)', async () => {
    // The rule itself (`assertMayImport`): the stand-in answers each membership lookup with a guest's role.
    const guest = [{ role: 'guest' }]
    const { db, inserts, updates } = makeDb([guest, guest, guest])
    const svc = serviceOn(db, IMPORT_ACCESS)
    const refused = (e: unknown) => e instanceof ForbiddenException && e.message === GUESTS_CANNOT_IMPORT
    await assert.rejects(() => svc.preview('ws-1', IMPORTER, { csv: 'Task Name\nAlpha\n' }), refused, 'the preview')
    await assert.rejects(() => svc.startImport('ws-1', IMPORTER, { csv: 'Task Name\nAlpha\n' }), refused, 'the import')
    await assert.rejects(() => svc.enrichJob('ws-1', 'job-1', IMPORTER, { apiToken: 'tok', mapping: [] }), refused, 'the enrichment')
    assert.deepEqual(inserts, [], 'no job row, space or task is written')
    assert.deepEqual(updates, [])
  })

  it('the preview counts duplicates among the tasks its importer may open: it asks for those as the importer (found-6-oct/import-previews-tell-what-private-places-hold)', async () => {
    // What the importer may open holds (Sprint 1, Alpha); a private list's (Hidden, Secret) is not theirs to match.
    const { db } = makeDb([[{ id: 'open-alpha', listName: 'Sprint 1', title: 'Alpha' }]])
    const { rules, asked } = access()
    const svc = serviceOn(db, rules)
    const importer = { id: 'user-1', role: 'member' }
    const res = await svc.preview('ws-1', importer, { csv: 'Task Name,List\nAlpha,Sprint 1\nSecret,Hidden\n', targetSpaceId: 'space-1' })
    assert.deepEqual(asked.index, [{ workspaceId: 'ws-1', targetSpaceId: 'space-1', importer }])
    assert.equal(res.duplicates.count, 1)
    assert.deepEqual(res.duplicates.sample.map((d) => d.title), ['Alpha'])
  })

  it('a merge asks the write rule of the task it would change, first: what the rule refuses is that row’s error, and nothing of the row is written (found-6-oct/import-merge-writes-tasks-its-importer-may-not-change)', async () => {
    const existing = [
      { id: 'task-view', listName: 'Shared', title: 'two' },
      { id: 'task-mine', listName: 'Mine', title: 'three' },
    ]
    // members, the tasks the importer may match; no tag is looked up, as the tagged row is refused.
    const { db, inserts, updates } = makeDb([[], existing])
    const refusal = new ForbiddenException(`This space's default permission is "View only", which does not allow changing its tasks`)
    const { rules, asked } = access({ refuse: { 'task-view': refusal } })
    const svc = serviceOn(db, rules)
    const summary = await svc.processImport('job-9', 'ws-1', IMPORTER, {
      csv: 'Task Name,List,Status,Tags\ntwo,Shared,Done,urgent\nthree,Mine,Done,\n',
      strategy: 'merge',
    })
    assert.deepEqual(asked.merges, [
      { taskId: 'task-view', actorId: 'user-1', fields: ['status', 'tags'] },
      { taskId: 'task-mine', actorId: 'user-1', fields: ['status'] },
    ])
    assert.equal(summary.duplicatesDetected, 2)
    assert.equal(summary.tasksUpdated, 1, 'the task it may change is merged')
    assert.deepEqual(summary.errors, [`Task "two": ${refusal.message}`])
    assert.equal(updates.filter((u) => u.table === tasks).length, 1, 'one task is written: the one it may change')
    assert.deepEqual(insertsInto(inserts, taskLabelAssignments), [], 'and the refused row’s tag is not put on its task')
    assert.deepEqual(insertsInto(inserts, labels), [])
  })

  it('each subtask link asks the link rule, saying which of its tasks were already there: a refused link is reported in the rule’s words and not made (found-6-oct/import-merge-writes-tasks-its-importer-may-not-change)', async () => {
    // X and Y were already there, and are merged; the rest are made by the run.
    const existing = [
      { id: 'task-x', listName: 'Old', title: 'X' },
      { id: 'task-y', listName: 'Old', title: 'Y' },
    ]
    const { db, inserts, updates } = makeDb([[], existing])
    const underComment = new ForbiddenException(`This space's default permission is "Comment", which does not allow changing its tasks`)
    const underEdit = new ForbiddenException(`This space's default permission is "Edit", which does not allow deleting its tasks`)
    const { rules, asked } = access({
      refuseLink: (l) => (l.childId === 'task-x' ? underComment : l.parentId === 'task-y' ? underEdit : null),
    })
    const svc = serviceOn(db, rules)
    const summary = await svc.processImport('job-10', 'ws-1', IMPORTER, {
      csv: [
        'Task ID,Parent ID,Task Name,List,Status',
        'cu-x,cu-np,X,Old,Done',
        'cu-np,,New parent,Fresh,',
        'cu-y,,Y,Old,Done',
        'cu-nc,cu-y,New child,Fresh,',
        'cu-b,,B,Fresh,',
        'cu-a,cu-b,A,Fresh,',
      ].join('\n'),
      strategy: 'merge',
    })
    // A task's id is the stand-in's count of inserts when it was inserted.
    const idOf = (title: string) => `id-${inserts.findIndex((r) => r.table === tasks && r.values.title === title) + 1}`
    assert.deepEqual(asked.links, [
      { childId: 'task-x', parentId: idOf('New parent'), actorId: 'user-1', childWasThere: true, parentWasThere: false },
      { childId: idOf('New child'), parentId: 'task-y', actorId: 'user-1', childWasThere: false, parentWasThere: true },
      { childId: idOf('A'), parentId: idOf('B'), actorId: 'user-1', childWasThere: false, parentWasThere: false },
    ])
    assert.equal(summary.tasksUpdated, 2, 'X and Y are merged')
    assert.deepEqual(summary.errors, [
      `Task "X" under "New parent": ${underComment.message}`,
      `Task "New child" under "Y": ${underEdit.message}`,
    ])
    const linked = updates.filter((u) => u.table === tasks && 'parentTaskId' in u.set).map((u) => u.set.parentTaskId)
    assert.deepEqual(linked, [idOf('B')], 'only the link it allows is made: A under B')
    assert.equal(summary.subtasksLinked, 1)
  })
})
