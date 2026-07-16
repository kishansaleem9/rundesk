import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { taskComments, taskAttachments } from '@rundesk/db'
import { ClickUpImportService } from './clickup-import.service'
import { ClickUpApiClient, type ClickUpClientLike } from './clickup-api.util'

/**
 * §12.5 gap-closer — ClickUp API enrichment (comments + attachments the CSV
 * cannot carry). The ClickUp HTTP layer is mocked (a fake `ClickUpClientLike`
 * or a real `ClickUpApiClient` fed a mock `fetchImpl`) and R2 is mocked, so:
 *   - comment mapping creates task_comments rows (author resolved vs. preserved
 *     as text + timestamp when it can't be),
 *   - attachment import calls the R2 upload path + rows the metadata,
 *   - a per-item failure is collected into errors, not thrown,
 *   - attachments degrade gracefully (skipped) when R2 is not configured,
 *   - the CSV-only path is unchanged when no token is supplied.
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

/** A permissive R2 stand-in that records putObject calls. */
function makeR2(configured = true) {
  const puts: Array<{ key: string; body: Buffer; contentType: string }> = []
  const r2 = {
    configured,
    putObject: async (key: string, body: Buffer, contentType: string) => {
      puts.push({ key, body, contentType })
    },
    getObjectUrl: async (key: string) => `https://cdn/${key}`,
  } as any
  return { r2, puts }
}

describe('ClickUpImportService.enrichTasks — comments', () => {
  it('creates a task_comments row per ClickUp comment, resolving or preserving the author', async () => {
    const members = [{ userId: 'u-1', displayName: 'John', email: 'john@x.com' }]
    // selects: loadWorkspaceTaskIds → valid, then loadMemberIndex → members
    const { db, inserts } = makeDb([[{ id: 'our-1' }], members])
    const { r2 } = makeR2(true)
    const svc = new ClickUpImportService(db, r2)

    const client: ClickUpClientLike = {
      getTaskComments: async () => [
        { id: 'c1', comment_text: 'Hello team', user: { email: 'john@x.com', username: 'John' }, date: '1700000000000' },
        { id: 'c2', comment_text: 'External note', user: { username: 'Ext', email: 'ext@y.com' }, date: '1700000001000' },
      ],
      getTaskAttachments: async () => [],
      downloadAttachment: async () => null,
    }

    const summary = await svc.enrichTasks('ws-1', 'user-1', 'tok', [{ clickupTaskId: 'cu-1', taskId: 'our-1' }], {
      client,
    })

    assert.equal(summary.commentsImported, 2)
    const rows = insertsInto(inserts, taskComments)
    assert.equal(rows.length, 2)

    // Resolved author → mapped user id, body untouched, original timestamp kept.
    assert.equal(rows[0].authorId, 'u-1')
    assert.equal(rows[0].body, 'Hello team')
    assert.ok(rows[0].createdAt instanceof Date)

    // Unresolved author → falls back to the importing user, author + timestamp
    // preserved as text in the body.
    assert.equal(rows[1].authorId, 'user-1')
    assert.match(rows[1].body, /Ext/)
    assert.match(rows[1].body, /External note/)
    assert.match(rows[1].body, /ClickUp comment/)

    // Report reflects the API import instead of the CSV "not imported" note.
    assert.match(summary.notImported.comments, /Imported 2 comment/i)
    assert.ok(summary.enrichment)
    assert.equal(summary.enrichment.tasksEnriched, 1)
  })
})

