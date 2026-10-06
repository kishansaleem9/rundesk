import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { PgDialect } from 'drizzle-orm/pg-core'
import { clickupImportJobs, labels, projects, spaces, taskLabelAssignments, tasks } from '@rundesk/db'
import { SpreadsheetImportService } from './spreadsheet-import.service'
import { dupKey } from './clickup-csv.util'
import { GUESTS_CANNOT_IMPORT, IMPORT_ACCESS, type ImportAccess } from './import-access'
import { NOT_DELIMITED_TEXT } from './spreadsheet-import.util'

/**
 * THE SPREADSHEET IMPORT'S WRITES, against a drizzle stand-in with Postgres's
 * transactions as far as these tests need them:
 *
 *   · what a transaction — or a savepoint in one — writes reaches its parent
 *     only when its callback resolves, and is dropped when it throws;
 *   · a write the database refuses inside a transaction, outside any
 *     savepoint, ABORTS it: every later write in it is refused too, as
 *     Postgres answers "current transaction is aborted";
 *   · outside a transaction a refused write refuses that write alone;
 *   · and the pool: a transaction holds a connection until it ends, so a
 *     write sent OUTSIDE it while it is open waits for a second connection.
 *     With the API's ten, ten imports at once each holding one and waiting
 *     for another stopped every route (measured on lane 4). Such writes are
 *     recorded in `waited`.
 *
 * `fail` says which writes the database refuses, and why.
 */
type Write = { kind: 'insert' | 'update' | 'delete'; table: unknown; values: any; id?: string }

function makeDb(opts: { selects?: unknown[][]; fail?: (w: Write) => string | null } = {}) {
  const selectQueue = [...(opts.selects ?? [])]
  const wheres: unknown[] = []
  const committed: Write[] = []
  const waited: string[] = []
  let open = 0
  let ids = 0
  const VERBS = ['from', 'limit', 'innerJoin', 'leftJoin', 'orderBy', 'returning', 'onConflictDoNothing', 'onConflictDoUpdate']
  const node = (rows: Promise<unknown[]>, onWhere?: (cond: unknown) => void) => {
    const p = rows as any
    for (const v of VERBS) p[v] = () => p
    p.where = (cond: unknown) => {
      wheres.push(cond)
      onWhere?.(cond)
      return p
    }
    return p
  }
  const handle = (writes: Write[], inTx: boolean): any => {
    let aborted = false
    const outside = (what: string) => {
      if (!inTx && open > 0) waited.push(what)
    }
    const write = (w: Write, row: unknown[]) => {
      outside(`${w.kind} while a transaction is open`)
      const refused = aborted ? 'current transaction is aborted' : opts.fail?.(w) ?? null
      if (refused) {
        if (inTx) aborted = true
        const no = Promise.reject(new Error(refused))
        no.catch(() => undefined)
        return node(no)
      }
      writes.push(w)
      return node(Promise.resolve(row), (cond) => {
        w.values = { ...w.values, where: cond }
      })
    }
    return {
      select: () => {
        outside('select while a transaction is open')
        return node(Promise.resolve(selectQueue.shift() ?? []))
      },
      insert: (table: unknown) => ({
        values: (values: any) => {
          const id = `id-${++ids}`
          return write({ kind: 'insert', table, values, id }, [{ id, ...values }])
        },
      }),
      update: (table: unknown) => ({ set: (values: any) => write({ kind: 'update', table, values }, []) }),
      delete: (table: unknown) => write({ kind: 'delete', table, values: {} }, []),
      transaction: async (fn: (tx: any) => Promise<unknown>) => {
        if (aborted) throw new Error('current transaction is aborted')
        const mine: Write[] = []
        if (!inTx) open++
        try {
          const result = await fn(handle(mine, true))
          writes.push(...mine)
          return result
        } finally {
          if (!inTx) open--
        }
      },
    }
  }
  return { db: handle(committed, false), committed, wheres, waited }
}

/** Who every test imports as. */
const IMPORTER = { id: 'user-1' }

/**
 * THE RULES AN IMPORT ASKS OF ITS IMPORTER (`import-access.ts`), answered for a test: anyone may
 * import; the tasks they may match are the rows the stand-in answers next, as the index was read
 * before it asked the read rule; and a merge is allowed unless `refuse` names its task. What was
 * asked of them is recorded. With `reads`, the merge rule reads through the database it is handed
 * before it answers, as the real one reads the task and the person's role — so a read it sends
 * while a row's transaction is open is one the stand-in sees waiting.
 */
