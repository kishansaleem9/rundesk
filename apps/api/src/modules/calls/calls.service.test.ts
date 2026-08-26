import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import {
  callParticipants,
  callTranscriptLines,
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
    /** §2.8 gap 10 — lines already said in this call. */
    transcript?: Call[]
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
    transcript: seed.transcript ?? [],
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
        // Recorded HERE, not in returning()/onConflict*. An insert that wants
        // neither — appendTranscript is one — is still an insert, and
        // recording only on the tail meant its values were unreachable and a
        // test for them could not have failed.
        if (!self.recorded) {
          self.recorded = true
          inserts.push({ values: v })
        }
        return self
      },
      set: (v: Record<string, unknown>) => (updates.push(v), self),
      onConflictDoNothing: () => self,
      onConflictDoUpdate: (c: unknown) => {
        const last = inserts[inserts.length - 1]
        if (last && last.values === self.pendingValues) last.conflict = c
        return self
      },
      returning: () => self,
      // A drizzle query builder is a QueryPromise: it has catch and finally as
      // well as then. Modelling only `then` made `.where(...).catch(...)` — a
      // shape the service genuinely uses — blow up in the fake and nowhere else.
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve().then(() => rows(self)).then(res, rej),
      catch: (rej: (e: unknown) => unknown) =>
        Promise.resolve().then(() => rows(self)).catch(rej),
      finally: (fn: () => void) => Promise.resolve().then(() => rows(self)).finally(fn),
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
          case callTranscriptLines:
            return store.transcript
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
/** §2.8 gap 10 — writes the notes; unavailable unless a test says otherwise. */
const ai = () => ({
  isAvailable: () => true,
  notesFromTranscript: mock.fn(async (t: string) => `## Summary\nNotes from: ${t.slice(0, 40)}`),
})
/** §2.8 gap 11 — the entitlement, enforced server-side. On unless a test says otherwise. */
const flags = (enabled = true) => ({ isEnabled: mock.fn(async () => enabled) })

/** Storage. `configured: false` is the default an instance without R2 has. */
const storage = () => ({
  configured: true,
  presignPutObject: mock.fn(async (key: string) => `https://r2.example/${key}`),
  getObjectUrl: mock.fn(async (key: string) => `https://r2.example/read/${key}`),
})

/**
 * Build the service.
 *
 * Every dependency added to CallsService used to mean editing twenty
 * constructor calls in this file, which is how a test file ends up shaped by
 * the wiring instead of by what it is checking.
 */
function makeService(over: {
  db: unknown
  realtime?: unknown
  meetings?: unknown
  notifications?: unknown
  ai?: unknown
  r2?: unknown
  flags?: unknown
}) {
  return new CallsService(
    over.db as never,
    (over.realtime ?? realtime()) as never,
    (over.meetings ?? meetings()) as never,
    (over.notifications ?? notifier()) as never,
    (over.ai ?? ai()) as never,
    (over.r2 ?? storage()) as never,
    (over.flags ?? flags()) as never,
  )
}
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
    const svc = makeService({ db, realtime: rt })

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
    const svc = makeService({ db })
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
    const svc = makeService({ db })
    await svc.join('call1', 'them')
    const joined = inserts.find((i) => i.values?.userId === 'them')
    assert.equal(joined?.values?.wasRecorded, true, 'a late joiner was not marked as recorded')
  })

  it('does not mark a joiner when nothing is being recorded', async () => {
    const { db, inserts } = fakeDb({ calls: [{ ...LIVE_CALL, recording: false }] })
    const svc = makeService({ db })
    await svc.join('call1', 'them')
    assert.equal(inserts.find((i) => i.values?.userId === 'them')?.values?.wasRecorded, false)
  })

  it('says nothing again when recording is already on', async () => {
    // A repeated announcement would train people to ignore it.
    const { db } = fakeDb({ calls: [{ ...LIVE_CALL, recording: true }] })
    const rt = realtime()
    const svc = makeService({ db, realtime: rt })
    const result = await svc.setRecording('call1', 'me', true)
    assert.deepEqual(result, { ok: true, recording: true })
    assert.equal(rt.emitToWorkspace.mock.callCount(), 0, 'it announced recording twice')
  })

  it('refuses to record a call that has ended', async () => {
    const { db } = fakeDb({ calls: [{ ...LIVE_CALL, endedAt: new Date() }] })
    const svc = makeService({ db })
    await assert.rejects(() => svc.setRecording('call1', 'me', true), /has ended/i)
  })
})

