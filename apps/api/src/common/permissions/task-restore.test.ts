import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { taskRestorable } from './task-restore'

/*
 * THE ARCHIVED LIST'S RESTORE IS OFFERED WHERE `POST /tasks/:id/restore`
 * ACCEPTS IT (`found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`):
 * the write rule, archived tasks allowed, and a manager's own-spaces scope,
 * answered rather than thrown. A queued Drizzle stand-in answers the selects
 * in the order the two rules ask them.
 */
function makeDb(results: unknown[][]) {
  const queue = [...results]
  const node = (rows: unknown[]) => {
    const p = Promise.resolve(rows) as any
    for (const v of ['from', 'where', 'limit', 'innerJoin', 'leftJoin', 'orderBy']) p[v] = () => p
    return p
  }
  return { select: () => node(queue.shift() ?? []) } as any
}

const CTX = { taskId: 't1', listId: 'l1', createdById: 'x', isArchived: true, workspaceId: 'w1', spaceId: 's1', projectId: 'p1', folderId: null }
const SCOPE = { spaceId: 's1', workspaceId: 'w1' }

describe('taskRestorable', () => {
  it('an admin may restore any archived task', async () => {
    const db = makeDb([[CTX], [{ role: 'workspace_admin' }], [SCOPE], [{ role: 'workspace_admin' }]])
    assert.equal(await taskRestorable(db, 't1', 'adm'), true)
  })

  it('a manager may not restore in a space they do not belong to', async () => {
    const db = makeDb([[CTX], [{ role: 'manager' }], [SCOPE], [{ role: 'manager' }], []])
    assert.equal(await taskRestorable(db, 't1', 'mgr'), false)
  })

  it('a manager may restore in a space they belong to', async () => {
    const db = makeDb([[CTX], [{ role: 'manager' }], [SCOPE], [{ role: 'manager' }], [{ userId: 'mgr' }]])
    assert.equal(await taskRestorable(db, 't1', 'mgr'), true)
  })

  it('a task that is not there, or a stranger, is simply not restorable', async () => {
    assert.equal(await taskRestorable(makeDb([[]]), 'gone', 'u'), false)
    assert.equal(await taskRestorable(makeDb([[CTX], []]), 't1', 'stranger'), false)
  })

  it('a failure that is not a refusal is not swallowed as "view only"', async () => {
    const db = { select: () => { throw new Error('connection lost') } } as any
    await assert.rejects(() => taskRestorable(db, 't1', 'u'), /connection lost/)
  })
})
