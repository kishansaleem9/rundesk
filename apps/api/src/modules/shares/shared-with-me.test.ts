import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SharesService } from './shares.service'

/**
 * A1.7 — the reverse "everything shared with me" lookup. `object_shares` was
 * only ever read forwards (by a known object), so these lock in the three
 * things the new read has to get right: one batched query per object type,
 * a deep link per row, and silence about grants whose object has been deleted
 * (nothing cleans those up — `object_id` is polymorphic, so there is no FK).
 */

/**
 * Drizzle chain stub: every builder method returns the same thenable node, so
 * `select().from().innerJoin().where().orderBy()` resolves to the next queued
 * result set — one per `select()` call, in call order.
 */
function stubDb(results: unknown[][]) {
  let next = 0
  const node = (): any => {
    const self: any = {
      from: () => self,
      innerJoin: () => self,
      leftJoin: () => self,
      where: () => self,
      orderBy: () => self,
      limit: () => self,
      then: (resolve: any, reject: any) => Promise.resolve(results[next++] ?? []).then(resolve, reject),
    }
    return self
  }
  return { select: () => node() } as any
}

function service(db: any) {
  return new SharesService(db, {} as any, {} as any, {} as any)
}

describe('SharesService.listSharedWithMe', () => {
  it('hydrates each object type with a name, deep link and sharer', async () => {
    const now = new Date('2026-01-05T10:00:00Z')
    const db = stubDb([
      // the grants themselves, newest first
      [
        { id: 'sh-1', objectType: 'list', objectId: 'l-1', level: 'edit', createdAt: now, createdById: 'u-boss' },
        { id: 'sh-2', objectType: 'doc', objectId: 'd-1', level: 'view', createdAt: now, createdById: 'u-boss' },
      ],
      // list batch
      [{ id: 'l-1', name: 'Launch Lab', projectId: 'p-1', projectName: 'Apollo', spaceId: 's-1' }],
      // doc batch
      [{ id: 'd-1', title: 'Launch plan' }],
      // sharers
      [{ id: 'u-boss', name: 'Ada', avatarUrl: null }],
    ])

    const out = await service(db).listSharedWithMe('w-1', 'u-me')

    assert.equal(out.length, 2)
    assert.deepEqual(
      { name: out[0].name, url: out[0].url, context: out[0].context, level: out[0].level },
      { name: 'Launch Lab', url: '/app/w-1/s-1/p-1/l-1', context: 'Apollo', level: 'edit' },
    )
    assert.equal(out[0].sharedBy?.name, 'Ada')
    assert.equal(out[1].url, '/app/w-1/docs?doc=d-1')
  })

  it('deep-links a shared task straight into its list', async () => {
    const db = stubDb([
      [{ id: 'sh-1', objectType: 'task', objectId: 't-1', level: 'comment', createdAt: new Date(), createdById: null }],
      [{ id: 't-1', title: 'Ship it', listId: 'l-1', listName: 'Sprint 4', projectId: 'p-1', spaceId: 's-1' }],
    ])

    const [row] = await service(db).listSharedWithMe('w-1', 'u-me')

    assert.equal(row.url, '/app/w-1/s-1/p-1/l-1?task=t-1')
    assert.equal(row.context, 'Sprint 4')
    assert.equal(row.sharedBy, null, 'a grant from a deleted user still lists')
  })

  it('skips a grant whose object no longer exists', async () => {
    const db = stubDb([
      [{ id: 'sh-1', objectType: 'space', objectId: 's-gone', level: 'view', createdAt: new Date(), createdById: 'u-boss' }],
      [], // the space is gone
      [{ id: 'u-boss', name: 'Ada', avatarUrl: null }],
    ])

    assert.deepEqual(await service(db).listSharedWithMe('w-1', 'u-me'), [])
  })

  it('short-circuits without touching the object tables when nothing is shared', async () => {
    let selects = 0
    const inner = stubDb([[]])
    const db = { select: () => { selects++; return inner.select() } } as any

    assert.deepEqual(await service(db).listSharedWithMe('w-1', 'u-me'), [])
    assert.equal(selects, 1)
  })
})