describe('§2.8 starting a call', () => {
  it('joins the call already running here rather than starting a second', async () => {
    // Two people pressing the button together must land in the SAME call.
    // Two calls in one channel is the obvious failure and the hardest to
    // report: each person sees an empty room and assumes the feature is broken.
    const { db } = fakeDb({ calls: [{ ...LIVE_CALL }] })
    const svc = makeService({ db })
    const result = await svc.start('ws1', 'them', { channelId: 'ch1' })
    assert.equal((result as { id: string }).id, 'call1', 'a second call was started in one channel')
  })

  it('refuses a channel from another workspace', async () => {
    // Seeded as a real channel that belongs elsewhere. Overriding the next
    // select instead made the channel simply ABSENT, so this passed on
    // "no such channel" and would have passed with the workspace check deleted.
    const { db } = fakeDb({ calls: [], channels: [{ id: 'ch1', workspaceId: 'other-ws' }] })
    const svc = makeService({ db })
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
    const svc = makeService({ db, meetings: m })
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
    const svc = makeService({ db, meetings: m })
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
    const svc = makeService({ db, meetings: failing })
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
    const svc = makeService({ db, notifications: n })
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
    const svc = makeService({ db, notifications: n })
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
    const svc = makeService({ db, notifications: exploding })
    const call = await svc.start('ws1', 'me', { channelId: 'ch1' })
    assert.ok(call?.id, 'a failing notifier stopped the call from starting')
  })

  it('says nothing for a call with no channel', async () => {
    // A workspace-level call has no channel to post into and no membership to
    // notify — announcing it would mean picking somebody arbitrarily.
    const { db, inserts } = fakeDb({ calls: [], channelMembers: [{ userId: 'them' }] })
    const n = notifier()
    const svc = makeService({ db, notifications: n })
    await svc.start('ws1', 'me', {})
    assert.equal(n.create.mock.callCount(), 0, 'a channel-less call notified somebody anyway')
    assert.equal(
      inserts.filter((i) => i.values?.channelId).length,
      0,
      'a channel-less call posted a card into a channel',
    )
  })
})

/**
 * §2.8 gap 10 — AI Notes.
 *
 *   "main record karoongi aur yeh aap ke khud hi NOTES bana ke dega aur poori
 *   ki poori RECORDING bhi karega — poori call hi ki."  `[20:42]`
 *
 * The consent rule is the one that matters most here and it is the easiest to
 * get subtly wrong: nothing may be kept while the recording banner is down.
 * A client that keeps sending after recording stops must get a no.
 */
