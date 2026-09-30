import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { UsersController } from './users.controller'

/*
 * THE CALLER'S OWN SESSION, KEPT THROUGH A PASSWORD CHANGE
 * (`found-30-sep/password-change-unthrottled`). A change revokes every other
 * session of the account; which one is the caller's is what its refresh token
 * names: a browser sends it as its refresh cookie, and a client with no cookie
 * (a session begun by accepting an invitation has none) in the body, as "sign
 * out other sessions" takes it. `sign-in-and-password.mjs` changes a password
 * both ways on a lane.
 */
describe('UsersController.changePassword — the session it keeps is the caller’s', () => {
  const caller = { id: 'u1' } as any
  function controllerRecording() {
    const changePassword = mock.fn(async () => ({ ok: true, revoked: 0 }))
    return { controller: new UsersController({ changePassword } as any), changePassword }
  }

  it('a browser’s session is the one its refresh cookie names, when the body names none', async () => {
    const { controller, changePassword } = controllerRecording()
    await controller.changePassword(caller, { currentPassword: 'Old@12345!', newPassword: 'New@12345!x' }, { cookies: { refresh_token: 'COOKIE-REFRESH' } })
    assert.deepEqual(changePassword.mock.calls[0].arguments, ['u1', 'Old@12345!', 'New@12345!x', 'COOKIE-REFRESH'])
  })

  it('a session named in the body is the one kept, cookie or no cookie; with neither, none is', async () => {
    const { controller, changePassword } = controllerRecording()
    await controller.changePassword(caller, { currentPassword: 'a', newPassword: 'b', currentRefreshToken: 'BODY-REFRESH' }, { cookies: { refresh_token: 'COOKIE-REFRESH' } })
    await controller.changePassword(caller, { currentPassword: 'a', newPassword: 'b' }, {})
    await controller.changePassword(caller, { currentPassword: 'a', newPassword: 'b', currentRefreshToken: 42 as any }, {})
    assert.deepEqual(changePassword.mock.calls.map((c) => (c.arguments as unknown[])[3]), ['BODY-REFRESH', null, null])
  })
})
