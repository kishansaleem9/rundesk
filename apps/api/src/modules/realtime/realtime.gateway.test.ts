import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { lists, users, workspaceMembers } from '@rundesk/db'
import { RealtimeGateway } from './realtime.gateway'

/*
 * A TOKEN WHOSE SESSION HAS ENDED OPENS NO SOCKET
 * (`found-30-sep/revoked-sessions-keep-their-access-tokens`). The handshake
 * checked the token's signature alone, so a session revoked by a password
 * change still opened a socket, and heard its rooms, until its token ran out.
 * It asks `sessionIsLive` now, as `JwtStrategy` does for a route.
 * `sign-in-and-password.mjs` opens one with an ended session's token on a lane.
 */
const SESSION = '9c1e2d3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f'

function gatewayOver(live: boolean) {
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ userId: 'u1', isRevoked: !live, expiresAt: new Date(Date.now() + 60_000) }] }) }) }),
  }
  const jwtService = { verify: () => ({ sub: 'u1', email: 'a@b.com', role: 'member', sid: SESSION }) }
  const config = { getOrThrow: () => 'test-access-secret' }
  const presence = { recordHeartbeat: async () => undefined }
  return new RealtimeGateway(jwtService as any, config as any, db as any, presence as any)
}
function socket() {
  const said: Array<[string, unknown]> = []
  const joined: string[] = []
  let disconnected = false
  const client = {
    id: 'c1',
    handshake: { auth: { token: 'ACCESS-JWT' }, query: {}, headers: {} },
    data: {} as Record<string, unknown>,
    emit: (event: string, body: unknown) => { said.push([event, body]) },
    disconnect: () => { disconnected = true },
    join: (room: string) => { joined.push(room) },
  }
  return { client, said, joined, disconnected: () => disconnected }
}

describe('RealtimeGateway.handleConnection — a token whose session has ended opens no socket', () => {
  it('a socket whose token’s session has ended is ended at its handshake with “Session ended”, and joins no room; a live session’s joins its own', async () => {
    const ended = socket()
    await gatewayOver(false).handleConnection(ended.client as any)
    assert.equal(ended.disconnected(), true, 'the ended session’s socket stayed open')
    assert.deepEqual(ended.said, [['error', { message: 'Session ended' }]])
    assert.deepEqual(ended.joined, [])
    const live = socket()
    await gatewayOver(true).handleConnection(live.client as any)
    assert.equal(live.disconnected(), false)
    assert.deepEqual(live.joined, ['user:u1'])
  })

  /*
   * The web subscribes the moment it connects, so its subscribe can arrive
   * while the handshake's read is still out. Measured on lane 3 before the
   * subscribe waited: `chat-realtime-access`, `call-realtime-access`,
   * `guest-chat-scope` and `guest-canvas-scope` each had every room denied.
   */
  it('a subscribe that arrives before the handshake has found the session live waits for it: a live session’s socket joins its room, an ended one’s joins none', async () => {
    for (const live of [true, false]) {
      let answer!: (rows: unknown[]) => void
      const pending = new Promise<unknown[]>((resolve) => { answer = resolve })
      const db = { select: () => ({ from: () => ({ where: () => ({ limit: () => pending }) }) }) }
      const gateway = new RealtimeGateway(
        { verify: () => ({ sub: 'u1', email: 'a@b.com', role: 'member', sid: SESSION }) } as any,
        { getOrThrow: () => 'test-access-secret' } as any,
        db as any,
        { recordHeartbeat: async () => undefined } as any,
      )
      const s = socket()
      const connecting = gateway.handleConnection(s.client as any)
      const subscribed = gateway.handleSubscribe(s.client as any, { rooms: ['user:u1'] as any })
      answer([{ userId: 'u1', isRevoked: !live, expiresAt: new Date(Date.now() + 60_000) }])
      await connecting
      const ack = (await subscribed) as { joined?: string[] }
      assert.deepEqual(ack.joined, live ? ['user:u1'] : [], live ? 'the live session’s subscribe was refused' : 'the ended session’s socket joined a room')
    }
  })
})

/*
 * A SOCKET STOPS HEARING ITS ROOMS WHEN ITS SESSION ENDS
 * (`found-30-sep/an-open-socket-outlives-its-session`). The handshake read the
 * token's session once; nothing looked at an open socket again, so a socket
 * opened before its session was revoked stayed connected and heard its rooms
 * for as long as its connection lasted (nothing ended it when its access token
 * ran out either). Each live socket's session is re-read
 * (`sessionIsLive`) on a short interval and on its presence ping, and a revoked
 * one's sockets are disconnected with "Session ended", as a new handshake is.
 * `sign-in-and-password.mjs` opens a socket, revokes its session and watches it
 * go on a lane.
 */
const LIVE = 'a1111111-1111-4111-8111-111111111111'
const REVOKED = 'b2222222-2222-4222-8222-222222222222'

