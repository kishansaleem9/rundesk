import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getTableName } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { clipReaderOf } from './clip-reader'

/*
 * `found-5-oct/guests-read-and-delete-every-clip` — who is asking, as the clip
 * rule reads them, for the library, a clip's link and share, search and a
 * task's copy alike. The library read the token's address and the guard's
 * role, search the database's, so one reader could be answered two ways.
 */
const dialect = new PgDialect()
const paramsOf = (cond: unknown) => dialect.sqlToQuery(cond as never).params

/** A database answering the one query with `row`, and saying what it was asked. */
function dbAnswering(row: Record<string, unknown> | undefined) {
  const asked: { fields: string[]; from?: string; joined: Array<{ table: string; params: unknown[] }>; params?: unknown[] } = {
    fields: [],
    joined: [],
  }
  const q: any = {
    from: (t: unknown) => {
      asked.from = getTableName(t as never)
      return q
    },
    leftJoin: (t: unknown, cond: unknown) => {
      asked.joined.push({ table: getTableName(t as never), params: paramsOf(cond) })
      return q
    },
    where: (cond: unknown) => {
      asked.params = paramsOf(cond)
      return q
    },
    limit: async () => (row ? [row] : []),
  }
  const db = {
    select: (fields: Record<string, unknown>) => {
      asked.fields = Object.keys(fields).sort()
      return q
    },
  }
  return { db: db as any, asked }
}

describe('clipReaderOf — who is asking, as the clip rule reads them', () => {
  it('their address is the one the users table holds, and their role their membership’s in the clip’s workspace', async () => {
    const { db, asked } = dbAnswering({ email: 'now@rundesk.dev', platformRole: 'member', role: 'guest' })
    const reader = await clipReaderOf(db, 'ws-1', 'u-1')
    assert.deepEqual(reader, { id: 'u-1', email: 'now@rundesk.dev', role: 'guest' })
    // This person, and their membership of THIS workspace.
    assert.equal(asked.from, 'users')
    assert.deepEqual(asked.params, ['u-1'])
    assert.deepEqual(asked.joined, [{ table: 'workspace_members', params: ['ws-1'] }])
  })

  it('a platform super admin reads as one, whatever their membership, as the workspace guards make them; no membership is no role', async () => {
    const superAdmin = await clipReaderOf(dbAnswering({ email: 'ops@rundesk.dev', platformRole: 'super_admin', role: 'guest' }).db, 'ws-1', 'u-2')
    assert.equal(superAdmin.role, 'super_admin')
    const outsider = await clipReaderOf(dbAnswering({ email: 'out@rundesk.dev', platformRole: 'member', role: null }).db, 'ws-1', 'u-3')
    assert.equal(outsider.role, null)
    assert.deepEqual(await clipReaderOf(dbAnswering(undefined).db, 'ws-1', 'u-4'), { id: 'u-4', email: null, role: null })
  })
})