describe('§2.8 nothing is transcribed while the banner is down', () => {
  it('keeps a line when recording is on', async () => {
    const { db, inserts } = fakeDb({ calls: [{ ...LIVE_CALL, recording: true }] })
    const svc = makeService({ db })
    const out = await svc.appendTranscript('call1', 'me', 'we should ship on Friday')
    assert.equal(out.ok, true)
    const line = inserts.find((i) => i.values?.text)
    assert.equal(line?.values.text, 'we should ship on Friday')
    assert.equal(line?.values.userId, 'me', 'the line lost who said it')
  })

  it('refuses when recording is OFF — the whole consent story', async () => {
    // The banner everyone can see is what makes keeping any of this lawful.
    // Recording a call that is not announced as being recorded is the exact
    // thing the consent gate exists to prevent.
    const { db, inserts } = fakeDb({ calls: [{ ...LIVE_CALL, recording: false }] })
    const svc = makeService({ db })
    const out = await svc.appendTranscript('call1', 'me', 'something confidential')
    assert.equal(out.ok, false)
    assert.equal((out as { reason: string }).reason, 'not_recording')
    assert.equal(inserts.filter((i) => i.values?.text).length, 0, 'it was written down anyway')
  })

  it('refuses after the call has ended', async () => {
    const { db } = fakeDb({ calls: [{ ...LIVE_CALL, recording: true, endedAt: new Date() }] })
    const svc = makeService({ db })
    const out = await svc.appendTranscript('call1', 'me', 'hello?')
    assert.equal((out as { reason: string }).reason, 'ended')
  })

  it('ignores an empty line rather than storing whitespace', async () => {
    const { db, inserts } = fakeDb({ calls: [{ ...LIVE_CALL, recording: true }] })
    const svc = makeService({ db })
    assert.equal((await svc.appendTranscript('call1', 'me', '   ')).ok, false)
    assert.equal(inserts.filter((i) => i.values?.text).length, 0)
  })

  it('REPLACES the speaker\'s last line when the browser says it is a revision', async () => {
    // "we should ship" becoming "we should ship on Friday" is one sentence.
    // Stored as two, the notes report two commitments.
    const { db, updates, inserts } = fakeDb({
      calls: [{ ...LIVE_CALL, recording: true }],
      transcript: [{ id: 'l1', userId: 'me', text: 'we should ship' }],
    })
    const out = await makeService({ db }).appendTranscript('call1', 'me', 'we should ship on Friday', true)
    assert.equal(out.ok, true)
    assert.ok(
      updates.some((u) => u.text === 'we should ship on Friday'),
      'the revision did not replace the partial line',
    )
    assert.equal(
      inserts.filter((i) => i.values?.text).length,
      0,
      'the revision was appended as well as replacing — the transcript now says it twice',
    )
  })

  it('appends when it is a revision but the speaker has said nothing yet', async () => {
    const { db, inserts } = fakeDb({ calls: [{ ...LIVE_CALL, recording: true }], transcript: [] })
    await makeService({ db }).appendTranscript('call1', 'me', 'first thing', true)
    assert.equal(inserts.filter((i) => i.values?.text).length, 1, 'a first line was lost')
  })

  it('appends, not replaces, when the browser does not say it is a revision', async () => {
    const { db, updates, inserts } = fakeDb({
      calls: [{ ...LIVE_CALL, recording: true }],
      transcript: [{ id: 'l1', userId: 'me', text: 'we should ship' }],
    })
    await makeService({ db }).appendTranscript('call1', 'me', 'and update the docs')
    assert.equal(inserts.filter((i) => i.values?.text).length, 1)
    assert.equal(updates.some((u) => u.text), false, 'a new sentence overwrote the previous one')
  })

  it('caps a line, so one client cannot post a novel', async () => {
    const { db, inserts } = fakeDb({ calls: [{ ...LIVE_CALL, recording: true }] })
    const svc = makeService({ db })
    await svc.appendTranscript('call1', 'me', 'x'.repeat(9000))
    assert.equal(String(inserts.find((i) => i.values?.text)?.values.text).length, 2000)
  })
})

describe('§2.8 the notes are written from what was said', () => {
  const said = [
    { text: 'we should ship on Friday', saidAt: new Date('2026-08-26T10:00:01Z'), name: 'Hamda', email: 'h@x' },
    { text: 'I will send the deck', saidAt: new Date('2026-08-26T10:00:09Z'), name: null, email: 'leo@x' },
  ]

  it('attributes every line, in the order it was said', async () => {
    // Attribution is the whole reason this is a table. "Somebody said they
    // would send the deck" is not a note worth having.
    const { db } = fakeDb({ calls: [{ ...LIVE_CALL }], transcript: said })
    const svc = makeService({ db })
    const transcript = await svc.transcriptFor('call1')
    assert.equal(transcript, 'Hamda: we should ship on Friday\nleo@x: I will send the deck')
  })

  it('is empty when nothing was said, rather than a header with nothing under it', async () => {
    const { db } = fakeDb({ calls: [{ ...LIVE_CALL }], transcript: [] })
    assert.equal(await makeService({ db }).transcriptFor('call1'), '')
  })

  it('hands the transcript to the model when the call ends', async () => {
    const { db } = fakeDb({
      calls: [{ ...LIVE_CALL }],
      participants: [{ userId: 'me', leftAt: null }],
      transcript: said,
    })
    const brain = ai()
    const m = meetings()
    await makeService({ db, ai: brain, meetings: m }).end('call1', 'me')

    assert.equal(brain.notesFromTranscript.mock.callCount(), 1, 'the notes were never written')
    assert.match(String(brain.notesFromTranscript.mock.calls[0].arguments[0]), /Hamda: we should ship/)
    const created = m.create.mock.calls[0]?.arguments[2] as Record<string, unknown>
    assert.match(String(created.notes), /Notes from/, 'the meeting record has no notes')
  })

  it('does not call the model when nobody said anything', async () => {
    // An empty transcript produces an invented meeting summary, which is worse
    // than no notes: it reads as a record of a conversation that never happened.
    const { db } = fakeDb({
      calls: [{ ...LIVE_CALL }],
      participants: [{ userId: 'me', leftAt: null }],
      transcript: [],
    })
    const brain = ai()
    await makeService({ db, ai: brain }).end('call1', 'me')
    assert.equal(brain.notesFromTranscript.mock.callCount(), 0, 'it wrote notes for a silent call')
  })

  it('still ends the call when no model is configured', async () => {
    // A call that refused to end because a model was missing is a disaster; a
    // meeting with a transcript and no notes is still a meeting.
    const { db } = fakeDb({
      calls: [{ ...LIVE_CALL }],
      participants: [{ userId: 'me', leftAt: null }],
      transcript: said,
    })
    const m = meetings()
    const out = await makeService({
      db,
      meetings: m,
      ai: { isAvailable: () => false, notesFromTranscript: mock.fn() },
    }).end('call1', 'me')
    assert.equal(out.ok, true)
    assert.equal((m.create.mock.calls[0]?.arguments[2] as Record<string, unknown>).notes, null)
  })

  it('still ends the call when the model throws', async () => {
    const { db } = fakeDb({
      calls: [{ ...LIVE_CALL }],
      participants: [{ userId: 'me', leftAt: null }],
      transcript: said,
    })
    const out = await makeService({
      db,
      ai: {
        isAvailable: () => true,
        notesFromTranscript: mock.fn(async () => {
          throw new Error('model is down')
        }),
      },
    }).end('call1', 'me')
    assert.equal(out.ok, true)
  })
})