type SessionRow = { userId: string; isRevoked: boolean; expiresAt: Date }
function gatewayWithSessions(rows: Record<string, SessionRow>) {
  const db = {
    select: () => ({
      from: () => ({
        where: (cond: any) => {
          const id = (cond?.queryChunks ?? []).find((c: any) => c?.constructor?.name === 'Param')?.value as string
          return { limit: async () => (rows[id] ? [rows[id]] : []) }
        },
      }),
    }),
  }
  return new RealtimeGateway(
    {} as any,
    { getOrThrow: () => 'test-access-secret' } as any,
    db as any,
    { recordHeartbeat: async () => undefined } as any,
  )
}
/** A fake connected socket carrying a session id, recording what it was told and whether it was closed. */
function connected(userId: string, sid: string) {
  const said: Array<[string, unknown]> = []
  let disconnected = false
  const client = {
    id: `c-${sid}`,
    data: { userId, sid } as Record<string, unknown>,
    emit: (event: string, body: unknown) => { said.push([event, body]) },
    disconnect: () => { disconnected = true },
    join: () => undefined,
  }
  return { client, said, disconnected: () => disconnected }
}

describe('RealtimeGateway — a socket whose session has ended is disconnected', () => {
  it('the sweep disconnects a revoked session’s sockets with “Session ended” and leaves a live session’s untouched', async () => {
    const later = new Date(Date.now() + 60_000)
    const gateway = gatewayWithSessions({
      [LIVE]: { userId: 'u1', isRevoked: false, expiresAt: later },
      [REVOKED]: { userId: 'u2', isRevoked: true, expiresAt: later },
    })
    const liveSock = connected('u1', LIVE)
    const revokedSock = connected('u2', REVOKED)
    // The namespace's local sockets are a Map keyed by socket id.
    ;(gateway as any).server = { sockets: new Map([[liveSock.client.id, liveSock.client], [revokedSock.client.id, revokedSock.client]]) }
    await (gateway as any).disconnectRevokedSockets()
    assert.equal(revokedSock.disconnected(), true, 'the revoked session’s socket stayed connected')
    assert.deepEqual(revokedSock.said, [['error', { message: 'Session ended' }]])
    assert.equal(liveSock.disconnected(), false, 'the live session’s socket was disconnected')
    assert.deepEqual(liveSock.said, [])
  })

  it('a presence ping on a revoked session’s socket disconnects it instead of recording a heartbeat', async () => {
    const beats: string[] = []
    const gateway = gatewayWithSessions({ [REVOKED]: { userId: 'u2', isRevoked: true, expiresAt: new Date(Date.now() + 60_000) } })
    ;(gateway as any).presence = { recordHeartbeat: async (id: string) => { beats.push(id) } }
    const s = connected('u2', REVOKED)
    await gateway.handlePresencePing(s.client as any)
    assert.equal(s.disconnected(), true, 'the revoked session’s socket was not disconnected on its ping')
    assert.deepEqual(s.said, [['error', { message: 'Session ended' }]])
    assert.deepEqual(beats, [], 'a revoked session’s ping was still counted as a heartbeat')
  })
})

/*
 * A SWEEP WHOSE READ FAILS ENDS NOTHING, AND NOT THE PROCESS. The sweep runs in
 * a timer, where a rejection nobody hears ends the process (Node's default):
 * measured on a lane, its database refused connections for eight seconds while
 * a socket was open, the sweep's read failed, and the API exited and stayed
 * down after the database came back. A read that fails answers nothing, so its
 * sockets are kept and asked about at the next sweep; the reads are settled
 * together, and the timer catches what the sweep throws. Each rejection that
 * would go unheard is collected here (a listener of the test's own, beside the
 * runner's) instead of being left to end the run.
 */
async function unheardRejectionsDuring(run: () => Promise<void>): Promise<unknown[]> {
  const unheard: unknown[] = []
  const listen = (reason: unknown) => { unheard.push(reason) }
  process.on('unhandledRejection', listen)
  try {
    await run()
    // Node reports an unheard rejection once the microtasks it was made in have run out.
    for (let i = 0; i < 3; i += 1) await new Promise((resolve) => setImmediate(resolve))
  } finally {
    process.off('unhandledRejection', listen)
  }
  return unheard
}

