import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { getTableName } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { TasksService } from './tasks.service'

/**
 * Security regressions for the tasks module:
 *
 *   1. IDOR — `listAttachments` must gate on task READ access (workspace
 *      membership + private-container membership), not return signed R2 URLs for
 *      any task id.
 *   2. Cross-tenant object refs — `addAttachment` must reject a client
 *      `storageKey` that isn't under this task's own per-workspace R2 prefix, and
 *      must not let the `url` path smuggle a raw storage key.
 *   3. SSRF / token exfiltration — `fetchGitlabState` must never send the
 *      workspace OAuth token to a host derived from the pasted URL unless it's on
 *      the operator allowlist; off-allowlist hosts are skipped, and even
 *      allowlisted targets go through safeFetch (private/reserved IPs blocked).
 *   4. Private-container leak — `getTasksForWorkspace` must ask the database
 *      for a member's rows by their reach (space, project and list) and the
 *      private-item rule, before its limit.
 *   5. A task's dependencies are its own workspace's rows, read with no reader
 *      as with one.
 *
 * Uses the repo's queued-thenable Drizzle stand-in: every db.select() pops the
 * next planned rows; insert captures its `.values()` payload.
 */
const VERBS = [
  'from', 'where', 'limit', 'innerJoin', 'leftJoin', 'orderBy', 'groupBy',
  'values', 'onConflictDoNothing', 'set', 'returning',
]
function node(rows: unknown[]) {
  const p = Promise.resolve(rows) as any
  for (const v of VERBS) p[v] = () => p
  return p
}
function makeDb(selectResults: unknown[][] = []) {
  const selects = [...selectResults]
  const inserted: Array<Record<string, unknown>> = []
  const deletes: unknown[] = []
  const db = {
    select: mock.fn(() => node(selects.shift() ?? [])),
    insert: mock.fn(() => ({
      values: (v: Record<string, unknown>) => {
        inserted.push(v)
        return node([{ id: 'row-1', ...v }])
      },
    })),
    update: mock.fn(() => ({ set: (v: Record<string, unknown>) => node([{ id: 'row-1', ...v }]) })),
    delete: mock.fn(() => {
      deletes.push(true)
      return node([])
    }),
  } as any
  return { db, inserted, deletes }
}

function makeService(db: any, overrides: Partial<Record<string, any>> = {}) {
  const realtime = { emitToTask: mock.fn(), emitToList: mock.fn(), emitToUser: mock.fn(), emitToWorkspace: mock.fn() }
  const search = { indexTaskAttachment: mock.fn(async () => undefined) }
  const r2 = overrides.r2 ?? { configured: false }
  return new TasksService(
    db,
    realtime as any,
    search as any,
    { fire: mock.fn(async () => undefined) } as any, // automations
    { fire: mock.fn(async () => undefined) } as any, // webhooks
    { notify: mock.fn(async () => undefined) } as any, // slack
    {} as any, // notifications
    r2 as any,
    { deleteEverywhere: mock.fn(async () => undefined) } as any, // calendarSync
    { logAuditEvent: mock.fn(async () => undefined) } as any, // security
  )
}

// A task-context row shaped like assertTaskReadAccess's select.
const CTX = (over: Record<string, unknown> = {}) => [{
  taskId: 't1', listId: 'l1', createdById: 'u-creator', workspaceId: 'w1',
  spaceId: 's1', spaceVisibility: 'public', projectId: 'p1', projectVisibility: null,
  ...over,
}]

// --- 1. listAttachments IDOR ------------------------------------------------

