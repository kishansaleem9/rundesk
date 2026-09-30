import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { AuthController } from './auth.controller'

/*
 * "SIGN OUT OTHER SESSIONS" KEEPS THE CALLER'S: the one its refresh token
 * names, in the body or as a browser's refresh cookie, as the password change
 * reads it. The body alone was read, and the web keeps its refresh token in
 * memory only, so after a reload the browser's own session was revoked too;
 * with a revoked session refused at once
 * (`found-30-sep/revoked-sessions-keep-their-access-tokens`) that would sign
 * the person out. `sign-in-and-password.mjs` signs the others out as a browser.
 */
describe('AuthController.revokeOthers — the session it keeps is the caller’s', () => {
  it('“Sign out other sessions” keeps the session a browser’s refresh cookie names when the body names none, and one named in the body first', async () => {
    const revokeOtherSessions = mock.fn(async () => ({ revoked: 0 }))
    const controller = new AuthController({ revokeOtherSessions } as any, {} as any)
    const caller = { id: 'u1' }
    await controller.revokeOthers(caller, {}, { cookies: { refresh_token: 'COOKIE-REFRESH' } } as any)
    await controller.revokeOthers(caller, { currentRefreshToken: 'BODY-REFRESH' }, { cookies: { refresh_token: 'COOKIE-REFRESH' } } as any)
    await controller.revokeOthers(caller, {}, {} as any)
    assert.deepEqual(
      revokeOtherSessions.mock.calls.map((c) => c.arguments),
      [['u1', 'COOKIE-REFRESH'], ['u1', 'BODY-REFRESH'], ['u1', null]],
    )
  })
})