describe('RealtimeGateway — a sweep whose session read fails', () => {
  it('a sweep whose session reads fail resolves, ends no socket, and leaves no rejection unheard', async () => {
    // One read answers after a moment (live), the other fails at once: awaited
    // one by one, the failure has nobody listening while the first is awaited.
    const db = {
      select: () => ({
        from: () => ({
          where: (cond: any) => {
            const id = (cond?.queryChunks ?? []).find((c: any) => c?.constructor?.name === 'Param')?.value as string
            return {
              limit: async () => {
                if (id === REVOKED) throw new Error('database "rundesk" is not currently accepting connections')
                await new Promise((resolve) => setTimeout(resolve, 30))
                return [{ userId: 'u1', isRevoked: false, expiresAt: new Date(Date.now() + 60_000) }]
              },
            }
          },
        }),
      }),
    }
    const gateway = new RealtimeGateway({} as any, { getOrThrow: () => 'test-access-secret' } as any, db as any, { recordHeartbeat: async () => undefined } as any)
    const answered = connected('u1', LIVE)
    const unanswered = connected('u2', REVOKED)
    ;(gateway as any).server = { sockets: new Map([[answered.client.id, answered.client], [unanswered.client.id, unanswered.client]]) }
    let threw: unknown = null
    const unheard = await unheardRejectionsDuring(async () => {
      try { await (gateway as any).disconnectRevokedSockets() } catch (err) { threw = err }
    })
    assert.equal(threw, null, `the sweep threw: ${String((threw as Error | null)?.message ?? threw)}`)
    assert.deepEqual(unheard.map((r) => String((r as Error)?.message ?? r)), [], 'a failed session read went unheard (it would end the process)')
    assert.equal(answered.disconnected(), false, 'a live session’s socket was ended')
    assert.equal(unanswered.disconnected(), false, 'a socket whose session read failed was ended (it is asked about again at the next sweep)')
  })

  it('the sweep’s timer hears a sweep that fails: no rejection is left to end the process', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] })
    const gateway = gatewayWithSessions({})
    ;(gateway as any).disconnectRevokedSockets = async () => { throw new Error('the database did not answer') }
    ;(gateway as any).askRoomsAgain = async () => { throw new Error('the database did not answer either') }
    const unheard = await unheardRejectionsDuring(async () => {
      gateway.afterInit()
      try {
        t.mock.timers.tick((RealtimeGateway as any).SWEEP_MS)
      } finally {
        gateway.onModuleDestroy()
      }
    })
    assert.deepEqual(unheard.map((r) => String((r as Error)?.message ?? r)), [], 'the timer left a failed sweep unheard (it would end the process)')
  })
})

/*
 * THE SESSIONS ARE ASKED ABOUT AT EVERY TICK, WHATEVER THE ROOMS COST
 * (`found-6-oct/an-open-socket-outlives-its-access`, review). The room questions
 * were asked in the same sweep as the sessions, after them, and a tick that
 * found that sweep running skipped both: measured on lane 2, with one member's
 * socket holding 3,000 task rooms a signed-out session's socket stayed open
 * 9.7 s, where it had closed in 3.9 s. Each runs on its own now, one of each at
 * a time, and a tick that comes while a room pass runs starts the next one as
 * soon as it ends.
 */
/** Let the microtasks a settled sweep queued run, as they would before the next tick. */
const settle = async () => { for (let i = 0; i < 3; i += 1) await new Promise((resolve) => setImmediate(resolve)) }

describe('RealtimeGateway — the session sweep and the room pass, each on its own', () => {
  it('the session sweep runs at every tick while a room pass is still running: a revoked session’s socket does not wait behind the rooms', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] })
    const gateway = gatewayWithSessions({})
    let sessionSweeps = 0
    let roomPasses = 0
    let finishRooms: (() => void) | undefined
    ;(gateway as any).disconnectRevokedSockets = async () => { sessionSweeps += 1 }
    ;(gateway as any).askRoomsAgain = () => {
      roomPasses += 1
      return new Promise<void>((resolve) => { finishRooms = resolve })
    }
    gateway.afterInit()
    try {
      for (let i = 0; i < 3; i += 1) {
        t.mock.timers.tick((RealtimeGateway as any).SWEEP_MS)
        await settle()
      }
      assert.equal(roomPasses, 1, 'a room pass was started on top of one still running')
      assert.equal(sessionSweeps, 3, `the sessions were asked about ${sessionSweeps} times in 3 ticks while a room pass ran (a revoked session’s socket waited behind the rooms)`)
    } finally {
      finishRooms?.()
      gateway.onModuleDestroy()
    }
  })

  it('one room pass at a time: a tick that comes while one runs starts the next as soon as it ends, not on top of it', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] })
    const gateway = gatewayWithSessions({})
    const finish: Array<() => void> = []
    ;(gateway as any).disconnectRevokedSockets = async () => undefined
    ;(gateway as any).askRoomsAgain = () => new Promise<void>((resolve) => { finish.push(resolve) })
    gateway.afterInit()
    try {
      t.mock.timers.tick((RealtimeGateway as any).SWEEP_MS)
      t.mock.timers.tick((RealtimeGateway as any).SWEEP_MS)
      t.mock.timers.tick((RealtimeGateway as any).SWEEP_MS)
      assert.equal(finish.length, 1, 'a tick started a room pass while the last one was still running')
      finish[0]()
      await settle()
      assert.equal(finish.length, 2, 'the ticks that came while a pass ran did not start the next one when it ended')
      finish[1]()
      await settle()
      assert.equal(finish.length, 2, 'a pass started with no tick having come since the last one began')
      t.mock.timers.tick((RealtimeGateway as any).SWEEP_MS)
      assert.equal(finish.length, 3, 'no room pass started at the next tick')
    } finally {
      for (const done of finish) done()
      gateway.onModuleDestroy()
    }
  })
})

