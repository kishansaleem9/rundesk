import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import {
  callParticipants,
  calls as callsTable,
  chatChannelMembers,
  chatChannels,
  users as usersTable,
  workspaceMembers,
} from '@rundesk/db'
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
function fakeDb(
  seed: {
    calls?: Call[]
    participants?: Call[]
    channelMembers?: Call[]
    users?: Call[]
    channels?: Call[]
    /** Make one kind of insert blow up, to reach the guards around it. */
    failInsert?: (values: Record<string, unknown>) => boolean
  } = {},
) {
  const store = {
    calls: seed.calls ?? [],
    participants: seed.participants ?? [],
    channelMembers: seed.channelMembers ?? [{ id: 'cm1' }],
    members: [{ id: 'wm1' }],
    channels: seed.channels ?? [{ id: 'ch1', workspaceId: 'ws1', name: 'general' }],
    users: seed.users ?? [{ name: 'Hamda', email: 'h@example.com' }],
  }
  const updates: Array<Record<string, unknown>> = []
  const inserts: Array<{ values: Record<string, unknown>; conflict?: unknown }> = []

  // Dispatch on the TABLE, not on the projection.
  //
  // It used to guess from the projection's keys, which cannot tell two bare
  // `select()` calls apart — and the service makes two: the channel lookup and
  // the call lookup. Every announce test failed with "Channel not found"
  // because the channel read was answered from the calls store.
  let nextSelect: unknown[] | null = null
  const node = (rows: (self: Record<string, unknown>) => unknown[]): Record<string, unknown> => {
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
        if (!self.recorded) {
          self.recorded = true
          inserts.push({ values: self.pendingValues as Record<string, unknown> })
        }
        return self
      },
      onConflictDoUpdate: (c: unknown) => {
        inserts.push({ values: self.pendingValues as Record<string, unknown>, conflict: c })
        return self
      },
      returning: () => {
        // §2.8 gap 9 — the call card is a plain insert with no conflict clause,
        // so recording only on onConflict* made its values unreachable and a
        // test for it could not have failed.
        if (self.pendingValues && !self.recorded) {
          self.recorded = true
          inserts.push({ values: self.pendingValues as Record<string, unknown> })
        }
        return self
      },
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(rows(self)).then(res, rej),
    }
    return self
  }

  const db = {
    select: (proj?: Record<string, unknown>) =>
      node((self) => {
        if (nextSelect) {
          const v = nextSelect
          nextSelect = null
          return v
        }
        const keys = Object.keys(proj ?? {})
        // The one read that is a computed aggregate rather than a table dump.
        if (keys.includes('remaining')) {
          return [{ remaining: store.participants.filter((p) => !p.leftAt).length }]
        }
        switch (self.table) {
          case workspaceMembers:
            return store.members
          case chatChannelMembers:
            return store.channelMembers
          case chatChannels:
            return store.channels
          case callParticipants:
            return store.participants
          case usersTable:
            return store.users
          case callsTable:
            return store.calls
          default:
            return store.calls
        }
      }),
    // A genuinely DIFFERENT id. Spreading the existing call over it put
    // 'call1' back, so "did it start a second call?" could not fail — the
    // vacuous-test trap, in the fake rather than the assertion.
    //
    // The inserted values are echoed back, so a call started WITHOUT a channel
    // comes back without one. Hard-coding channelId here meant every insert
    // looked channel-bound, and "says nothing for a call with no channel"
    // could not fail either.
    insert: () =>
      node((self) => {
        const values = (self.pendingValues as Record<string, unknown>) ?? {}
        if (seed.failInsert?.(values)) throw new Error('insert failed')
        return [
        {
          workspaceId: 'ws1',
          endedAt: null,
          recording: false,
          ...values,
          id: 'new-call',
        },
        ]
      }),
    update: () => node(() => []),
    delete: () => node(() => []),
  }
  return { db, store, updates, inserts, setNextSelect: (rows: unknown[]) => (nextSelect = rows) }
}

const realtime = () => ({ emitToWorkspace: mock.fn(), emitToUser: mock.fn() })
/**
 * §2.8 gap 9 — the notifier the announce step writes through. `create` returns
 * a row so "was anybody told" is answerable; the default fake records nothing
 * else, and the tests that care build their own.
 */