describe('TasksService.listAttachments — read-access gate (IDOR)', () => {
  const ATT = [{
    id: 'a1', fileName: 'secret.pdf', sizeBytes: 12, contentType: 'application/pdf',
    uploadedById: 'u1', createdAt: new Date('2026-01-01'),
    storageKey: 'workspaces/w1/tasks/t1/attachments/1-secret.pdf',
  }]

  it('accepts a plain workspace member on a public container and returns rows', async () => {
    // The container rule asks the project's folder too: `[]`, in none.
    const { db } = makeDb([CTX(), [{ role: 'member' }], [], ATT])
    const svc = makeService(db)
    const out = await svc.listAttachments('t1', 'member-1')
    assert.equal(out.length, 1)
    assert.equal(out[0].id, 'a1')
    // r2 unconfigured → url falls back to the raw storage key (no signing).
    assert.equal(out[0].url, 'workspaces/w1/tasks/t1/attachments/1-secret.pdf')
  })

  it('rejects a non-member (no workspace membership row)', async () => {
    const { db } = makeDb([CTX(), []])
    const svc = makeService(db)
    await assert.rejects(() => svc.listAttachments('t1', 'outsider'), /workspace not found/i)
    // The attachment query is never reached.
    assert.equal(db.select.mock.callCount(), 2)
  })

  it('rejects a workspace member who is not a member of the task\'s private space', async () => {
    const { db } = makeDb([
      CTX({ spaceVisibility: 'private' }),
      [{ role: 'member' }],
      [], // space-membership lookup empty
    ])
    const svc = makeService(db)
    await assert.rejects(() => svc.listAttachments('t1', 'ws-member'), /private/i)
  })

  it('404s for a missing task before any membership work', async () => {
    const { db } = makeDb([[]]) // ctx lookup empty
    const svc = makeService(db)
    await assert.rejects(() => svc.listAttachments('missing', 'u1'), /task not found/i)
  })
})

// --- 2. addAttachment storageKey prefix ------------------------------------

describe('TasksService.addAttachment — storageKey prefix enforcement', () => {
  const mockWrite = (svc: any) => {
    svc.assertTaskWriteAccess = mock.fn(async () => ({ taskId: 't1', workspaceId: 'w1' }))
  }

  it('rejects a storageKey pointing outside the task\'s own prefix (cross-tenant object)', async () => {
    const { db, inserted } = makeDb([])
    const svc: any = makeService(db)
    mockWrite(svc)
    await assert.rejects(
      () => svc.addAttachment('t1', 'u1', {
        fileName: 'evil',
        storageKey: 'workspaces/other-ws/tasks/t9/attachments/steal.pdf',
        sizeBytes: 1024,
      }),
      /upload prefix/i,
    )
    assert.equal(inserted.length, 0, 'nothing is stored when the key is rejected')
  })

  it('accepts a storageKey under this task\'s prefix and stores it verbatim', async () => {
    const key = 'workspaces/w1/tasks/t1/attachments/1700000000-file.pdf'
    const { db, inserted } = makeDb([[{ id: 't1' }]]) // task existence lookup
    const svc: any = makeService(db)
    mockWrite(svc)
    const out = await svc.addAttachment('t1', 'u1', {
      fileName: 'file.pdf', storageKey: key, contentType: 'application/pdf', sizeBytes: 1024,
    })
    assert.equal(inserted[0].storageKey, key)
    assert.equal(out.storageKey, key)
  })

  it('keeps the URL-link path working for a genuine http(s) link', async () => {
    const { db, inserted } = makeDb([[{ id: 't1' }]])
    const svc: any = makeService(db)
    mockWrite(svc)
    await svc.addAttachment('t1', 'u1', {
      fileName: 'Design doc', url: 'https://example.com/doc', sizeBytes: 1024,
    })
    assert.equal(inserted[0].storageKey, 'https://example.com/doc')
  })

  it('rejects a `url` that is a raw storage key rather than an http(s) link', async () => {
    const { db, inserted } = makeDb([])
    const svc: any = makeService(db)
    mockWrite(svc)
    await assert.rejects(
      () => svc.addAttachment('t1', 'u1', {
        fileName: 'evil',
        url: 'workspaces/other-ws/tasks/t9/attachments/steal.pdf',
        sizeBytes: 1024,
      }),
      /presign step/i,
    )
    assert.equal(inserted.length, 0)
  })
})

// --- 3. fetchGitlabState SSRF ----------------------------------------------