/*
 * A SOCKET HEARS WHAT ITS PERSON MAY READ NOW
 * (`found-6-oct/an-open-socket-outlives-its-access`). A room was asked once,
 * at `subscribe`; measured on lane 2, a member removed from the workspace, a
 * guest whose share was removed, a member lowered to guest and members of a
 * list and of a space made private each heard a task made seven seconds later
 * on a socket already open. Each room pass now asks again every room a live
 * socket's pages asked for (`canJoinRoom`), leaves those its person may no
 * longer read and joins again those they may read once more. Here the rule
 * itself is a stand-in, so what is checked is the pass: who is asked, how
 * often, in what order, and what is left or joined; `realtime-access-ends.mjs`
 * runs the rule on a lane.
 */
const ANOTHER = 'c3333333-3333-4333-8333-333333333333'
/** A fake socket whose pages asked for these rooms and hold them (let in under `workspaceId`), recording what it leaves and joins and whether it was closed. */
function holding(id: string, userId: string, sid: string, rooms: string[], workspaceId: string | null = null, role?: string) {
  const left: string[] = []
  const joined: string[] = []
  let disconnected = false
  const client = {
    id,
    data: { userId, sid, role, wanted: new Map(rooms.map((room) => [room, workspaceId])) } as Record<string, unknown>,
    rooms: new Set([id, `user:${userId}`, ...rooms]),
    disconnected: false,
    emit: () => undefined,
    disconnect: () => { disconnected = true },
    join: (room: string) => { joined.push(room); client.rooms.add(room) },
    leave: (room: string) => { left.push(room); client.rooms.delete(room) },
  }
  return { client, left, joined, disconnected: () => disconnected }
}
/** The gateway's namespace, holding these fake sockets. */
function serving(gateway: RealtimeGateway, ...sockets: Array<{ client: { id: string } }>) {
  ;(gateway as any).server = { sockets: new Map(sockets.map((s) => [s.client.id, s.client])) }
}