const notifier = () => ({ create: mock.fn(async (n: Record<string, unknown>) => ({ id: 'n1', ...n })) })
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
    const svc = new CallsService(db as never, rt as never, meetings() as never, notifier() as never)

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
    const svc = new CallsService(db as never, realtime() as never, meetings() as never, notifier() as never)
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
    const svc = new CallsService(db as never, realtime() as never, meetings() as never, notifier() as never)
    await svc.join('call1', 'them')
    const joined = inserts.find((i) => i.values?.userId === 'them')
    assert.equal(joined?.values?.wasRecorded, true, 'a late joiner was not marked as recorded')
  })

  it('does not mark a joiner when nothing is being recorded', async () => {
    const { db, inserts } = fakeDb({ calls: [{ ...LIVE_CALL, recording: false }] })
    const svc = new CallsService(db as never, realtime() as never, meetings() as never, notifier() as never)
    await svc.join('call1', 'them')
    assert.equal(inserts.find((i) => i.values?.userId === 'them')?.values?.wasRecorded, false)
  })

  it('says nothing again when recording is already on', async () => {
    // A repeated announcement would train people to ignore it.
    const { db } = fakeDb({ calls: [{ ...LIVE_CALL, recording: true }] })
    const rt = realtime()
    const svc = new CallsService(db as never, rt as never, meetings() as never, notifier() as never)
    const result = await svc.setRecording('call1', 'me', true)
    assert.deepEqual(result, { ok: true, recording: true })
    assert.equal(rt.emitToWorkspace.mock.callCount(), 0, 'it announced recording twice')
  })

  it('refuses to record a call that has ended', async () => {
    const { db } = fakeDb({ calls: [{ ...LIVE_CALL, endedAt: new Date() }] })
    const svc = new CallsService(db as never, realtime() as never, meetings() as never, notifier() as never)
    await assert.rejects(() => svc.setRecording('call1', 'me', true), /has ended/i)
  })
})

describe('§2.8 starting a call', () => {
  it('joins the call already running here rather than starting a second', async () => {
    // Two people pressing the button together must land in the SAME call.
    // Two calls in one channel is the obvious failure and the hardest to
    // report: each person sees an empty room and assumes the feature is broken.
    const { db } = fakeDb({ calls: [{ ...LIVE_CALL }] })
    const svc = new CallsService(db as never, realtime() as never, meetings() as never, notifier() as never)
    const result = await svc.start('ws1', 'them', { channelId: 'ch1' })
    assert.equal((result as { id: string }).id, 'call1', 'a second call was started in one channel')
  })

  it('refuses a channel from another workspace', async () => {
    // Seeded as a real channel that belongs elsewhere. Overriding the next
    // select instead made the channel simply ABSENT, so this passed on
    // "no such channel" and would have passed with the workspace check deleted.
    const { db } = fakeDb({ calls: [], channels: [{ id: 'ch1', workspaceId: 'other-ws' }] })
    const svc = new CallsService(db as never, realtime() as never, meetings() as never, notifier() as never)
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
    const svc = new CallsService(db as never, realtime() as never, m as never, notifier() as never)
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
    const svc = new CallsService(db as never, realtime() as never, m as never, notifier() as never)
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
    const svc = new CallsService(db as never, realtime() as never, failing as never, notifier() as never)
    const result = await svc.end('call1', 'me')
    assert.equal(result.ok, true)
    assert.equal(result.meetingId, null)
  })
})

/**
 * §2.8 gap 9 — "aap ko notification aa raha hoga ke CALL ka option aaya… aap
 * chaho to wahan se direct call join ho jaoge" `[19:25]`.
 *
 * A call nobody is told about is a call nobody joins. Both halves fail
 * invisibly: a missing card looks like a quiet channel, and a missing
 * notification looks like nothing at all.
 */