function access(opts: { refuse?: Record<string, Error>; reads?: boolean } = {}) {
  const asked = { index: [] as unknown[], merges: [] as unknown[] }
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
    assertMayMerge: async (db: any, params) => {
      if (opts.reads) await db.select()
      asked.merges.push({ ...params, fields: [...params.fields] })
      const refusal = opts.refuse?.[params.taskId]
      if (refusal) throw refusal
    },
    // Neither is asked by the spreadsheet import: its rows link no subtasks, and it has no enrichment.
    assertMayLinkSubtask: async () => {},
    enrichmentRefusals: async () => ({ task: null, comments: null, attachments: null }),
  }
  return { rules, asked }
}

/** The service on the stand-in, asking `rules` (by default, `access()`'s). */
const serviceOn = (db: unknown, rules: ImportAccess = access().rules) =>
  Object.assign(new SpreadsheetImportService(db as any), { access: rules })

const into = (writes: Write[], table: unknown) => writes.filter((w) => w.kind === 'insert' && w.table === table).map((w) => w.values)
const madeIn = (writes: Write[], table: unknown) => writes.filter((w) => w.kind === 'insert' && w.table === table).map((w) => w.id)
const jobSets = (writes: Write[]) => writes.filter((w) => w.kind === 'update' && w.table === clickupImportJobs).map((w) => w.values)
const taskUpdates = (writes: Write[]) => writes.filter((w) => w.kind === 'update' && w.table === tasks).map((w) => w.values)
/** The ids a delete from `table` was asked to take away, read off its condition. */
const deletedFrom = (writes: Write[], table: unknown) =>
  writes
    .filter((w) => w.kind === 'delete' && w.table === table)
    .flatMap((w) => new PgDialect().sqlToQuery(w.values.where).params)

describe('SpreadsheetImportService — what is refused before anything is written', () => {
  // How the page's FileReader hands an .xlsx over: a zip's first bytes survive the reading.
  const XLSX_AS_TEXT = 'PK\u0003\u0004\u0014\u0000\u0000\u0000\b\u0000[Content_Types].xml\nmore'
  // And a legacy .xls: the OLE2 signature's bytes, decoded as the page decodes them, then NULs.
  const XLS_AS_TEXT = new TextDecoder('utf-8').decode(
    Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0, 0x2c, 0x41, 0x0a, 0x42]),
  )

  it('an .xlsx read as text is refused in the page’s words, and no job row is written (found-5-oct/xlsx-read-as-text)', async () => {
    const { db, committed } = makeDb()
    const svc = serviceOn(db)
    await assert.rejects(
      () => svc.startSheetImport('ws-1', IMPORTER, { content: XLSX_AS_TEXT, mapping: { [XLSX_AS_TEXT.split('\n')[0]]: 'title' } }),
      (e: unknown) => e instanceof BadRequestException && e.message === NOT_DELIMITED_TEXT,
    )
    assert.deepEqual(committed, [])
  })

  it('and its preview is refused the same way, before any column is drawn', async () => {
    const { db } = makeDb()
    const svc = serviceOn(db)
    await assert.rejects(
      () => svc.previewSheet('ws-1', IMPORTER, { content: XLSX_AS_TEXT }),
      (e: unknown) => e instanceof BadRequestException && e.message === NOT_DELIMITED_TEXT,
    )
  })

  it('a legacy .xls read as text — a NUL in its first line — is refused the same way, at the start and at the preview', async () => {
    const { db, committed } = makeDb()
    const svc = serviceOn(db)
    const header = XLS_AS_TEXT.split('\n')[0]
    await assert.rejects(
      () => svc.startSheetImport('ws-1', IMPORTER, { content: XLS_AS_TEXT, mapping: { [header.split(',')[0]]: 'title' } }),
      (e: unknown) => e instanceof BadRequestException && e.message === NOT_DELIMITED_TEXT,
    )
    await assert.rejects(
      () => svc.previewSheet('ws-1', IMPORTER, { content: XLS_AS_TEXT }),
      (e: unknown) => e instanceof BadRequestException && e.message === NOT_DELIMITED_TEXT,
    )
    assert.deepEqual(committed, [])
  })

  // No text is no file (`found-6-oct/import-start-answers-500-to-non-text`): the import's `.trim()` threw, a 500.
  it('a preview or an import of content that is no text at all answers 400 in the page’s words — not a TypeError', async () => {
    const { db } = makeDb()
    const svc = serviceOn(db)
    for (const content of [123, { a: 1 }, true]) {
      await assert.rejects(
        () => svc.previewSheet('ws-1', IMPORTER, { content: content as any }),
        (e: unknown) => e instanceof BadRequestException && e.message === NOT_DELIMITED_TEXT,
        `the preview of ${JSON.stringify(content)}`,
      )
      await assert.rejects(
        () => svc.startSheetImport('ws-1', IMPORTER, { content: content as any, mapping: { a: 'title' } }),
        (e: unknown) => e instanceof BadRequestException && e.message === NOT_DELIMITED_TEXT,
        `the import of ${JSON.stringify(content)}`,
      )
    }
  })

  it('a space of another workspace is refused 403, and no job row is written (found-5-oct/import-writes-into-another-workspace)', async () => {
    const space = '33333333-3333-4333-8333-333333333333'
    const { db, committed } = makeDb({ selects: [[{ id: space, workspaceId: 'ws-other' }]] })
    const svc = serviceOn(db)
    await assert.rejects(
      () => svc.startSheetImport('ws-1', IMPORTER, { content: 'Title\nAlpha\n', targetSpaceId: space }),
      (e: unknown) => e instanceof ForbiddenException && e.message === 'That space is not in this workspace',
    )
    assert.deepEqual(committed, [])
  })
})

