import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
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
    const unheard = await unheardRejectionsDuring(async () => {
      gateway.afterInit()
      try {
        t.mock.timers.tick((RealtimeGateway as any).REVOKED_SWEEP_MS)
      } finally {
        gateway.onModuleDestroy()
      }
    })
    assert.deepEqual(unheard.map((r) => String((r as Error)?.message ?? r)), [], 'the timer left a failed sweep unheard (it would end the process)')
  })
})
