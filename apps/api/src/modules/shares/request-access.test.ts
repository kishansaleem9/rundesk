import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SharesService } from './shares.service'

/** Thenable Drizzle chain resolving to the given rows. */
const chain = (rows: any[]): any => ({
  from: () => chain(rows),
  where: () => chain(rows),
  limit: () => chain(rows),
  leftJoin: () => chain(rows),
  innerJoin: () => chain(rows),
  orderBy: () => chain(rows),
  then: (res: (v: any) => any, rej: (e: any) => any) => Promise.resolve(rows).then(res, rej),
  catch: (rej: (e: any) => any) => Promise.resolve(rows).catch(rej),
})

/**
 * Selects answer in order: object admins, workspace admins, a recent ask, then
 * whatever `resolveSharedBatch` needs for the title and link.
 *
 * Inserts are recorded rather than swallowed. The ask itself is what the
 * once-a-day rule reads, so a fake that dropped it would let a test pass while
 * the record that rule depends on never happened — the exact hole the
 * feature-flag flow documented.
 */
const dbWithSelects = (queue: any[][]) => {
  let i = 0
  const inserted: any[] = []
  return {
    select: () => chain(queue[i++] ?? []),
    insert: () => ({ values: (v: any) => (inserted.push(v), chain([])) }),
    inserted,
  } as any
}

const notifier = () => {
  const sent: any[] = []
  return {
    sent,
    createWithOutcome: async (d: any) => (sent.push(d), { row: { id: 'n' }, delivered: true }),
  }
}

const svcWith = (db: any, n: any) =>
  new SharesService(db, {} as any, {} as any, { get: () => undefined } as any, n as any)

const ME = { id: 'u1', name: 'Hamda', email: 'hamda@example.com' }

/**
 * §G10 [12:16–12:20] — "someone asked for access to something".
 *
 * The `access_requested` kind has existed since the enum was written and was
 * only ever emitted for FEATURE requests. Somebody who hit a doc, list or space
 * they could not see had no way to ask for it: the wall was the end of the road.
 */
describe('§G10 asking for access to content', () => {
  it('tells the people who can actually grant it, and not the asker', async () => {
    const n = notifier()
    const objectAdmins = [{ userId: 'owner1' }]
    const wsAdmins = [{ userId: 'admin1' }, { userId: 'u1' }]
    const db = dbWithSelects([objectAdmins, wsAdmins, [], []])
    const out = await svcWith(db, n).requestAccess('ws1', 'doc', 'doc1', ME)

    assert.equal(out.status, 'sent')
    assert.deepEqual(n.sent.map((x) => x.userId).sort(), ['admin1', 'owner1'])
    assert.ok(!n.sent.some((x) => x.userId === 'u1'), 'told the person who was asking')
    assert.match(n.sent[0].title, /Hamda/, 'used a raw id instead of a name')
    assert.equal(n.sent[0].type, 'access_requested')
    assert.equal(n.sent[0].target.entityId, 'doc1')
    assert.equal(n.sent[0].actorId, 'u1')

    // The ask is written down in its own right — the once-a-day rule reads this.
    assert.deepEqual(
      db.inserted.map((r: any) => [r.workspaceId, r.objectType, r.objectId, r.requesterId]),
      [['ws1', 'doc', 'doc1', 'u1']],
      'the ask itself was never recorded',
    )
  })

  it('does not drum-roll: a second ask the same day sends nothing', async () => {
    const n = notifier()
    const db = dbWithSelects([[{ userId: 'owner1' }], [], [{ id: 'already' }], []])
    const out = await svcWith(db, n).requestAccess('ws1', 'doc', 'doc1', ME)
    assert.equal(out.status, 'already_asked')
    assert.equal(n.sent.length, 0, 'a repeat press notified the owner again')
    assert.equal(db.inserted.length, 0, 'a repeat press was recorded as a fresh ask')
  })

  it('says so when nobody can grant it', async () => {
    const n = notifier()
    // Only the asker holds anything — telling them is not an option.
    const db = dbWithSelects([[{ userId: 'u1' }], [{ userId: 'u1' }], [], []])
    const out = await svcWith(db, n).requestAccess('ws1', 'doc', 'doc1', ME)
    assert.equal(out.status, 'no_owners')
    assert.equal(n.sent.length, 0)
  })

  it('counts who was told, not how many rows were written', async () => {
    /*
     * createWithOutcome returns delivered:false when every channel is muted.
     * Counting rows told the asker "nobody was told" while an email-only owner
     * had the mail — the bug the feature-flag flow hit and documented.
     */
    const muted = { createWithOutcome: async () => ({ row: null, delivered: false }) }
    const db = dbWithSelects([[{ userId: 'owner1' }], [], [], []])
    const out = await svcWith(db, muted as any).requestAccess('ws1', 'doc', 'doc1', ME)
    assert.equal(out.status, 'sent')
    assert.equal(out.notified, 0, 'reported reaching an owner who was never told')
  })

  it('refuses a type that cannot be shared', async () => {
    const db = dbWithSelects([[], [], [], []])
    await assert.rejects(
      () => svcWith(db, notifier()).requestAccess('ws1', 'wormhole' as any, 'x', ME),
      /unknown object type/i,
    )
  })
})
