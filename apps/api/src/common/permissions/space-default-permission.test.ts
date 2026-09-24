import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveSpaceLevel } from './space-default-permission'

/**
 * The rows `resolveSpaceLevel` reads, in the order it reads them: the space,
 * the actor's workspace membership, a guest's shares on the items it is asked
 * about (only when `within` is given), their space membership, their share on
 * the space. Each query is answered by the next entry, whether it ends in
 * `.limit()` or is awaited at `.where()`.
 */
const dbQueue = (results: any[][]) => {
  const q = [...results]
  const next = async () => q.shift() ?? []
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => next(),
          then: (ok: (v: any[]) => unknown, no: (e: unknown) => unknown) => next().then(ok, no),
        }),
      }),
    }),
  } as any
}
const SPACE = { workspaceId: 'w1', defaultPermission: 'edit' }

describe('resolveSpaceLevel — a guest holds what is shared with them', () => {
  it('a guest with nothing shared holds view, whatever the space’s default', async () => {
    const db = dbQueue([[SPACE], [{ role: 'guest' }], [], []])
    assert.deepEqual(await resolveSpaceLevel(db, { spaceId: 's1', actorId: 'g1' }), { level: 'view', source: 'guest-default' })
  })

  it('a member with nothing granted holds the space’s default', async () => {
    const db = dbQueue([[{ ...SPACE, defaultPermission: 'comment' }], [{ role: 'member' }], [], []])
    assert.deepEqual(await resolveSpaceLevel(db, { spaceId: 's1', actorId: 'm1' }), { level: 'comment', source: 'space-default' })
  })

  it('a guest’s grant on the space is theirs', async () => {
    const db = dbQueue([[SPACE], [{ role: 'guest' }], [{ role: 'edit' }], []])
    assert.deepEqual(await resolveSpaceLevel(db, { spaceId: 's1', actorId: 'g1' }), { level: 'edit', source: 'space-member' })
  })

  it('a guest’s share on the item decides, the most specific first', async () => {
    const db = dbQueue([
      [SPACE],
      [{ role: 'guest' }],
      [
        { objectType: 'list', objectId: 'l1', level: 'comment' },
        { objectType: 'task', objectId: 't1', level: 'edit' },
      ],
    ])
    const within = [{ type: 'task' as const, id: 't1' }, { type: 'list' as const, id: 'l1' }]
    assert.deepEqual(await resolveSpaceLevel(db, { spaceId: 's1', actorId: 'g1', within }), { level: 'edit', source: 'item-share' })
  })
})