describe('SpreadsheetImportService.processSheetImport — a run that fails, and a row that fails (found-5-oct/xlsx-read-as-text)', () => {
  it('a run whose last write is refused takes away what it made — its project, its space and the tags it made — and its job is marked failed, having created nothing', async () => {
    const { db, committed } = makeDb({
      selects: [[], []],
      fail: (w) => (w.kind === 'update' && w.table === clickupImportJobs && w.values.status === 'completed' ? 'the database refused the last write' : null),
    })
    const svc = serviceOn(db)
    await assert.rejects(() => svc.processSheetImport('job-1', 'ws-1', IMPORTER, { content: 'Title,Tags\nAlpha,new-tag\nBeta,\n', preset: 'generic' }))
    const [space] = madeIn(committed, spaces)
    const [project] = madeIn(committed, projects)
    const [tag] = madeIn(committed, labels)
    assert.ok(space && project && tag, 'the run made a space, a project and a tag before its last write')
    assert.deepEqual(deletedFrom(committed, projects), [project], 'its project is taken away, and with it its lists and tasks')
    assert.deepEqual(deletedFrom(committed, spaces), [space], 'and its space')
    assert.deepEqual(deletedFrom(committed, labels), [tag], 'and the tag it made, when it labels nothing')
    const failed = jobSets(committed).find((s) => s.status === 'failed')
    assert.ok(failed, 'the job is marked failed')
    assert.equal(failed.createdCount, 0, 'having created nothing')
    assert.equal(failed.error, 'the database refused the last write')
    assert.ok(!jobSets(committed).some((s) => s.status === 'completed'), 'and never completed')
  })

  it('a row the database refuses fails alone: it is reported, and the rest of the file is written', async () => {
    const { db, committed } = makeDb({
      selects: [[], []],
      fail: (w) => (w.kind === 'insert' && w.table === tasks && w.values.title === 'Beta' ? 'date/time field value out of range' : null),
    })
    const svc = serviceOn(db)
    const summary = await svc.processSheetImport('job-2', 'ws-1', IMPORTER, { content: 'Title\nAlpha\nBeta\nGamma\n', preset: 'generic' })
    assert.equal(summary.tasksCreated, 2)
    assert.equal(summary.errors.length, 1)
    assert.match(summary.errors[0], /^Row 3 \("Beta"\)/)
    assert.deepEqual(into(committed, tasks).map((t) => t.title), ['Alpha', 'Gamma'])
    assert.ok(jobSets(committed).some((s) => s.status === 'completed' && s.createdCount === 2))
  })

  it('a row’s writes are one: a row whose tag cannot be linked leaves no task and no tag behind', async () => {
    const { db, committed } = makeDb({
      selects: [[], []],
      fail: (w) => (w.kind === 'insert' && w.table === taskLabelAssignments ? 'the link was refused' : null),
    })
    const svc = serviceOn(db)
    const summary = await svc.processSheetImport('job-3', 'ws-1', IMPORTER, { content: 'Title,Tags\nAlpha,\nBeta,solo\nGamma,\n', preset: 'generic' })
    assert.equal(summary.tasksCreated, 2)
    assert.equal(summary.labelsCreated, 0)
    assert.deepEqual(into(committed, tasks).map((t) => t.title), ['Alpha', 'Gamma'])
    assert.deepEqual(into(committed, labels), [])
  })

  it('a NUL in a row’s title reaches the job row as U+FFFD: that row fails alone and the run completes', async () => {
    const { db, committed } = makeDb({
      selects: [[], []],
      fail: (w) => {
        if (w.kind === 'insert' && w.table === tasks && String(w.values.title).includes('\u0000')) return 'invalid byte sequence for encoding "UTF8": 0x00'
        if (w.table === clickupImportJobs && JSON.stringify(w.values).includes('\\u0000')) return 'unsupported Unicode escape sequence'
        return null
      },
    })
    const svc = serviceOn(db)
    await svc.processSheetImport('job-4', 'ws-1', IMPORTER, { content: 'Title\nAlpha\nBro\u0000ken\nGamma\n', preset: 'generic' })
    const done = jobSets(committed).find((s) => s.status === 'completed')
    assert.ok(done, 'the run completed')
    assert.equal(done.createdCount, 2)
    assert.equal(done.result.errors.length, 1)
    assert.match(done.result.errors[0], /^Row 3 \("Bro\uFFFDken"\): invalid byte sequence/)
  })

  it('no write waits for a second connection while a transaction holds one', async () => {
    const { db, waited } = makeDb({ selects: [[], []] })
    const svc = serviceOn(db)
    // Three rows: progress is written after each, beside the rows' transactions.
    const summary = await svc.processSheetImport('job-5', 'ws-1', IMPORTER, { content: 'Title,Tags\nAlpha,a\nBeta,b\nGamma,c\n', preset: 'generic' })
    assert.equal(summary.tasksCreated, 3)
    assert.deepEqual(waited, [])
  })
})