describe('§2.8 a call announces itself to the channel', () => {
  const startInChannel = async (over: {
    members?: Call[]
    users?: Call[]
  } = {}) => {
    const { db, inserts } = fakeDb({
      calls: [],
      channelMembers: over.members ?? [{ userId: 'me' }, { userId: 'them' }, { userId: 'third' }],
      users: over.users,
    })
    const n = notifier()
    const svc = new CallsService(db as never, realtime() as never, meetings() as never, n as never)
    const call = await svc.start('ws1', 'me', { channelId: 'ch1' })
    return { call, inserts, notified: n.create.mock.calls.map((c) => c.arguments[0] as Record<string, any>) }
  }

  it('posts a card into the channel, pointing at the call', async () => {
    const { inserts, call } = await startInChannel()
    const card = inserts.find((i) => i.values?.callId && i.values?.channelId)
    assert.ok(card, 'the channel got no call card')
    assert.equal(card.values.channelId, 'ch1')
    assert.equal(card.values.callId, call.id, 'the card points at a different call')
  })

  it('gives the card readable words, not an empty message', async () => {
    // A client that knows nothing about call cards — a digest email, a search
    // result — renders `body`. An empty one would show as a blank message.
    const { inserts } = await startInChannel()
    const card = inserts.find((i) => i.values?.callId && i.values?.channelId)
    assert.match(String(card?.values.body ?? ''), /Hamda started a SyncUp/)
  })

  it('tells the channel members, and not the person who started it', async () => {
    const { notified } = await startInChannel()
    assert.deepEqual(
      notified.map((n) => n.userId),
      ['them', 'third'],
      'the starter was notified about their own call, or a member was missed',
    )
    assert.equal(notified[0].type, 'call_started')
    assert.equal(notified[0].actorId, 'me')
  })

  it('links straight to the channel, where the Join button is', async () => {
    // "wahan se direct call join ho jaoge" — a notification you have to go
    // looking from is not a direct join.
    const { notified } = await startInChannel()
    assert.equal(notified[0].target.url, '/app/ws1/chat?channel=ch1')
    assert.equal(notified[0].target.entityType, 'call')
  })

  it('names the channel, so three of these are tellable apart', async () => {
    const { notified } = await startInChannel()
    assert.match(String(notified[0].body ?? ''), /#general/)
  })

  it('falls back to an email when someone has no display name', async () => {
    const { notified } = await startInChannel({ users: [{ name: '  ', email: 'h@example.com' }] })
    assert.match(notified[0].title, /h@example\.com/)
  })

  it('starts the call even when the card cannot be written', async () => {
    // Getting into your own call matters more than the announcement landing.
    //
    // The card write is the right place to break this: every notification is
    // already caught one at a time, so an exploding notifier never reaches the
    // guard around announce() and a test built on one passes either way.
    const { db } = fakeDb({
      calls: [],
      channelMembers: [{ userId: 'them' }],
      // The CARD specifically: the calls row carries a channelId too, and
      // failing that one broke the call itself rather than the announcement.
      failInsert: (v) => !!v.channelId && !!v.authorId,
    })
    const n = notifier()
    const svc = new CallsService(db as never, realtime() as never, meetings() as never, n as never)
    const call = await svc.start('ws1', 'me', { channelId: 'ch1' })
    assert.ok(call?.id, 'a failed card write stopped the call from starting')
  })

  it('starts the call even when nobody can be notified', async () => {
    const { db } = fakeDb({ calls: [], channelMembers: [{ userId: 'them' }] })
    const exploding = {
      create: mock.fn(async () => {
        throw new Error('notifications are down')
      }),
    }
    const svc = new CallsService(
      db as never,
      realtime() as never,
      meetings() as never,
      exploding as never,
    )
    const call = await svc.start('ws1', 'me', { channelId: 'ch1' })
    assert.ok(call?.id, 'a failing notifier stopped the call from starting')
  })

  it('says nothing for a call with no channel', async () => {
    // A workspace-level call has no channel to post into and no membership to
    // notify — announcing it would mean picking somebody arbitrarily.
    const { db, inserts } = fakeDb({ calls: [], channelMembers: [{ userId: 'them' }] })
    const n = notifier()
    const svc = new CallsService(db as never, realtime() as never, meetings() as never, n as never)
    await svc.start('ws1', 'me', {})
    assert.equal(n.create.mock.callCount(), 0, 'a channel-less call notified somebody anyway')
    assert.equal(
      inserts.filter((i) => i.values?.channelId).length,
      0,
      'a channel-less call posted a card into a channel',
    )
  })
})
