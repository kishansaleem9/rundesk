import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { CallsService } from './calls.service'

/**
 * §2.8 SyncUp.
 *
 * Two things here fail silently and matter enormously. Recording someone
 * without them being told is the first, and it is a legal problem in
 * two-party-consent jurisdictions rather than a UX one. The second is quieter:
 * two people pressing "start a call" at the same moment landing in two
 * different calls, each wondering why the other never appeared.
 */

type Call = Record<string, unknown>

/**
 * A recording query builder over an in-memory store. Enough to run the service
 * for real; the SQL itself is exercised against Postgres in the harness.
 */
function fakeDb(seed: { calls?: Call[]; participants?: Call[]; channelMembers?: Call[] } = {}) {
  const store = {
    calls: seed.calls ?? [],
    participants: seed.participants ?? [],
    channelMembers: seed.channelMembers ?? [{ id: 'cm1' }],
    members: [{ id: 'wm1' }],
    channels: [{ id: 'ch1', workspaceId: 'ws1' }],
  }
  const updates: Array<Record<string, unknown>> = []
  const inserts: Array<{ values: Record<string, unknown>; conflict?: unknown }> = []

  // Which table a select is against is decided by what it is asked for; the
  // service's reads are distinct enough for that to be unambiguous.
  let nextSelect: unknown[] | null = null
  const node = (rows: () => unknown[]): Record<string, unknown> => {
    const self: Record<string, unknown> = {
      from: (t: unknown) => ((self.table = t), self),
      innerJoin: () => self,
      where: () => self,
      orderBy: () => self,
      limit: () => self,
      values: (v: Record<string, unknown>) => {
        self.pendingValues = v
        return self
      },
      set: (v: Record<string, unknown>) => (updates.push(v), self),
      onConflictDoNothing: () => {
        inserts.push({ values: self.pendingValues as Record<string, unknown> })
        return self
      },
      onConflictDoUpdate: (c: unknown) => {
        inserts.push({ values: self.pendingValues as Record<string, unknown>, conflict: c })
        return self
      },
      returning: () => self,
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(rows()).then(res, rej),
    }
    return self
  }

  const db = {
    select: (proj?: Record<string, unknown>) =>
      node(() => {
        if (nextSelect) {
          const v = nextSelect
          nextSelect = null
          return v
        }
        const keys = Object.keys(proj ?? {})
        if (keys.includes('remaining')) {
          return [{ remaining: store.participants.filter((p) => !p.leftAt).length }]
        }
        if (keys.length === 1 && keys[0] === 'id') return store.members
        if (keys.includes('wasRecorded')) return store.participants
        return store.calls
      }),
    // A genuinely DIFFERENT id. Spreading the existing call over it put
    // 'call1' back, so "did it start a second call?" could not fail — the
    // vacuous-test trap, in the fake rather than the assertion.
    insert: () =>
      node(() => [
        { ...(store.calls[0] ?? {}), id: 'new-call', workspaceId: 'ws1', channelId: 'ch1', endedAt: null },
      ]),
    update: () => node(() => []),
    delete: () => node(() => []),
  }
  return { db, store, updates, inserts, setNextSelect: (rows: unknown[]) => (nextSelect = rows) }
}

const realtime = () => ({ emitToWorkspace: mock.fn(), emitToUser: mock.fn() })
// Typed with the real signature so `arguments[2]` — the body the service
// hands it — is reachable from the assertions rather than an empty tuple.
const meetings = () => ({
  create: mock.fn(
    async (_workspaceId: string, _userId: string, _body: Record<string, unknown>) => ({
      id: 'meeting-1',
    }),
  ),
})

const LIVE_CALL = {
  id: 'call1',
  workspaceId: 'ws1',
  channelId: 'ch1',
  startedById: 'me',
  startedAt: new Date('2026-08-26T10:00:00Z'),
  endedAt: null,
  recording: false,
  recordingStartedAt: null,
  meetingId: null,
}

