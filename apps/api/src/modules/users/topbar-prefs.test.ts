import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { UsersService, TOPBAR_ITEMS } from './users.service'

/**
 * §1.5 — "yeh option jo hai woh humare members ke paas hona chahiye … Lekin
 * humare paas NAV BAR ko set down karne ka option nahi hai."
 *
 * topbarHidden is a jsonb column whose value comes straight from the client,
 * so the two things worth pinning are what it accepts and what it refuses.
 * updateProfile already carries a comment about a mass-assignment bug found here
 * once — an unvalidated array on a jsonb column is a place to park arbitrary
 * data on your own user row, and the column is read back on every page load.
 */

function fakeDb(onSet: (set: Record<string, unknown>) => void) {
  return {
    update: () => ({
      set: (values: Record<string, unknown>) => {
        onSet(values)
        return {
          where: () => ({
            returning: async () => [
              { id: 'u1', email: 'a@b.c', displayName: 'A', passwordHash: 'secret', ...values },
            ],
          }),
        }
      },
    }),
  }
}

const service = () => {
  const writes: Record<string, unknown>[] = []
  const svc = new UsersService(fakeDb((v) => writes.push(v)) as never, {} as never)
  return { svc, writes }
}

describe('top bar preferences (§1.5)', () => {
  it('stores the items a member puts away', async () => {
    const { svc, writes } = service()
    await svc.updateProfile('u1', { topbarHidden: ['notifications', 'timer'] })
    assert.deepEqual(writes[0].topbarHidden, ['notifications', 'timer'])
  })

  it('lets a member put the bell back', async () => {
    const { svc, writes } = service()
    await svc.updateProfile('u1', { topbarHidden: [] })
    assert.deepEqual(writes[0].topbarHidden, [], 'an empty set means everything is shown')
  })

  it('refuses an item the top bar does not have', async () => {
    const { svc } = service()
    await assert.rejects(
      () => svc.updateProfile('u1', { topbarHidden: ['notifications', 'not-a-control'] }),
      /Unknown top bar item/,
    )
  })

  it('refuses a non-array, which is what a jsonb column would otherwise swallow', async () => {
    const { svc } = service()
    await assert.rejects(
      () => svc.updateProfile('u1', { topbarHidden: { evil: true } as never }),
      /must be an array/,
    )
  })

  it('de-duplicates, so the stored value is a set and not a log of clicks', async () => {
    const { svc, writes } = service()
    await svc.updateProfile('u1', { topbarHidden: ['theme', 'theme', 'theme'] })
    assert.deepEqual(writes[0].topbarHidden, ['theme'])
  })

  it('does not let this field become a way to write other columns', async () => {
    const { svc, writes } = service()
    await svc.updateProfile('u1', {
      topbarHidden: ['theme'],
      role: 'super_admin',
      passwordHash: 'x',
    } as never)
    assert.equal(writes[0].role, undefined, 'role is not self-editable')
    assert.equal(writes[0].passwordHash, undefined)
  })

  it('offers every optional control, and neither search nor the user menu', () => {
    assert.deepEqual([...TOPBAR_ITEMS].sort(), ['ai', 'create', 'notifications', 'theme', 'timer'])
    assert.ok(!(TOPBAR_ITEMS as readonly string[]).includes('search'))
    assert.ok(!(TOPBAR_ITEMS as readonly string[]).includes('userMenu'))
  })
})