describe('ClickUpImportService.enrichTasks — attachments', () => {
  it('re-uploads bytes to R2 and rows the metadata (real client + mock fetch)', async () => {
    const { db, inserts } = makeDb([[{ id: 'our-1' }], []])
    const { r2, puts } = makeR2(true)
    const svc = new ClickUpImportService(db, r2)

    const fetchImpl = async (input: string | URL) => {
      const url = String(input)
      if (url.includes('/comment')) return new Response(JSON.stringify({ comments: [] }), jsonInit())
      if (/\/task\/cu-1(\?|$)/.test(url)) {
        return new Response(
          JSON.stringify({
            attachments: [
              { id: 'a1', title: 'diagram.png', mimetype: 'image/png', size: 5, url: 'https://attachments.clickup.com/a1.png' },
            ],
          }),
          jsonInit(),
        )
      }
      // attachment bytes are fetched via the SSRF-guarded path (safeFetchImpl),
      // not fetchImpl — this branch is only a fallback and should be unused.
      return new Response(Buffer.from('hello'), { status: 200, headers: { 'content-type': 'image/png' } })
    }
    const client = new ClickUpApiClient({
      apiToken: 'tok',
      fetchImpl,
      // Attachment downloads go through safeFetch; serve the bytes here.
      safeFetchImpl: async () => ({
        status: 200,
        headers: { 'content-type': 'image/png' },
        body: Buffer.from('hello'),
        text: () => 'hello',
      }),
    })

    const summary = await svc.enrichTasks('ws-1', 'user-1', 'tok', [{ clickupTaskId: 'cu-1', taskId: 'our-1' }], {
      client,
    })

    assert.equal(summary.attachmentsImported, 1)
    assert.equal(summary.attachmentsSkipped, 0)

    // The R2 upload path was used, with the existing task-attachment key convention.
    assert.equal(puts.length, 1)
    assert.match(puts[0].key, /^workspaces\/ws-1\/tasks\/our-1\/attachments\/\d+-diagram\.png$/)
    assert.equal(puts[0].contentType, 'image/png')
    assert.equal(puts[0].body.length, 5)

    const attRows = insertsInto(inserts, taskAttachments)
    assert.equal(attRows.length, 1)
    assert.equal(attRows[0].storageKey, puts[0].key)
    assert.equal(attRows[0].contentType, 'image/png')
    assert.equal(attRows[0].sizeBytes, 5)
    assert.equal(attRows[0].fileName, 'diagram.png')
  })

  it('skips attachment bytes gracefully when R2 is not configured', async () => {
    const { db, inserts } = makeDb([[{ id: 'our-1' }], []])
    // No R2 injected at all → not configured.
    const svc = new ClickUpImportService(db)

    let downloadCalled = false
    const client: ClickUpClientLike = {
      getTaskComments: async () => [],
      getTaskAttachments: async () => [
        { id: 'a1', title: 'x.png', mimetype: 'image/png', size: 2, url: 'https://attachments.clickup.com/x.png' },
      ],
      downloadAttachment: async () => {
        downloadCalled = true
        return { buffer: Buffer.from('xx'), contentType: 'image/png' }
      },
    }

    const summary = await svc.enrichTasks('ws-1', 'user-1', 'tok', [{ clickupTaskId: 'cu-1', taskId: 'our-1' }], {
      client,
    })

    assert.equal(summary.attachmentsImported, 0)
    assert.equal(summary.attachmentsSkipped, 1)
    assert.equal(downloadCalled, false, 'bytes are not even fetched when R2 is off')
    assert.equal(insertsInto(inserts, taskAttachments).length, 0)
    assert.ok(summary.enrichment)
    assert.equal(summary.enrichment.r2Configured, false)
    assert.match(summary.enrichment.attachmentsSkippedReason ?? '', /R2/)
  })
})