describe('RealtimeGateway — a socket stops hearing the rooms its person may no longer read', () => {
  it('the sweep makes a socket leave each room its person may no longer read, asking once per person and room however many of their sockets hold it, and keeps the rooms they may still read and their own', async () => {
    const gateway = gatewayWithSessions({})
    const tabOne = holding('s1', 'u1', LIVE, ['workspace:w1', 'list:gone', 'list:kept'])
    const tabTwo = holding('s2', 'u1', LIVE, ['list:gone'])
    const other = holding('s3', 'u2', ANOTHER, ['list:gone'])
    serving(gateway, tabOne, tabTwo, other)
    const asked: string[] = []
    // u1 may no longer read the workspace or list:gone; u2 still reads list:gone.
    ;(gateway as any).canJoinRoom = async (client: { data: { userId: string } }, room: string) => {
      asked.push(`${client.data.userId} ${room}`)
      if (client.data.userId === 'u2') return true
      return room === 'list:kept'
    }
    await (gateway as any).askRoomsAgain()
    assert.deepEqual(asked.sort(), ['u1 list:gone', 'u1 list:kept', 'u1 workspace:w1', 'u2 list:gone'], 'a room was asked more than once a person, or a socket’s own room was asked')
    assert.deepEqual(tabOne.left.sort(), ['list:gone', 'workspace:w1'], 'the first tab kept a room its person may no longer read')
    assert.deepEqual(tabTwo.left, ['list:gone'], 'the second tab of the same person kept the room')
    assert.deepEqual(other.left, [], 'a person who may still read the room was made to leave it')
    assert.deepEqual([...tabOne.client.rooms].sort(), ['list:kept', 's1', 'user:u1'], 'the socket did not keep its own rooms and the one it may read')
    assert.equal(tabOne.disconnected() || tabTwo.disconnected() || other.disconnected(), false, 'a socket whose session is live was closed')
  })

  it('a room question that fails keeps the room: the sweep resolves, leaves nothing it could not ask, and leaves no rejection unheard', async () => {
    const gateway = gatewayWithSessions({})
    const sock = holding('s1', 'u1', LIVE, ['list:unasked', 'list:refused'])
    serving(gateway, sock)
    ;(gateway as any).canJoinRoom = async (_client: unknown, room: string) => {
      if (room === 'list:unasked') {
        await new Promise((resolve) => setTimeout(resolve, 20))
        throw new Error('database "rundesk" is not currently accepting connections')
      }
      return false
    }
    let threw: unknown = null
    const unheard = await unheardRejectionsDuring(async () => {
      try { await (gateway as any).askRoomsAgain() } catch (err) { threw = err }
    })
    assert.equal(threw, null, `the sweep threw: ${String((threw as Error | null)?.message ?? threw)}`)
    assert.deepEqual(unheard.map((r) => String((r as Error)?.message ?? r)), [], 'a failed room question went unheard (it would end the process)')
    assert.deepEqual(sock.left, ['list:refused'], 'a room whose question failed was left, or a refused one kept (the failed one is asked again at the next sweep)')
  })

  /*
   * A PERSON REMOVED FROM A WORKSPACE LEAVES ALL OF ITS ROOMS AT ONCE. Asked
   * room by room, in turn with everyone else, a removed member whose socket held
   * 3,000 task rooms went on hearing them 18.6 s after the removal (lane 2).
   * Each room is held with the workspace it was let in under, and one
   * membership read for each person and workspace settles them all.
   */
  it('a person no longer a member of a workspace leaves every room of theirs there at once, on one membership read however many they hold; a member, and a super_admin, are asked room by room', async () => {
    const gateway = gatewayWithSessions({})
    const removed = holding('s1', 'u1', LIVE, Array.from({ length: 30 }, (_, i) => `task:t${i}`), 'w1')
    const member = holding('s2', 'u2', ANOTHER, ['list:a', 'list:b'], 'w1')
    const superAdmin = holding('s3', 'u3', ANOTHER, ['list:c'], 'w1', 'super_admin')
    serving(gateway, removed, member, superAdmin)
    const memberships: string[] = []
    ;(gateway as any).membershipOf = async (workspaceId: string, userId: string) => {
      memberships.push(`${workspaceId} ${userId}`)
      return userId === 'u2' ? [{ role: 'member' }] : []
    }
    const asked: string[] = []
    ;(gateway as any).canJoinRoom = async (client: { data: { userId: string } }, room: string) => {
      asked.push(`${client.data.userId} ${room}`)
      return true
    }
    await (gateway as any).askRoomsAgain()
    assert.equal(removed.left.length, 30, `the removed member left ${removed.left.length} of their 30 rooms`)
    assert.deepEqual(asked.filter((q) => q.startsWith('u1 ')), [], 'the removed member’s rooms were asked one by one')
    assert.deepEqual(memberships.sort(), ['w1 u1', 'w1 u2'], 'the membership was read more than once a person and workspace, or a super_admin’s was asked')
    assert.deepEqual(asked.filter((q) => !q.startsWith('u1 ')).sort(), ['u2 list:a', 'u2 list:b', 'u3 list:c'], 'a member’s or a super_admin’s rooms were not asked one by one')
    assert.deepEqual(member.left.concat(superAdmin.left), [], 'a member or a super_admin left a room they may read')
  })

  /*
   * ACCESS THAT COMES BACK IS HEARD AGAIN ON THE SAME SOCKET. Leaving alone,
   * measured on lane 2, kept an open page deaf to its list once its reader's
   * access came back (a list made private and public again, a member added to
   * the private space, a guest made a member again) until it was reloaded: a
   * page subscribes once, when it mounts.
   */
  it('a socket joins again a room its page still holds once its person may read it again, and not one its page let go', async () => {
    const gateway = gatewayWithSessions({})
    const sock = holding('s1', 'u1', LIVE, ['list:back', 'list:let-go'])
    serving(gateway, sock)
    let may = false
    ;(gateway as any).canJoinRoom = async () => may
    await (gateway as any).askRoomsAgain()
    assert.deepEqual(sock.left.sort(), ['list:back', 'list:let-go'], 'the rooms its person lost were not left')
    // The page that held one of them goes away; then access comes back.
    gateway.handleUnsubscribe(sock.client as any, { rooms: ['list:let-go'] as any })
    may = true
    await (gateway as any).askRoomsAgain()
    assert.deepEqual(sock.joined, ['list:back'], 'the socket did not join again the room its page still holds, or joined one its page let go')
    assert.deepEqual([...sock.client.rooms].sort(), ['list:back', 's1', 'user:u1'])
  })

  it('a subscribe holds the rooms it was let into for the pass to ask about again, and an unsubscribe lets them go', async () => {
    const gateway = gatewayWithSessions({})
    const sock = holding('s1', 'u1', LIVE, [])
    serving(gateway, sock)
    ;(gateway as any).canJoinRoom = async (_client: unknown, room: string) => room !== 'list:refused'
    await gateway.handleSubscribe(sock.client as any, { rooms: ['list:a', 'list:refused', 'task:b'] as any })
    assert.deepEqual([...(sock.client.data.wanted as Map<string, unknown>).keys()].sort(), ['list:a', 'task:b'], 'a subscribe did not hold what it joined, or held what it was refused')
    gateway.handleUnsubscribe(sock.client as any, { rooms: ['task:b'] as any })
    assert.deepEqual([...(sock.client.data.wanted as Map<string, unknown>).keys()], ['list:a'], 'an unsubscribe did not let the room go')
  })
})

/*
 * A PASS ASKS A FEW ROOMS AT A TIME, SHARES ITS READS, ACTS ON EACH ANSWER WHEN
 * IT COMES, ASKS EVERY PERSON IN TURN, AND LASTS AT MOST ONE INTERVAL. Asked
 * all at once, a sweep's questions took the database's whole pool: measured on
 * lane 2, 200 people holding four rooms each (800 questions) took 1.7 s and a
 * request's read sent meanwhile waited 0.7 s behind them; four at a time, it
 * waited 6 ms. Asked socket by socket and acted on at the end, one socket
 * holding 3,000 task rooms kept a removed member hearing a list 9.5 s after
 * their removal, and three such sockets 21.8 s (lane 2).
 */
