import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { getTableName } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { TasksService } from './tasks.service'
import { ATTACHMENTS_ZIP_MAX_BYTES, attachmentsZipName } from './attachments-zip'

/**
 * DOWNLOAD ALL — `TasksService.attachmentsZip` (`found-30-sep/attachments-have-no-download-all`).
 *
 * Who may have it (the read rule, answered 404), what goes in (the task's files
 * in the list's order, comments' among them; its links listed in `links.txt`;
 * nothing still arriving), when there is none (404, not an empty zip), how much
 * (refused before a byte past the cap), and what it is called. Each archive is
 * read back with Info-ZIP's `unzip`, as the writer's own tests do.
 *
 * The Drizzle stand-in answers each select by the table it is FROM and records
 * the verbs it is asked; the store stand-in answers HEAD and GET by key.
 */
const dialect = new PgDialect()
const sqlOf = (x: unknown) => dialect.sqlToQuery(x as never).sql

function makeDb(rowsByTable: Record<string, unknown[]>) {
  const calls: Array<{ table: string; verb: string; args: unknown[] }> = []
  const chain = (): any => {
    let table = '?'
    let rows: unknown[] = []
    const c: any = {
      from: (t: unknown) => {
        table = getTableName(t as never)
        rows = rowsByTable[table] ?? []
        calls.push({ table, verb: 'from', args: [] })
        return c
      },
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(rows).then(resolve, reject),
    }
    for (const verb of ['where', 'innerJoin', 'leftJoin', 'orderBy', 'limit']) {
      c[verb] = (...args: unknown[]) => {
        calls.push({ table, verb, args })
        return c
      }
    }
    return c
  }
  return { db: { select: mock.fn(() => chain()) } as any, calls }
}

/** A store holding `objects` by key; `gets` records what was read from it. */
function makeStore(objects: Record<string, Buffer>, sizes: Record<string, number> = {}) {
  const gets: string[] = []
  const notFound = () => Object.assign(new Error('NotFound'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } })
  return {
    gets,
    r2: {
      configured: true,
      headObject: mock.fn(async (key: string) => {
        if (!(key in objects)) throw notFound()
        return { ContentLength: sizes[key] ?? objects[key].length }
      }),
      getObjectStream: mock.fn(async (key: string) => {
        gets.push(key)
        if (!(key in objects)) throw Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
        // In pieces, as a store answers.
        const body = objects[key]
        return Readable.from([body.subarray(0, 3), body.subarray(3)])
      }),
      getObjectUrl: mock.fn(async (key: string) => `https://store.invalid/${key}`),
    },
  }
}

function makeService(db: any, r2: any) {
  return new TasksService(
    db,
    { emitToTask: mock.fn(), emitToList: mock.fn(), emitToUser: mock.fn(), emitToWorkspace: mock.fn() } as any,
    {} as any, // search
    {} as any, // automations
    {} as any, // webhooks
    {} as any, // slack
    {} as any, // notifications
    r2,
    {} as any, // calendarSync
    {} as any, // security
  )
}

const READER = { id: 'reader-1', role: 'user' }
const TASK = { id: '11111111-1111-4111-8111-111111111111', title: 'Q3 review' }
const key = (name: string) => `workspaces/w1/tasks/${TASK.id}/attachments/1790000000000-${name}`
const at = (minute: number) => new Date(Date.UTC(2026, 8, 30, 9, minute))

/** The rows as the list's query hands them back: already in the order they were attached. */
const ROWS = [
  { id: 'f1', fileName: 'notes.txt', contentType: 'text/plain', storageKey: key('notes.txt'), createdAt: at(1) },
  { id: 'l1', fileName: 'spec', contentType: 'text/url', storageKey: 'https://example.invalid/spec', createdAt: at(2) },
  { id: 'f2', fileName: 'photo.png', contentType: 'image/png', storageKey: key('photo.png'), createdAt: at(3) },
  // Still arriving: no key yet, and no Download link either.
  { id: 'f3', fileName: 'half.mov', contentType: 'video/quicktime', storageKey: '', createdAt: at(4) },
  // A comment's file: a row of the task like any other, in its place.
  { id: 'f4', fileName: 'notes.txt', contentType: 'text/plain', storageKey: key('notes-2.txt'), createdAt: at(5) },
  { id: 'l2', fileName: 'Board\nmockup', contentType: 'text/url', storageKey: 'https://example.invalid/board', createdAt: at(6) },
]
const OBJECTS = {
  [key('notes.txt')]: Buffer.from('first notes\n'),
  [key('photo.png')]: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3, 255, 254]),
  [key('notes-2.txt')]: Buffer.from('second notes, from a comment\n'),
}

async function drain(stream: Readable): Promise<Buffer> {
  const parts: Buffer[] = []
  for await (const part of stream) parts.push(part as Buffer)
  return Buffer.concat(parts)
}