describe('TasksService.fetchGitlabState — GitLab host allowlist (SSRF)', () => {
  it('skips (returns null, sends no token) when the pasted host is off the allowlist', async () => {
    delete process.env.GITLAB_ALLOWED_HOSTS
    const svc: any = makeService(makeDb([]).db)
    const out = await svc.fetchGitlabState(
      'pull_request',
      { projectPath: 'a/b', number: '1', host: 'gitlab.evil.com' },
      'super-secret-token',
    )
    assert.equal(out, null)
  })

  it('gitlabAllowedHosts always includes gitlab.com and parses GITLAB_ALLOWED_HOSTS', async () => {
    const svc: any = makeService(makeDb([]).db)
    delete process.env.GITLAB_ALLOWED_HOSTS
    let hosts = svc.gitlabAllowedHosts()
    assert.equal(hosts.has('gitlab.com'), true)
    assert.equal(hosts.has('gitlab.evil.com'), false)

    process.env.GITLAB_ALLOWED_HOSTS = 'gitlab.internal.example.com, GITLAB.CORP.com ,'
    hosts = svc.gitlabAllowedHosts()
    assert.equal(hosts.has('gitlab.com'), true)
    assert.equal(hosts.has('gitlab.internal.example.com'), true)
    assert.equal(hosts.has('gitlab.corp.com'), true, 'entries are trimmed + lowercased')
    delete process.env.GITLAB_ALLOWED_HOSTS
  })

  it('admits an allowlisted host but still blocks a private/reserved IP target via safeFetch', async () => {
    // 127.0.0.1 on the allowlist ⇒ NOT skipped (would return null if skipped);
    // instead safeFetch's SSRF guard rejects the loopback target synchronously.
    process.env.GITLAB_ALLOWED_HOSTS = '127.0.0.1'
    const svc: any = makeService(makeDb([]).db)
    try {
      await assert.rejects(
        () => svc.fetchGitlabState('issue', { projectPath: 'a/b', number: '1', host: '127.0.0.1' }, 'tok'),
        /private|reserved|blocked/i,
      )
    } finally {
      delete process.env.GITLAB_ALLOWED_HOSTS
    }
  })
})

// --- 4. getTasksForWorkspace: who may see which rows -----------------------

/**
 * The workspace list chooses its rows IN SQL now, before its limit: the reach
 * (space, project and the list's own privacy) and the private-item rule. It
 * filtered in JavaScript with a copy of the rule that had no private list and
 * left out assignees (`found-24-sep/private-lists-skipped-by-task-reads`), so
 * these read the query it asks, rendered, rather than rows it throws away.
 * The rows themselves are the database's to choose; `private-list-reach`
 * measures them on a lane.
 */
describe('TasksService.getTasksForWorkspace — who may see which rows', () => {
  const dialect = new PgDialect()
  /** A stand-in that answers each table's rows and keeps every WHERE with its table. */
  function recordingDb(rowsByTable: Record<string, unknown[]>) {
    const wheres: Array<{ table: string; condition: unknown }> = []
    const chain = (): any => {
      let rows: unknown[] = []
      let table = '?'
      const c: any = {
        from: (t: unknown) => { table = getTableName(t as never); rows = rowsByTable[table] ?? []; return c },
        where: (condition: unknown) => { wheres.push({ table, condition }); return c },
        innerJoin: () => c, leftJoin: () => c, orderBy: () => c, limit: () => c, groupBy: () => c,
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(rows).then(resolve, reject),
      }
      return c
    }
    return { db: { select: mock.fn(() => chain()) } as any, wheres }
  }
  const rendered = (wheres: Array<{ table: string; condition: unknown }>, table: string) =>
    wheres.filter((w) => w.table === table && w.condition != null).map((w) => dialect.sqlToQuery(w.condition as never).sql)
  const TASK = { id: 't1', title: 'A task' }

  it('asks the database for a member’s rows by their reach — space, project and list — and the private-item rule', async () => {
    const { db, wheres } = recordingDb({ workspace_members: [{ role: 'member' }], tasks: [TASK] })
    const out = await makeService(db).getTasksForWorkspace('w1', 500, { actorId: 'u-member', actorRole: 'member', includeAssignees: false })
    assert.deepEqual(out.map((r: any) => r.id), ['t1'])
    const [taskWhere] = rendered(wheres, 'tasks')
    assert.ok(taskWhere, 'the tasks were never read')
    assert.match(taskWhere, /"tasks"\."list_id" in/, `no reach on the member's rows: ${taskWhere}`)
    assert.match(taskWhere, /"tasks"\."visibility"/, `no private-item rule on the member's rows: ${taskWhere}`)
    const reach = rendered(wheres, 'lists').find((q) => /"lists"\."visibility"/.test(q))
    assert.ok(reach, 'the reach has no private-list rule')
    assert.match(reach, /"spaces"\."visibility"/, `the reach has no space rule: ${reach}`)
    assert.match(reach, /"projects"\."visibility"/, `the reach has no project rule: ${reach}`)
  })

  it('asks neither rule of a manager, who may see every row', async () => {
    const { db, wheres } = recordingDb({ workspace_members: [{ role: 'workspace_admin' }], tasks: [TASK] })
    const out = await makeService(db).getTasksForWorkspace('w1', 500, { actorId: 'u-admin', actorRole: 'member', includeAssignees: false })
    assert.equal(out.length, 1)
    const [taskWhere] = rendered(wheres, 'tasks')
    assert.ok(taskWhere && !/visibility|"list_id" in/.test(taskWhere), `a manager's rows were filtered: ${taskWhere}`)
  })

  it('gives a platform super_admin every row without a membership lookup', async () => {
    const { db, wheres } = recordingDb({ tasks: [TASK] })
    const out = await makeService(db).getTasksForWorkspace('w1', 500, { actorId: 'root', actorRole: 'super_admin', includeAssignees: false })
    assert.equal(out.length, 1)
    assert.equal(rendered(wheres, 'workspace_members').length, 0, 'a super_admin was looked up')
  })

  it('gives somebody outside the workspace nothing, and never reads its tasks', async () => {
    const { db, wheres } = recordingDb({ workspace_members: [], tasks: [TASK] })
    const out = await makeService(db).getTasksForWorkspace('w1', 500, { actorId: 'u-stranger', actorRole: 'member', includeAssignees: false })
    assert.deepEqual(out, [])
    assert.equal(rendered(wheres, 'tasks').length, 0, 'the tasks were read for a stranger')
  })

  it('stays unfiltered when no actor is supplied (internal callers)', async () => {
    const { db, wheres } = recordingDb({ tasks: [TASK] })
    const out = await makeService(db).getTasksForWorkspace('w1', 500, { includeAssignees: false })
    assert.equal(out.length, 1)
    const [taskWhere] = rendered(wheres, 'tasks')
    assert.ok(taskWhere && !/visibility/.test(taskWhere), `an internal read was filtered: ${taskWhere}`)
  })
})