describe('SpreadsheetImportService.processSheetImport — the merge and the tags', () => {
  it('a merge from a sheet with no Status or Priority writes neither (found-5-oct/import-merge-resets-fields-the-file-lacks)', async () => {
    const existing = [{ id: 'task-two', listName: 'Alpha', title: 'two' }]
    const { db, committed } = makeDb({ selects: [[], existing] })
    const svc = serviceOn(db)
    const summary = await svc.processSheetImport('job-6', 'ws-1', IMPORTER, {
      content: 'Title,List,Description\ntwo,Alpha,new words\n',
      preset: 'generic',
      strategy: 'merge',
    })
    assert.equal(summary.tasksUpdated, 1)
    const [set] = taskUpdates(committed)
    assert.equal(set.description, 'new words')
    for (const field of ['status', 'statusCategory', 'priority']) assert.equal(field in set, false, `${field} is not written`)
  })

  it('a tag is found by its name whatever its case (found-30-sep/spreadsheet-import-skips-task-rules)', async () => {
    const { db, committed, wheres } = makeDb({ selects: [[], [], [{ id: 'label-urgent' }]] })
    const svc = serviceOn(db)
    const summary = await svc.processSheetImport('job-7', 'ws-1', IMPORTER, { content: 'Title,Tags\nAlpha,urgent-X\n', preset: 'generic' })
    assert.equal(summary.labelsCreated, 0)
    assert.deepEqual(into(committed, labels), [])
    assert.deepEqual(into(committed, taskLabelAssignments).map((a) => a.labelId), ['label-urgent'])
    const asked = wheres
      .map((w) => { try { return new PgDialect().sqlToQuery(w as any) } catch { return null } })
      .find((q) => q?.sql.includes('"labels"."name"'))
    assert.ok(asked, 'the tag was looked up by its name')
    assert.match(asked!.sql, /lower\("labels"\."name"\) = lower\(\$2\)/)
    assert.deepEqual(asked!.params, ['ws-1', 'urgent-X'])
  })
})