function readBack(zip: Buffer): { names: string[]; bytes: (name: string) => Buffer } {
  const dir = mkdtempSync(join(tmpdir(), 'attachments-zip-'))
  const file = join(dir, 'task.zip')
  writeFileSync(file, zip)
  try {
    const names = execFileSync('unzip', ['-Z1', file]).toString('utf8').split('\n').filter(Boolean)
    const held = new Map(names.map((n) => [n, execFileSync('unzip', ['-p', file, n])]))
    assert.match(execFileSync('unzip', ['-t', file]).toString('utf8'), /No errors detected/)
    return { names, bytes: (n) => held.get(n) ?? Buffer.alloc(0) }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('TasksService.attachmentsZip — who may have it', () => {
  it('answers a reader who may not open the task with 404, as a task that is not there, and reads nothing', async () => {
    const { db, calls } = makeDb({ task_attachments: ROWS })
    const { r2, gets } = makeStore(OBJECTS)
    const svc: any = makeService(db, r2)
    svc.taskOpenTo = mock.fn(async () => null)
    await assert.rejects(svc.attachmentsZip(TASK.id, READER), (err: unknown) => err instanceof NotFoundException)
    assert.deepEqual(svc.taskOpenTo.mock.calls[0].arguments, [TASK.id, READER], 'the read rule was asked about someone else')
    assert.equal(calls.filter((c) => c.table === 'task_attachments').length, 0, 'the task’s files were read for a reader refused the task')
    assert.equal(r2.headObject.mock.callCount() + gets.length, 0)
  })
})

describe('TasksService.attachmentsZip — what goes in', () => {
  it('holds the task’s files in the list’s order, comments’ among them, and lists its links in links.txt', async () => {
    const { db, calls } = makeDb({ task_attachments: ROWS })
    const { r2, gets } = makeStore(OBJECTS)
    const svc: any = makeService(db, r2)
    svc.taskOpenTo = mock.fn(async () => TASK)
    const out = await svc.attachmentsZip(TASK.id, READER)
    // Asked in the list's order: created_at, then id.
    const order = calls.find((c) => c.table === 'task_attachments' && c.verb === 'orderBy')
    assert.equal(order?.args.map(sqlOf).join(', '), '"task_attachments"."created_at" asc, "task_attachments"."id" asc')
    const { names, bytes } = readBack(await drain(out.stream))
    assert.deepEqual(names, ['notes.txt', 'photo.png', 'notes (2).txt', 'links.txt'])
    assert.ok(bytes('notes.txt').equals(OBJECTS[key('notes.txt')]))
    assert.ok(bytes('photo.png').equals(OBJECTS[key('photo.png')]))
    assert.ok(bytes('notes (2).txt').equals(OBJECTS[key('notes-2.txt')]))
    // Each link by its name, on one line, then its address; the link itself is never read.
    assert.equal(bytes('links.txt').toString('utf8'), 'spec\nhttps://example.invalid/spec\n\nBoard mockup\nhttps://example.invalid/board\n')
    assert.deepEqual(gets, [key('notes.txt'), key('photo.png'), key('notes-2.txt')])
    assert.equal(out.fileName, 'Q3 review-attachments.zip')
  })

  it('answers 404 for a task with no files, rather than an empty zip', async () => {
    const onlyLinks = ROWS.filter((r) => r.id === 'l1' || r.id === 'f3')
    const { db } = makeDb({ task_attachments: onlyLinks })
    const { r2 } = makeStore(OBJECTS)
    const svc: any = makeService(db, r2)
    svc.taskOpenTo = mock.fn(async () => TASK)
    await assert.rejects(
      svc.attachmentsZip(TASK.id, READER),
      (err: unknown) => err instanceof NotFoundException && /no files/i.test((err as Error).message),
    )
  })

  it('refuses files that come to more than a zip may hold, before a byte of them is read', async () => {
    const { db } = makeDb({ task_attachments: ROWS })
    // The rows say a few bytes; the store says otherwise, and the store is asked.
    const { r2, gets } = makeStore(OBJECTS, { [key('photo.png')]: ATTACHMENTS_ZIP_MAX_BYTES })
    const svc: any = makeService(db, r2)
    svc.taskOpenTo = mock.fn(async () => TASK)
    await assert.rejects(svc.attachmentsZip(TASK.id, READER), (err: unknown) => err instanceof BadRequestException)
    assert.equal(r2.headObject.mock.callCount(), 3, 'each file was not sized by the store')
    assert.deepEqual(gets, [])
  })
})

describe('attachmentsZipName — the zip is named after the task', () => {
  it('names it <title>-attachments.zip, made safe, with the whole name in filename*', () => {
    const plain = attachmentsZipName('Q3: "final"/review')
    assert.equal(plain.fileName, 'Q3_ _final__review-attachments.zip')
    assert.equal(
      plain.disposition,
      `attachment; filename="Q3_ _final__review-attachments.zip"; filename*=UTF-8''Q3_%20_final__review-attachments.zip`,
    )
    // A title with no ASCII in it keeps its name in filename*, and a plain one for old clients.
    const arabic = attachmentsZipName('مراجعة الربع')
    assert.equal(arabic.fileName, 'مراجعة الربع-attachments.zip')
    assert.match(arabic.disposition, /^attachment; filename="task-attachments\.zip"; filename\*=UTF-8''%D9%85/)
    assert.equal(decodeURIComponent(arabic.disposition.split("UTF-8''")[1]), 'مراجعة الربع-attachments.zip')
    assert.equal(attachmentsZipName('').fileName, 'task-attachments.zip')
  })
})
