import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { customFieldDefinitions, customFieldValues, tasks, clickupImportJobs } from '@rundesk/db'
import { ClickUpImportService } from './clickup-import.service'

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
function makeDb(selects: unknown[][] = []) {
  const selectQueue = [...selects]
  const inserts: Array<{ table: unknown; values: any }> = []
  const updates: Array<{ table: unknown; set: any }> = []
  let idCounter = 0

  const VERBS = [
    'from', 'where', 'limit', 'innerJoin', 'leftJoin', 'orderBy', 'set',
    'returning', 'onConflictDoNothing', 'onConflictDoUpdate',
  ] as const

  const node = (rows: unknown[]) => {
    const p = Promise.resolve(rows) as any
    for (const v of VERBS) p[v] = () => p
    return p
  }

  const db = {
    select: () => node(selectQueue.shift() ?? []),
    insert: (table: unknown) => ({
      values: (v: any) => {
        const id = `id-${++idCounter}`
        inserts.push({ table, values: v })
        return node([{ id, ...v }])
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

  return { db, inserts, updates }
}

const insertsInto = (inserts: Array<{ table: unknown; values: any }>, table: unknown) =>
  inserts.filter((r) => r.table === table).map((r) => r.values)
const jobUpdates = (updates: Array<{ table: unknown; set: any }>) =>
  updates.filter((r) => r.table === clickupImportJobs).map((r) => r.set)

describe('ClickUpImportService.preview — duplicate detection', () => {
  it('flags rows that already exist in the target and duplicates within the file', async () => {
    // Existing task in the target scope: (Sprint 1, Alpha)
    const existing = [{ id: 'existing-1', listName: 'Sprint 1', title: 'Alpha' }]
    const { db } = makeDb([existing])
    const svc = new ClickUpImportService(db)

    const csv = [
      'Task Name,List',
      'Alpha,Sprint 1', // exists-in-target
      'Beta,Sprint 1',
      'Beta,Sprint 1', // duplicate-in-file
    ].join('\n')

    const res = await svc.preview('ws-1', { csv })
    assert.equal(res.totalRows, 3)
    assert.equal(res.duplicates.count, 2)
    const reasons = res.duplicates.sample.map((d) => d.reason).sort()
    assert.deepEqual(reasons, ['duplicate-in-file', 'exists-in-target'])
    // Comments/attachments are honestly reported as not-imported.
    assert.match(res.notImported.comments, /require.*ClickUp API/i)
  })

  it('surfaces detected custom fields with inferred types', async () => {
    const { db } = makeDb([[]]) // no existing tasks
    const svc = new ClickUpImportService(db)
    const csv = 'Task Name,List,Budget\nAlpha,L1,100\nBeta,L1,200'
    const res = await svc.preview('ws-1', { csv })
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
    // selects: loadMemberIndex → [], loadExistingTaskIndex → []
    const { db, inserts, updates } = makeDb([[], []])
    const svc = new ClickUpImportService(db)

    const summary = await svc.processImport('job-1', 'ws-1', 'user-1', { csv, strategy: 'skip' })

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
    const svc = new ClickUpImportService(db)

    const summary = await svc.processImport('job-2', 'ws-1', 'user-1', { csv, strategy: 'create' })

    assert.equal(summary.tasksCreated, 3)
    assert.equal(summary.tasksSkipped, 0)
    assert.equal(summary.duplicatesDetected, 1)
    assert.equal(insertsInto(inserts, tasks).length, 3)
  })

  it('merge: updates the existing target task instead of creating a duplicate', async () => {
    // An existing (Sprint 1, Alpha) in the target scope.
    const existing = [{ id: 'existing-alpha', listName: 'Sprint 1', title: 'Alpha' }]
    const { db, inserts, updates } = makeDb([[], existing])
    const svc = new ClickUpImportService(db)

    const single = 'Task Name,List,Status\nAlpha,Sprint 1,done'
    const summary = await svc.processImport('job-3', 'ws-1', 'user-1', { csv: single, strategy: 'merge' })

    assert.equal(summary.tasksUpdated, 1)
    assert.equal(summary.tasksCreated, 0)
    assert.equal(insertsInto(inserts, tasks).length, 0, 'no new task inserted on merge')
    // The existing task row was updated.
    const taskUpdate = updates.find((u) => u.table === tasks)
    assert.ok(taskUpdate, 'existing task was updated')
  })

  it('reports failure on a job when the CSV yields no rows', async () => {
    const { db, updates } = makeDb([])
    const svc = new ClickUpImportService(db)
    await assert.rejects(() => svc.processImport('job-4', 'ws-1', 'user-1', { csv: 'Task Name,List' }))
    const failed = jobUpdates(updates).find((s) => s.status === 'failed')
    assert.ok(failed, 'job marked failed')
  })
})

describe('ClickUpImportService.processImport — custom fields', () => {
  it('creates definitions and sets values, counting both', async () => {
    const { db, inserts } = makeDb([[], []]) // members, existing tasks
    const svc = new ClickUpImportService(db)

    const csv = [
      'Task Name,List,Budget,Region',
      'Alpha,L1,100,North',
      'Beta,L1,200,South',
      'Gamma,L1,150,North', // repeat makes Region a genuine dropdown enum
    ].join('\n')

    const summary = await svc.processImport('job-5', 'ws-1', 'user-1', { csv, strategy: 'create' })

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