describe('RealtimeGateway — what a room pass costs, and in what order it asks', () => {
  it('a sweep asks at most ROOM_QUESTIONS_AT_ONCE room questions at a time, and answers every one', async () => {
    const gateway = gatewayWithSessions({})
    const rooms = Array.from({ length: 30 }, (_, i) => `list:l${i}`)
    const sock = holding('s1', 'u1', LIVE, rooms)
    serving(gateway, sock)
    let inFlight = 0
    let most = 0
    const answered: string[] = []
    ;(gateway as any).canJoinRoom = async (_client: unknown, room: string) => {
      inFlight += 1
      most = Math.max(most, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
      answered.push(room)
      return room !== 'list:l7'
    }
    await (gateway as any).askRoomsAgain()
    const atOnce = (RealtimeGateway as any).ROOM_QUESTIONS_AT_ONCE
    assert.ok(atOnce >= 1 && most <= atOnce, `${most} room questions were asked at once (the pool is the requests’ too; at most ${atOnce})`)
    assert.deepEqual(answered.sort(), [...rooms].sort(), 'a room was not asked, or was asked twice')
    assert.deepEqual(sock.left, ['list:l7'], 'the refused room was not left, or a readable one was')
  })

  it('within one sweep a room’s workspace is read once, and a person’s membership of it once, however many of their rooms ask; a subscribe reads afresh', async () => {
    const reads: string[] = []
    // A list is read for its workspace through its project and space, and alone for whose Personal List it is.
    const fromTable = (table: unknown) => {
      let joined = false
      return {
        innerJoin() { joined = true; return this },
        where() { return this },
        limit: async () => {
          if (table === lists && !joined) { reads.push('owner of a list'); return [{ personalOf: null }] }
          if (table === lists) { reads.push('workspace of a list'); return [{ w: 'w1' }] }
          if (table === workspaceMembers) { reads.push('membership'); return [{ role: 'workspace_admin' }] }
          throw new Error('an unexpected read')
        },
      }
    }
    const db = { select: () => ({ from: (table: unknown) => fromTable(table) }) }
    const gateway = new RealtimeGateway({} as any, {} as any, db as any, { recordHeartbeat: async () => undefined } as any)
    const one = holding('s1', 'u1', LIVE, ['workspace:w1', 'list:a', 'list:b'])
    const two = holding('s2', 'u2', LIVE, ['list:a'])
    serving(gateway, one, two)
    await (gateway as any).askRoomsAgain()
    assert.deepEqual(reads.filter((r) => r === 'workspace of a list').length, 2, 'a list’s workspace was read more than once in a sweep (two lists)')
    assert.deepEqual(reads.filter((r) => r === 'membership').length, 2, 'a person’s membership was read more than once in a sweep (two people)')
    assert.deepEqual(one.left.concat(two.left), [], 'a manager was made to leave a room')
    // A subscribe is no sweep: it reads afresh every time.
    reads.length = 0
    await gateway.handleSubscribe(one.client as any, { rooms: ['list:a', 'list:a'] as any })
    // (Whose Personal List it is is asked each time too, after the membership: `canReadListOrTask`.)
    assert.deepEqual(
      reads.filter((r) => r !== 'owner of a list'),
      ['workspace of a list', 'membership', 'workspace of a list', 'membership'],
      'a subscribe was answered from an earlier read',
    )
  })

  it('each answer is acted on when it comes: a refused room is left while the pass is still asking about others', async () => {
    const gateway = gatewayWithSessions({})
    const sock = holding('s1', 'u1', LIVE, ['list:refused', 'list:slow'])
    serving(gateway, sock)
    let release!: () => void
    const slow = new Promise<void>((resolve) => { release = resolve })
    ;(gateway as any).canJoinRoom = async (_client: unknown, room: string) => {
      if (room === 'list:refused') return false
      await slow
      return true
    }
    const pass = (gateway as any).askRoomsAgain() as Promise<void>
    await settle()
    assert.deepEqual(sock.left, ['list:refused'], 'a refused room was kept until every other question of the pass was answered')
    release()
    await pass
    assert.deepEqual(sock.left, ['list:refused'])
  })

  it('every person in turn: one socket’s many rooms do not put another person’s rooms at the end of the pass', async () => {
    const gateway = gatewayWithSessions({})
    const heavy = holding('s1', 'u1', LIVE, Array.from({ length: 40 }, (_, i) => `task:t${i}`))
    const light = holding('s2', 'u2', ANOTHER, ['list:a', 'list:b'])
    serving(gateway, heavy, light)
    const order: string[] = []
    ;(gateway as any).canJoinRoom = async (client: { data: { userId: string } }, room: string) => {
      order.push(`${client.data.userId} ${room}`)
      return true
    }
    await (gateway as any).askRoomsAgain()
    const lightAt = order.map((asked, i) => (asked.startsWith('u2 ') ? i : -1)).filter((i) => i >= 0)
    assert.equal(order.length, 42)
    assert.ok(lightAt.length === 2 && Math.max(...lightAt) < 4, `the light person’s rooms were asked at ${JSON.stringify(lightAt)} of 42, behind the other socket’s`)
  })

  it('a pass stops asking once the interval is up, and the next pass asks first the rooms the last did not reach', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 })
    const gateway = gatewayWithSessions({})
    const rooms = Array.from({ length: 20 }, (_, i) => `list:l${i}`)
    const sock = holding('s1', 'u1', LIVE, rooms)
    serving(gateway, sock)
    const interval = (RealtimeGateway as any).SWEEP_MS as number
    const asked: string[][] = [[], []]
    let passIndex = 0
    // Each question takes a fifth of the interval.
    ;(gateway as any).canJoinRoom = async (_client: unknown, room: string) => {
      asked[passIndex].push(room)
      t.mock.timers.tick(interval / 5)
      return true
    }
    await (gateway as any).askRoomsAgain()
    assert.ok(asked[0].length >= 1 && asked[0].length <= 5 + (RealtimeGateway as any).ROOM_QUESTIONS_AT_ONCE, `a pass asked ${asked[0].length} questions in an interval that fits five`)
    passIndex = 1
    t.mock.timers.tick(interval)
    await (gateway as any).askRoomsAgain()
    const again = asked[1].filter((room) => asked[0].includes(room))
    assert.deepEqual(again, [], `the next pass asked again ${JSON.stringify(again)} before the rooms the last did not reach`)
  })
  it('a person the last pass did not reach is asked first in the next, however many people there are', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 2_000_000 })
    const gateway = gatewayWithSessions({})
    const people = Array.from({ length: 10 }, (_, i) => holding(`s${i}`, `u${i}`, LIVE, [`list:l${i}`]))
    serving(gateway, ...people)
    const interval = (RealtimeGateway as any).SWEEP_MS as number
    const asked: string[][] = [[], []]
    let passIndex = 0
    // Each question takes a third of the interval: a pass reaches three or four people of ten.
    ;(gateway as any).canJoinRoom = async (client: { data: { userId: string } }) => {
      asked[passIndex].push(client.data.userId)
      t.mock.timers.tick(interval / 3)
      return true
    }
    await (gateway as any).askRoomsAgain()
    assert.ok(asked[0].length >= 1 && asked[0].length < 10, `the first pass asked ${asked[0].length} of ten people in an interval that fits three`)
    passIndex = 1
    t.mock.timers.tick(interval)
    await (gateway as any).askRoomsAgain()
    const again = asked[1].filter((person) => asked[0].includes(person))
    assert.deepEqual(again, [], `the next pass asked again ${JSON.stringify(again)} before the people the last did not reach`)
  })
})

