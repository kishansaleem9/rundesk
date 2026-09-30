import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { ForbiddenException } from '@nestjs/common'
import { InvitationsController } from './invitations.controller'

/*
 * ACCEPTING AN INVITATION SIGNS THE PERSON IN AS SIGN-UP DOES
 * (`found-30-sep/an-accepted-invitation-sets-no-cookies`): the session is set
 * as the three cookies on the claim's answer, as `AuthController` sets
 * sign-up's. And WHO IS CLAIMING is read as every route behind `JwtAuthGuard`
 * reads it (`found-30-sep/revoked-sessions-keep-their-access-tokens`): the
 * access cookie, then the Bearer header, verified, its session live. A lane
 * claims both ways in `sign-in-and-password.mjs`, and a browser reloads after
 * accepting in `session-in-the-browser.mjs`.
 */
const SESSION = '5d2f8a1c-7b3e-4a9d-8c6f-1e2d3c4b5a69'

function controllerWith({ verify = (_token: string): unknown => ({ sub: 'u1', sid: SESSION }), live = true } = {}) {
  const claimedAs: Array<string | undefined> = []
  const invitationsService = {
    claim: async (_dto: unknown, currentUserId?: string) => {
      claimedAs.push(currentUserId)
      return { userId: currentUserId ?? 'u-new' }
    },
  }
  const authService = {
    issueSessionForUserId: async (userId: string) => ({ accessToken: 'ACCESS-JWT', refreshToken: 'REFRESH-JWT', user: { id: userId }, workspaces: [], organizations: [] }),
  }
  const jwtService = { verify: mock.fn((token: string) => verify(token)) }
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ userId: 'u1', isRevoked: !live, expiresAt: new Date(Date.now() + 60_000) }] }) }) }),
  }
  const config = { get: (key: string) => (key === 'NODE_ENV' ? 'test' : undefined) }
  const controller = new InvitationsController(invitationsService as any, authService as any, jwtService as any, db, {} as any, config as any)
  return { controller, claimedAs, jwtService }
}
function reply() {
  const set: Record<string, { value: string; options: Record<string, unknown> }> = {}
  return { set, res: { setCookie: (name: string, value: string, options: Record<string, unknown>) => { set[name] = { value, options } }, clearCookie: () => undefined } }
}
const request = (headers: Record<string, string> = {}, cookies: Record<string, string> = {}) => ({ headers: { 'user-agent': 'ua', ...headers }, cookies, ip: '10.0.0.1' })

describe('InvitationsController.claim — the session set as cookies, and the claimant read as every route reads one', () => {
  it('the claim sets the session cookies sign-up sets on its answer (access_token, refresh_token, csrf_token), and answers the session too', async () => {
    const { controller } = controllerWith()
    const { set, res } = reply()
    const bundle = await controller.claim({ token: 't', fullName: 'New', password: 'New@12345!x' }, request(), res as any)
    assert.equal(bundle.accessToken, 'ACCESS-JWT')
    assert.deepEqual(Object.keys(set).sort(), ['access_token', 'csrf_token', 'refresh_token'])
    assert.equal(set.access_token.value, 'ACCESS-JWT')
    assert.equal(set.refresh_token.value, 'REFRESH-JWT')
    assert.equal(set.access_token.options.httpOnly, true)
    assert.equal(set.refresh_token.options.httpOnly, true)
    assert.equal(set.csrf_token.options.httpOnly, false, 'the CSRF cookie is read by the page')
    assert.equal(set.access_token.options.path, '/')
  })

  it('the claimant is read from the access cookie as from the Bearer header, only while its session is live, and a token that does not verify is refused', async () => {
    const byCookie = controllerWith()
    await byCookie.controller.claim({ token: 't' }, request({}, { access_token: 'COOKIE-JWT' }), reply().res as any)
    const byBearer = controllerWith()
    await byBearer.controller.claim({ token: 't' }, request({ authorization: 'Bearer BEARER-JWT' }), reply().res as any)
    const ended = controllerWith({ live: false })
    await ended.controller.claim({ token: 't' }, request({}, { access_token: 'ENDED-JWT' }), reply().res as any)
    const nobody = controllerWith()
    await nobody.controller.claim({ token: 't', fullName: 'New', password: 'New@12345!x' }, request(), reply().res as any)
    assert.deepEqual([...byCookie.claimedAs, ...byBearer.claimedAs, ...ended.claimedAs, ...nobody.claimedAs], ['u1', 'u1', undefined, undefined])
    assert.deepEqual(byCookie.jwtService.verify.mock.calls[0].arguments, ['COOKIE-JWT'])
    const forged = controllerWith({ verify: () => { throw new Error('invalid signature') } })
    await assert.rejects(
      () => forged.controller.claim({ token: 't' }, request({ authorization: 'Bearer FORGED' }), reply().res as any),
      (err: unknown) => err instanceof ForbiddenException && err.message === 'Invalid access token',
    )
    assert.deepEqual(forged.claimedAs, [], 'nothing claimed')
  })
})
