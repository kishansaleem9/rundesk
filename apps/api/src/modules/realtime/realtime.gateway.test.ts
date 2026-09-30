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