/*
 * A SUPER_ADMIN PASSES, AS IN EVERY GUARD (`ResourceMemberGuard`,
 * `read-access.ts`). Measured on lane 2: a super_admin who was a plain member
 * read a list made private (200), and the room pass took their open socket out
 * of it. The socket's role is its handshake token's, so the account is asked
 * whether it still is one.
 */
describe('RealtimeGateway — a super_admin’s rooms', () => {
  function gatewayWhere(accountRole: string) {
    const reads: string[] = []
    const fromTable = (table: unknown) => ({
      innerJoin() { return this },
      where() { return this },
      limit: async () => {
        if (table === lists) { reads.push('workspace of a list'); return [{ w: 'w1' }] }
        if (table === users) { reads.push('account role'); return [{ role: accountRole }] }
        if (table === workspaceMembers) { reads.push('membership'); return [] }
        throw new Error('an unexpected read')
      },
    })
    const db = { select: () => ({ from: (table: unknown) => fromTable(table) }) }
    return { gateway: new RealtimeGateway({} as any, {} as any, db as any, { recordHeartbeat: async () => undefined } as any), reads }
  }
  const socketOf = (role: string) => ({ id: 's1', data: { userId: 'u1', role } })

  it('a super_admin may join a list’s room the routes let them read, while their account still is one; a token that says so of an account that no longer is one is asked as anyone else', async () => {
    const still = gatewayWhere('super_admin')
    assert.equal(await (still.gateway as any).canJoinRoom(socketOf('super_admin'), 'list:a'), true, 'a super_admin was refused a room the routes let them read')
    const demoted = gatewayWhere('member')
    assert.equal(await (demoted.gateway as any).canJoinRoom(socketOf('super_admin'), 'list:a'), false, 'a token’s super_admin was trusted for an account that no longer is one')
    const member = gatewayWhere('super_admin')
    assert.equal(await (member.gateway as any).canJoinRoom(socketOf('member'), 'list:a'), false, 'a socket whose token never said super_admin was passed')
    assert.equal(member.reads.includes('account role'), false, 'the account was asked about a socket whose token never said super_admin')
  })
})

/*
 * WHAT A SOCKET SENDS GOES ONLY WHERE ITS PERSON MAY READ
 * (`found-6-oct/a-socket-sends-into-rooms-it-may-not-read`). A cursor went into
 * any canvas's room under the name its body gave, and a call reaction into the
 * room of whichever workspace its body named, from anyone with a socket.
 * `realtime-sends-access.mjs` sends both on a lane, from a removed member and
 * an account never in the workspace, beside those who may.
 */
