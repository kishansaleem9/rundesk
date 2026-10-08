import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ACCESS_ASKS_PER_HOUR, NOTHING_TO_ASK_FOR, SharesService, TOO_MANY_ASKS } from './shares.service'

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
 * Selects answer in order: the object itself (`resolveSharedBatch`, its title
 * and link), object admins, workspace admins, a recent ask of the same object,
 * then how many the asker has made in the hour.
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
const WS = '11111111-1111-4111-8111-111111111111'
const DOC = '22222222-2222-4222-8222-222222222222'
/** The doc, as the workspace holds it. */
const THE_DOC = [{ id: DOC, title: 'Roadmap' }]
/** The asker's asks in the last hour. */
const askedThisHour = (n: number) => [{ n }]

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
    const db = dbWithSelects([THE_DOC, objectAdmins, wsAdmins, [], askedThisHour(0)])
    const out = await svcWith(db, n).requestAccess(WS, 'doc', DOC, ME)

    assert.equal(out.status, 'sent')
    assert.deepEqual(n.sent.map((x) => x.userId).sort(), ['admin1', 'owner1'])
    assert.ok(!n.sent.some((x) => x.userId === 'u1'), 'told the person who was asking')
    assert.match(n.sent[0].title, /Hamda/, 'used a raw id instead of a name')
    assert.equal(n.sent[0].type, 'access_requested')
    assert.equal(n.sent[0].target.entityId, DOC)
    assert.equal(n.sent[0].actorId, 'u1')

    // The ask is written down in its own right — the once-a-day rule reads this.
    assert.deepEqual(
      db.inserted.map((r: any) => [r.workspaceId, r.objectType, r.objectId, r.requesterId]),
      [[WS, 'doc', DOC, 'u1']],
      'the ask itself was never recorded',
    )
  })

  it('does not drum-roll: a second ask the same day sends nothing', async () => {
    const n = notifier()
    const db = dbWithSelects([THE_DOC, [{ userId: 'owner1' }], [], [{ id: 'already' }], askedThisHour(ACCESS_ASKS_PER_HOUR)])
    const out = await svcWith(db, n).requestAccess(WS, 'doc', DOC, ME)
    assert.equal(out.status, 'already_asked')
    assert.equal(n.sent.length, 0, 'a repeat press notified the owner again')
    assert.equal(db.inserted.length, 0, 'a repeat press was recorded as a fresh ask')
  })

  it('says so when nobody can grant it', async () => {
    const n = notifier()
    // Only the asker holds anything — telling them is not an option.
    const db = dbWithSelects([THE_DOC, [{ userId: 'u1' }], [{ userId: 'u1' }], [], askedThisHour(0)])
    const out = await svcWith(db, n).requestAccess(WS, 'doc', DOC, ME)
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
    const db = dbWithSelects([THE_DOC, [{ userId: 'owner1' }], [], [], askedThisHour(0)])
    const out = await svcWith(db, muted as any).requestAccess(WS, 'doc', DOC, ME)
    assert.equal(out.status, 'sent')
    assert.equal(out.notified, 0, 'reported reaching an owner who was never told')
  })

  it('refuses a type that cannot be shared', async () => {
    const db = dbWithSelects([[], [], [], []])
    await assert.rejects(
      () => svcWith(db, notifier()).requestAccess(WS, 'wormhole' as any, DOC, ME),
      /unknown object type/i,
    )
  })

  /*
   * ONLY ABOUT SOMETHING THE NAMED WORKSPACE HOLDS (`found-30-sep/access-asks-from-outside-the-workspace`).
   * Measured on lane 3: an account in no part of a workspace asked about a
   * made-up id there, another workspace's task named under it, and ids under a
   * made-up workspace; every ask was recorded, and the answers, "sent" or
   * "no_owners", told whether the workspace was real.
   */
  it('answers an id the named workspace does not hold, or no id at all, with one 404, recording nothing and telling nobody', async () => {
    const cases: Array<[string, string, string]> = [
      ['an object the workspace does not hold', WS, DOC],
      ['a workspace id that is not an id', 'ws1', DOC],
      ['an object id that is not an id', WS, 'doc1'],
    ]
    for (const [why, workspaceId, objectId] of cases) {
      const n = notifier()
      const db = dbWithSelects([[], [{ userId: 'owner1' }], [{ userId: 'admin1' }], [], askedThisHour(0)])
      await assert.rejects(
        () => svcWith(db, n).requestAccess(workspaceId, 'doc', objectId, ME),
        (err: any) => err?.status === 404 && err?.message === NOTHING_TO_ASK_FOR,
        `${why}: not refused in the one sentence`,
      )
      assert.equal(db.inserted.length, 0, `${why}: the ask was recorded`)
      assert.equal(n.sent.length, 0, `${why}: somebody was told`)
    }
  })

  it('refuses an asker their next ask once they have made an hour’s worth, telling nobody; the same object again is still “already asked”', async () => {
    const n = notifier()
    const capped = dbWithSelects([THE_DOC, [{ userId: 'owner1' }], [], [], askedThisHour(ACCESS_ASKS_PER_HOUR)])
    await assert.rejects(
      () => svcWith(capped, n).requestAccess(WS, 'doc', DOC, ME),
      (err: any) => err?.status === 429 && err?.message === TOO_MANY_ASKS,
      'an ask past the hour’s cap was not refused',
    )
    assert.equal(capped.inserted.length, 0, 'an ask past the cap was recorded')
    assert.equal(n.sent.length, 0, 'an ask past the cap told somebody')
    const under = dbWithSelects([THE_DOC, [{ userId: 'owner1' }], [], [], askedThisHour(ACCESS_ASKS_PER_HOUR - 1)])
    assert.equal((await svcWith(under, notifier()).requestAccess(WS, 'doc', DOC, ME)).status, 'sent', 'the last ask under the cap was refused')
  })
})