describe('§2.8 the recording goes straight to storage', () => {
  /**
   * A call that HAS been recorded — which is not the same as one recording
   * right now, and the difference lost every recording ever made.
   *
   * The browser cannot upload until MediaRecorder stops, and the only thing
   * that stops it is recording being switched off. So by the time the upload
   * asks for a URL, `recording` is ALWAYS false. `recordingStartedAt` is what
   * actually says "this call produced a file, and you may hand it in".
   */
  const RECORDED = { ...LIVE_CALL, recording: true, recordingStartedAt: new Date() }

  it('hands back a URL to PUT to, and a key under this call', async () => {
    // The media never passes through the API, in a call or on its way out.
    const { db } = fakeDb({ calls: [{ ...RECORDED }] })
    const out = await makeService({ db }).recordingUploadUrl('call1', 'me', 'audio/webm')
    assert.match(out.storageKey, /^calls\/ws1\/call1\//)
    assert.ok(out.uploadUrl.includes(out.storageKey))
  })

  it('refuses a call nobody ever recorded', async () => {
    // Never announced, so there is no file and no consent behind one.
    const { db } = fakeDb({ calls: [{ ...LIVE_CALL, recording: false, recordingStartedAt: null }] })
    await assert.rejects(
      () => makeService({ db }).recordingUploadUrl('call1', 'me', 'audio/webm'),
      /never recorded/i,
    )
  })

  it('ALLOWS one whose recording has just been stopped', async () => {
    // The only order the browser can actually use. Requiring `recording` here
    // refused every finished recording at the last step and dropped it.
    const { db } = fakeDb({ calls: [{ ...RECORDED, recording: false }] })
    const out = await makeService({ db }).recordingUploadUrl('call1', 'me', 'audio/webm')
    assert.ok(out.uploadUrl, 'a finished recording could not be handed in')
  })

  it('refuses a content type that is not media', async () => {
    const { db } = fakeDb({ calls: [{ ...RECORDED }] })
    await assert.rejects(
      () => makeService({ db }).recordingUploadUrl('call1', 'me', 'application/zip'),
      /audio or video/i,
    )
  })

  it('says so plainly when storage is not configured', async () => {
    const { db } = fakeDb({ calls: [{ ...RECORDED }] })
    await assert.rejects(
      () =>
        makeService({ db, r2: { ...storage(), configured: false } }).recordingUploadUrl(
          'call1',
          'me',
          'audio/webm',
        ),
      /not configured/i,
    )
  })

  it('refuses a key belonging to a different call', async () => {
    // The one mistake here that cannot be undone: attaching somebody else's
    // recording to this meeting.
    const { db } = fakeDb({ calls: [{ ...RECORDED }] })
    await assert.rejects(
      () => makeService({ db }).attachRecording('call1', 'me', 'calls/ws1/some-other-call/rec.webm'),
      /does not belong/i,
    )
  })

  it('accepts a key from this call', async () => {
    const { db, updates } = fakeDb({ calls: [{ ...RECORDED }] })
    await makeService({ db }).attachRecording('call1', 'me', 'calls/ws1/call1/recording-1.webm')
    assert.ok(
      updates.some((u) => u.recordingStorageKey === 'calls/ws1/call1/recording-1.webm'),
      'the key was not stored',
    )
  })

  it('puts the recording on the meeting record when the call ends', async () => {
    const { db } = fakeDb({
      calls: [{ ...LIVE_CALL, recordingStorageKey: 'calls/ws1/call1/recording-1.webm' }],
      participants: [{ userId: 'me', leftAt: null }],
    })
    const m = meetings()
    await makeService({ db, meetings: m }).end('call1', 'me')
    const created = m.create.mock.calls[0]?.arguments[2] as Record<string, unknown>
    assert.match(String(created.recordingUrl), /recording-1\.webm/, 'the recording was lost')
  })

  it('leaves recordingUrl null when there was no recording', async () => {
    const { db } = fakeDb({ calls: [{ ...LIVE_CALL }], participants: [{ userId: 'me', leftAt: null }] })
    const m = meetings()
    await makeService({ db, meetings: m }).end('call1', 'me')
    assert.equal((m.create.mock.calls[0]?.arguments[2] as Record<string, unknown>).recordingUrl, null)
  })
})

/**
 * §2.8 — two gates that existed only in the browser, which is to say did not
 * exist. Both were found by an adversarial pass over this code.
 */
describe('§2.8 the entitlement is enforced on the server', () => {
  it('refuses to start recording when the workspace has AI Notes off', async () => {
    // The "Unlock AI Notetaker" modal was the whole enforcement. Anything
    // holding a token could turn recording on anyway, and the workspace would
    // record calls and be billed for notes it had declined.
    const { db } = fakeDb({ calls: [{ ...LIVE_CALL }] })
    await assert.rejects(
      () => makeService({ db, flags: flags(false) }).setRecording('call1', 'me', true),
      /turned off for this workspace/i,
    )
  })

  it('does not write the flag or announce anything when it refuses', async () => {
    const { db, updates } = fakeDb({ calls: [{ ...LIVE_CALL }] })
    const rt = realtime()
    await makeService({ db, realtime: rt, flags: flags(false) })
      .setRecording('call1', 'me', true)
      .catch(() => null)
    assert.equal(updates.some((u) => u.recording === true), false, 'recording was switched on anyway')
    assert.equal(rt.emitToWorkspace.mock.callCount(), 0, 'a recording banner was announced for a refused recording')
  })

  it('still allows STOPPING a recording when the feature is off', async () => {
    // A workspace that disables the feature mid-call must still be able to stop
    // the recording already running. Refusing here would trap it on.
    const { db } = fakeDb({ calls: [{ ...LIVE_CALL, recording: true }] })
    const out = await makeService({ db, flags: flags(false) }).setRecording('call1', 'me', false)
    assert.equal(out.recording, false)
  })

  it('allows it when the feature is on', async () => {
    const { db } = fakeDb({ calls: [{ ...LIVE_CALL }] })
    const out = await makeService({ db, flags: flags(true) }).setRecording('call1', 'me', true)
    assert.equal(out.recording, true)
  })
})

describe('§2.8 only people who were in the call can read what was said', () => {
  const said = [{ text: 'we should ship on Friday', saidAt: new Date(), name: 'Hamda', email: 'h@x' }]

  it('refuses somebody who is in the channel but never joined', async () => {
    // The consent story is that everyone IN the call is told it is being
    // recorded. Somebody sitting in the channel was never told anything, and
    // could read verbatim what was being said, live.
    const { db } = fakeDb({ calls: [{ ...LIVE_CALL }], participants: [], transcript: said })
    await assert.rejects(
      () => makeService({ db }).liveTranscript('call1', 'lurker'),
      /were in the call/i,
    )
  })

  it('allows somebody who is in it', async () => {
    const { db } = fakeDb({
      calls: [{ ...LIVE_CALL }],
      participants: [{ id: 'p1', userId: 'me', leftAt: null }],
      transcript: said,
    })
    const out = await makeService({ db }).liveTranscript('call1', 'me')
    assert.match(out.transcript, /we should ship on Friday/)
  })

  it('allows somebody who has left — they were there, and heard the banner', async () => {
    const { db } = fakeDb({
      calls: [{ ...LIVE_CALL }],
      participants: [{ id: 'p1', userId: 'me', leftAt: new Date() }],
      transcript: said,
    })
    const out = await makeService({ db }).liveTranscript('call1', 'me')
    assert.match(out.transcript, /we should ship on Friday/)
  })
})