/** A fake socket in these rooms, recording what it sends to which room. */
function sending(userId: string, rooms: string[]) {
  const sent: Array<[string, any]> = []
  const client = {
    data: { userId, email: `${userId}@example.com` } as Record<string, unknown>,
    rooms: new Set(rooms),
    to: (room: string) => ({ emit: (_kind: string, event: unknown) => { sent.push([room, event]) } }),
  }
  return { client, sent }
}
/** A gateway whose database answers every select with these rows, counting the reads. */
function gatewayAnswering(rows: unknown[]) {
  let reads = 0
  const db = { select: () => ({ from: () => ({ where: () => ({ limit: async () => { reads += 1; return rows } }) }) }) }
  const gateway = new RealtimeGateway({} as any, {} as any, db as any, {} as any)
  const heard: Array<[string, any]> = []
  ;(gateway as any).server = { to: (room: string) => ({ emit: (_kind: string, event: unknown) => { heard.push([room, event]) } }) }
  return { gateway, heard, reads: () => reads }
}

describe('RealtimeGateway — a cursor comes only from a socket in its canvas’s room, under its account’s name', () => {
  it('refuses a cursor, and its leave, from a socket not in the room, and relays one from a socket in it under the account’s name whatever name the body gives, read once', async () => {
    const { gateway, reads } = gatewayAnswering([{ displayName: 'Rev Member' }])
    const outside = sending('u2', ['s1', 'user:u2'])
    assert.deepEqual(await gateway.handleCanvasCursor(outside.client as any, { canvasId: 'c1', x: 1, y: 2, displayName: 'Rev owner (not really)' } as any), { ok: false })
    assert.deepEqual(gateway.handleCanvasCursorLeave(outside.client as any, { canvasId: 'c1' }), { ok: false })
    assert.equal(outside.sent.length, 0, 'nothing is relayed from outside the room')

    const inside = sending('u2', ['s2', 'user:u2', 'canvas:c1'])
    assert.deepEqual(await gateway.handleCanvasCursor(inside.client as any, { canvasId: 'c1', x: 1, y: 2, displayName: 'Rev owner (not really)' } as any), { ok: true })
    assert.deepEqual(await gateway.handleCanvasCursor(inside.client as any, { canvasId: 'c1', x: 3, y: 4 } as any), { ok: true })
    assert.deepEqual(gateway.handleCanvasCursorLeave(inside.client as any, { canvasId: 'c1' }), { ok: true })
    assert.deepEqual(inside.sent.map(([room, e]) => [room, e.type, e.displayName ?? null]), [
      ['canvas:c1', 'canvas.cursor', 'Rev Member'],
      ['canvas:c1', 'canvas.cursor', 'Rev Member'],
      ['canvas:c1', 'canvas.cursor.leave', null],
    ])
    assert.equal(reads(), 1, 'the name is read once a socket')
  })
})

describe('RealtimeGateway — a call reaction comes from, and goes to, those who may read its channel', () => {
  const CALL = 'c4444444-4444-4444-8444-444444444444'
  it('relays a reaction from one of the channel’s readers to them alone, under the call’s workspace whatever the body names, and refuses anyone else', async () => {
    const { gateway, heard } = gatewayAnswering([])
    ;(gateway as any).callReaders = async () => ({ workspaceId: 'w1', workspace: false, users: ['u1', 'u2'] })
    const outsider = sending('u3', ['s3'])
    assert.deepEqual(await gateway.handleCallReaction(outsider.client as any, { callId: CALL, workspaceId: 'w1', emoji: 'x' }), { ok: false })
    assert.equal(heard.length, 0, 'nothing from somebody the channel does not let read it')
    const peer = sending('u2', ['s2'])
    assert.deepEqual(await gateway.handleCallReaction(peer.client as any, { callId: CALL, workspaceId: 'w-other', emoji: '👍' }), { ok: true })
    assert.deepEqual(heard.map(([room, e]) => [room, e.workspaceId, e.userId, e.emoji]), [
      ['user:u1', 'w1', 'u2', '👍'],
      ['user:u2', 'w1', 'u2', '👍'],
    ])
  })

  it('where the whole workspace reads the channel, a member reacts into its room and a guest or somebody outside it does not', async () => {
    const cases: Array<[unknown[], boolean]> = [[[{ role: 'member' }], true], [[{ role: 'guest' }], false], [[], false]]
    for (const [membership, ok] of cases) {
      const { gateway, heard } = gatewayAnswering(membership)
      ;(gateway as any).callReaders = async () => ({ workspaceId: 'w1', workspace: true, users: [] })
      const who = sending('u5', ['s5'])
      assert.deepEqual(await gateway.handleCallReaction(who.client as any, { callId: CALL, emoji: 'x' }), { ok })
      assert.deepEqual(heard.map(([room]) => room), ok ? ['workspace:w1'] : [], JSON.stringify(membership))
    }
  })

  it('refuses a reaction to no call, or to an id that is not one, without asking the database', async () => {
    const { gateway, heard, reads } = gatewayAnswering([])
    const who = sending('u1', ['s1'])
    assert.deepEqual(await gateway.handleCallReaction(who.client as any, { callId: 'not-a-call', emoji: 'x' }), { ok: false })
    assert.equal(reads(), 0)
    assert.deepEqual(await gateway.handleCallReaction(who.client as any, { callId: CALL, emoji: 'x' }), { ok: false })
    assert.equal(heard.length, 0)
  })
})
