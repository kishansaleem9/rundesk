import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { UsersService } from './users.service'

// §13.1 — the theme preference persists cross-device via PATCH /users/me, so the
// service validates it against the allowed set and writes it through.
describe('UsersService.updateProfile — theme persistence (§13.1)', () => {
  it('rejects an unsupported theme', async () => {
    const svc = new UsersService({} as any, {} as any)
    await assert.rejects(() => svc.updateProfile('u', { theme: 'neon' }), /Unsupported theme/)
  })

  it('accepts a valid theme, persists it, and strips the password hash', async () => {
    let captured: any = null
    const db = {
      update: () => ({
        set: (vals: any) => {
          captured = vals
          return {
            where: () => ({
              returning: async () => [
                { id: 'u', email: 'a@b.c', displayName: 'A', theme: vals.theme, passwordHash: 'secret' },
              ],
            }),
          }
        },
      }),
    } as any
    const svc = new UsersService(db, {} as any)
    const res = (await svc.updateProfile('u', { theme: 'dark' })) as any
    assert.equal(captured.theme, 'dark')
    assert.equal(res.theme, 'dark')
    assert.ok(!('passwordHash' in res))
  })
})