describe('SpreadsheetImportService — who may import, and which tasks an import may match and merge into', () => {
  it('a guest is refused the preview and the import, 403 “Guests cannot import data into a workspace”, before anything is read or written (found-6-oct/a-guest-who-may-import-makes-a-space)', async () => {
    // The rule itself (`assertMayImport`): the stand-in answers each membership lookup with a guest's role.
    const guest = [{ role: 'guest' }]
    const { db, committed } = makeDb({ selects: [guest, guest] })
    const svc = serviceOn(db, IMPORT_ACCESS)
    const refused = (e: unknown) => e instanceof ForbiddenException && e.message === GUESTS_CANNOT_IMPORT
    await assert.rejects(() => svc.previewSheet('ws-1', IMPORTER, { content: 'Title\nAlpha\n' }), refused, 'the preview')
    await assert.rejects(() => svc.startSheetImport('ws-1', IMPORTER, { content: 'Title\nAlpha\n' }), refused, 'the import')
    assert.deepEqual(committed, [], 'no job row, space or task is written')
  })

  it('a guest is refused the history and a job’s report, 403 “Guests cannot import data into a workspace”, before any job is read; a member reads them (found-6-oct/import-history-read-by-anyone)', async () => {
    const guest = [{ role: 'guest' }]
    const refused = (e: unknown) => e instanceof ForbiddenException && e.message === GUESTS_CANNOT_IMPORT
    // Were a job read first, it would take the guest's row as the job, and the rule after it would find nobody.
    const asGuest = serviceOn(makeDb({ selects: [guest, guest] }).db, IMPORT_ACCESS)
    await assert.rejects(() => asGuest.listJobs('ws-1', IMPORTER), refused, 'the history')
    await assert.rejects(() => asGuest.readJob('ws-1', 'job-1', IMPORTER), refused, 'the report')
    const job = { id: 'job-1', status: 'completed' }
    const asMember = serviceOn(makeDb({ selects: [[{ role: 'member' }], [job], [{ role: 'member' }], [job]] }).db, IMPORT_ACCESS)
    assert.deepEqual(await asMember.listJobs('ws-1', IMPORTER), [job])
    assert.deepEqual(await asMember.readJob('ws-1', 'job-1', IMPORTER), job)
  })

  it('the preview counts duplicates among the tasks its importer may open: it asks for those as the importer (found-6-oct/import-previews-tell-what-private-places-hold)', async () => {
    // What the importer may open holds (Sprint 1, Alpha); a private list's (Hidden, Secret) is not theirs to match.
    const { db } = makeDb({ selects: [[{ id: 'open-alpha', listName: 'Sprint 1', title: 'Alpha' }]] })
    const { rules, asked } = access()
    const svc = serviceOn(db, rules)
    const importer = { id: 'user-1', role: 'member' }
    const res = await svc.previewSheet('ws-1', importer, { content: 'Title,List\nAlpha,Sprint 1\nSecret,Hidden\n', preset: 'generic' })
    assert.deepEqual(asked.index, [{ workspaceId: 'ws-1', importer }])
    assert.equal(res.duplicates, 1)
  })

  it('a merge asks the write rule of the task it would change, first and outside the row’s transaction: what the rule refuses is that row’s error, and nothing of the row is written (found-6-oct/import-merge-writes-tasks-its-importer-may-not-change)', async () => {
    const existing = [
      { id: 'task-view', listName: 'Shared', title: 'two' },
      { id: 'task-mine', listName: 'Mine', title: 'three' },
    ]
    // members, the tasks the importer may match; no tag is looked up, as the tagged row is refused.
    const { db, committed, waited } = makeDb({ selects: [[], existing] })
    const refusal = new ForbiddenException(`This space's default permission is "View only", which does not allow changing its tasks`)
    // The rule reads as the real one does, so a read it sent from inside the row's transaction would wait.
    const { rules, asked } = access({ refuse: { 'task-view': refusal }, reads: true })
    const svc = serviceOn(db, rules)
    const summary = await svc.processSheetImport('job-8', 'ws-1', IMPORTER, {
      content: 'Title,List,Status,Tags\ntwo,Shared,Done,urgent\nthree,Mine,Done,\n',
      preset: 'generic',
      strategy: 'merge',
    })
    assert.deepEqual(asked.merges, [
      { taskId: 'task-view', actorId: 'user-1', fields: ['status', 'statusCategory', 'tags'] },
      { taskId: 'task-mine', actorId: 'user-1', fields: ['status', 'statusCategory'] },
    ])
    assert.equal(summary.duplicatesDetected, 2)
    assert.equal(summary.tasksUpdated, 1, 'the task it may change is merged')
    assert.deepEqual(summary.errors, [`Row 2 ("two"): ${refusal.message}`])
    assert.equal(taskUpdates(committed).length, 1, 'one task is written: the one it may change')
    assert.deepEqual(into(committed, taskLabelAssignments), [], 'and the refused row’s tag is not put on its task')
    assert.deepEqual(into(committed, labels), [])
    assert.deepEqual(waited, [], 'the rule is asked before the row’s transaction opens, not while it holds a connection')
  })
})