// --- 5. getTask: what a task shows from elsewhere --------------------------

/**
 * A dependency hands back the related task's WHOLE row. For a reader, the
 * reader rule (`readableTaskIds`, in the task's own workspace) leaves out a
 * task they may not open, and a task in another workspace with it, so no
 * route can show that this query's own workspace condition is there: remove
 * it and every reader's answer is the same (`tb-41` reddened nothing). It is
 * the only rule an internal caller has, which reads with no reader, so this
 * reads the query it asks.
 */
describe('TasksService.getTask — what a task shows from elsewhere', () => {
  const dialect = new PgDialect()
  it('reads a task’s dependencies from its own workspace only, with no reader as with one', async () => {
    const wheres: Array<{ table: string; condition: unknown }> = []
    const rowsByTable: Record<string, unknown[]> = {
      lists: [{ workspaceId: 'w1', spaceId: 's1', projectId: 'p1' }],
    }
    const chain = (): any => {
      let rows: unknown[] = []
      let table = '?'
      const c: any = {
        from: (t: unknown) => { table = getTableName(t as never); rows = rowsByTable[table] ?? []; return c },
        where: (condition: unknown) => { wheres.push({ table, condition }); return c },
        innerJoin: () => c, leftJoin: () => c, orderBy: () => c, limit: () => c, groupBy: () => c,
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(rows).then(resolve, reject),
      }
      return c
    }
    const db = {
      select: mock.fn(() => chain()),
      query: {
        tasks: { findFirst: mock.fn(async () => ({ id: 't1', listId: 'l1', subtasks: [], assignees: [], parentTaskId: null, taskTypeId: null })) },
        taskChecklists: { findMany: mock.fn(async () => []) },
      },
    } as any
    const out = await makeService(db).getTask('t1')
    assert.ok(out, 'the task was not read')
    const [depWhere] = wheres
      .filter((w) => w.table === 'task_dependencies' && w.condition != null)
      .map((w) => dialect.sqlToQuery(w.condition as never).sql)
    assert.ok(depWhere, 'the dependencies were never read')
    assert.match(depWhere, /"spaces"\."workspace_id" = /, `the dependencies are not bound to the task's workspace: ${depWhere}`)
  })
})