describe('ClickUpImportService.enrichTasks — per-item failures are collected, not thrown', () => {
  it('records a failing comment fetch and a failing attachment while still importing the good one', async () => {
    const { db, inserts } = makeDb([[{ id: 'our-1' }], []])
    const { r2 } = makeR2(true)
    const svc = new ClickUpImportService(db, r2)

    const client: ClickUpClientLike = {
      getTaskComments: async () => {
        throw new Error('boom-comments')
      },
      getTaskAttachments: async () => [
        { id: 'good', title: 'a.png', mimetype: 'image/png', size: 3, url: 'https://attachments.clickup.com/good.png' },
        { id: 'bad', title: 'b.png', mimetype: 'image/png', size: 3, url: 'https://attachments.clickup.com/bad.png' },
      ],
      downloadAttachment: async (att) => {
        if (att.id === 'bad') throw new Error('dl-fail')
        return { buffer: Buffer.from('abc'), contentType: 'image/png' }
      },
    }

    // Must resolve, not reject.
    const summary = await svc.enrichTasks('ws-1', 'user-1', 'tok', [{ clickupTaskId: 'cu-1', taskId: 'our-1' }], {
      client,
    })

    assert.equal(summary.commentsImported, 0)
    assert.equal(summary.attachmentsImported, 1)
    assert.equal(summary.attachmentsSkipped, 1)
    assert.equal(insertsInto(inserts, taskAttachments).length, 1)
    assert.ok(summary.errors.some((e) => /boom-comments/.test(e)))
    assert.ok(summary.errors.some((e) => /dl-fail/.test(e)))
  })

  it('ignores a mapping entry whose task is not in the workspace', async () => {
    // loadWorkspaceTaskIds returns only our-1; our-evil is filtered out.
    const { db, inserts } = makeDb([[{ id: 'our-1' }], []])
    const { r2 } = makeR2(true)
    const svc = new ClickUpImportService(db, r2)

    const client: ClickUpClientLike = {
      getTaskComments: async () => [{ id: 'c1', comment_text: 'hi', user: {}, date: '100' }],
      getTaskAttachments: async () => [],
      downloadAttachment: async () => null,
    }

    const summary = await svc.enrichTasks(
      'ws-1',
      'user-1',
      'tok',
      [
        { clickupTaskId: 'cu-1', taskId: 'our-1' },
        { clickupTaskId: 'cu-2', taskId: 'our-evil' },
      ],
      { client },
    )

    assert.equal(summary.enrichment?.tasksEnriched, 1)
    assert.equal(insertsInto(inserts, taskComments).length, 1)
    assert.ok(summary.errors.some((e) => /our-evil/.test(e)))
  })

  it('no token → records a skip and imports nothing', async () => {
    const { db, inserts } = makeDb([])
    const svc = new ClickUpImportService(db)
    const summary = await svc.enrichTasks('ws-1', 'user-1', '', [{ clickupTaskId: 'cu-1', taskId: 'our-1' }])
    assert.equal(summary.commentsImported, 0)
    assert.equal(insertsInto(inserts, taskComments).length, 0)
    assert.ok(summary.errors.some((e) => /no API token/i.test(e)))
  })
})

describe('ClickUpImportService.processImport — CSV-only path unchanged when no token', () => {
  it('does not enrich, keeps the not-imported note, and writes no comments/attachments', async () => {
    const csv = ['Task Name,List,Status', 'Alpha,Sprint 1,todo', 'Beta,Sprint 1,todo'].join('\n')
    // selects: loadMemberIndex → [], loadExistingTaskIndex → []
    const { db, inserts } = makeDb([[], []])
    const { r2 } = makeR2(true)
    const svc = new ClickUpImportService(db, r2)

    const summary = await svc.processImport('job-x', 'ws-1', 'user-1', { csv })

    assert.equal(summary.tasksCreated, 2)
    assert.equal(summary.commentsImported, 0)
    assert.equal(summary.attachmentsImported, 0)
    assert.equal(summary.attachmentsSkipped, 0)
    assert.equal(summary.enrichment, undefined)
    // The honest CSV note is preserved untouched.
    assert.match(summary.notImported.comments, /require.*ClickUp API/i)
    assert.match(summary.notImported.attachments, /require.*ClickUp API/i)
    assert.equal(insertsInto(inserts, taskComments).length, 0)
    assert.equal(insertsInto(inserts, taskAttachments).length, 0)
  })
})

const jsonInit = () => ({ status: 200, headers: { 'content-type': 'application/json' } })