describe('§2.8 recording announces itself', () => {
  it('tells everyone in the same breath as it starts', async () => {
    // The whole point. There must be no moment in which recording is on and
    // the room has not been told — so the flag and the event are one action,
    // and a test that only checked the flag would miss the half that matters.
    const { db } = fakeDb({ calls: [{ ...LIVE_CALL }], participants: [{ userId: 'me' }] })
    const rt = realtime()
    const svc = new CallsService(db as never, rt as never, meetings() as never)

    await svc.setRecording('call1', 'me', true)

    const events = rt.emitToWorkspace.mock.calls.map((c) => c.arguments[1] as Record<string, unknown>)
    const announced = events.find((e) => e.type === 'call.recording')
    assert.ok(announced, 'recording started without telling the room')
    assert.equal(announced.recording, true)
    assert.equal(announced.callId, 'call1')
    assert.equal(announced.byUserId, 'me', 'the announcement does not say who started it')
  })

  it('marks everyone present as recorded, not just the person who pressed it', async () => {
    const { db, updates } = fakeDb({ calls: [{ ...LIVE_CALL }] })
    const svc = new CallsService(db as never, realtime() as never, meetings() as never)
    await svc.setRecording('call1', 'me', true)
    assert.ok(
      updates.some((u) => u.wasRecorded === true),
      'nobody was marked as recorded, so "was I on that recording" has no answer',
    )
  })

  it('marks someone who joins a call that is ALREADY recording', async () => {
    // The gap that would otherwise leave a late arrival believing they were
    // not on the tape.
    const { db, inserts } = fakeDb({ calls: [{ ...LIVE_CALL, recording: true }] })
    const svc = new CallsService(db as never, realtime() as never, meetings() as never)
    await svc.join('call1', 'them')
    const joined = inserts.find((i) => i.values?.userId === 'them')
    assert.equal(joined?.values?.wasRecorded, true, 'a late joiner was not marked as recorded')
  })

  it('does not mark a joiner when nothing is being recorded', async () => {
    const { db, inserts } = fakeDb({ calls: [{ ...LIVE_CALL, recording: false }] })
    const svc = new CallsService(db as never, realtime() as never, meetings() as never)
    await svc.join('call1', 'them')
    assert.equal(inserts.find((i) => i.values?.userId === 'them')?.values?.wasRecorded, false)
  })

  it('says nothing again when recording is already on', async () => {
    // A repeated announcement would train people to ignore it.
    const { db } = fakeDb({ calls: [{ ...LIVE_CALL, recording: true }] })
    const rt = realtime()
    const svc = new CallsService(db as never, rt as never, meetings() as never)
    const result = await svc.setRecording('call1', 'me', true)
    assert.deepEqual(result, { ok: true, recording: true })
    assert.equal(rt.emitToWorkspace.mock.callCount(), 0, 'it announced recording twice')
  })

  it('refuses to record a call that has ended', async () => {
    const { db } = fakeDb({ calls: [{ ...LIVE_CALL, endedAt: new Date() }] })
    const svc = new CallsService(db as never, realtime() as never, meetings() as never)
    await assert.rejects(() => svc.setRecording('call1', 'me', true), /has ended/i)
  })
})

describe('§2.8 starting a call', () => {
  it('joins the call already running here rather than starting a second', async () => {
    // Two people pressing the button together must land in the SAME call.
    // Two calls in one channel is the obvious failure and the hardest to
    // report: each person sees an empty room and assumes the feature is broken.
    const { db } = fakeDb({ calls: [{ ...LIVE_CALL }] })
    const svc = new CallsService(db as never, realtime() as never, meetings() as never)
    const result = await svc.start('ws1', 'them', { channelId: 'ch1' })
    assert.equal((result as { id: string }).id, 'call1', 'a second call was started in one channel')
  })

  it('refuses a channel from another workspace', async () => {
    const { db, setNextSelect } = fakeDb({ calls: [] })
    setNextSelect([{ id: 'ch1', workspaceId: 'other-ws' }])
    const svc = new CallsService(db as never, realtime() as never, meetings() as never)
    await assert.rejects(() => svc.start('ws1', 'me', { channelId: 'ch1' }), /not found/i)
  })
})

describe('§2.8 ending a call', () => {
  it('leaves a meeting record behind, with everyone who was there', async () => {
    // The record is what makes a call findable next week. Written server-side
    // so a browser closed as the call ends does not take it with it.
    const { db } = fakeDb({
      calls: [{ ...LIVE_CALL }],
      participants: [
        { userId: 'me', leftAt: null },
        { userId: 'them', leftAt: null },
      ],
    })
    const m = meetings()
    const svc = new CallsService(db as never, realtime() as never, m as never)
    const result = await svc.end('call1', 'me')

    assert.equal(result.meetingId, 'meeting-1')
    const created = m.create.mock.calls[0]?.arguments[2] ?? {}
    assert.deepEqual(created.attendeeIds, ['me', 'them'], 'the record lost who was there')
    assert.ok(created.startsAt, 'the record has no start time')
    assert.ok(created.endsAt, 'the record has no end time')
  })

  it('does not end an already-ended call twice', async () => {
    const { db } = fakeDb({ calls: [{ ...LIVE_CALL, endedAt: new Date(), meetingId: 'meeting-1' }] })
    const m = meetings()
    const svc = new CallsService(db as never, realtime() as never, m as never)
    const result = await svc.end('call1', 'me')
    assert.equal(result.meetingId, 'meeting-1')
    assert.equal(m.create.mock.callCount(), 0, 'ending twice created a second meeting record')
  })

  it('still ends the call when the meeting record cannot be written', async () => {
    // A failed record must not leave the call stuck "live" forever, offering
    // a Join button into an empty room.
    const { db } = fakeDb({ calls: [{ ...LIVE_CALL }], participants: [{ userId: 'me' }] })
    const failing = {
      create: mock.fn(async (_w: string, _u: string, _b: Record<string, unknown>) => {
        throw new Error('nope')
      }),
    }
    const svc = new CallsService(db as never, realtime() as never, failing as never)
    const result = await svc.end('call1', 'me')
    assert.equal(result.ok, true)
    assert.equal(result.meetingId, null)
  })
})
