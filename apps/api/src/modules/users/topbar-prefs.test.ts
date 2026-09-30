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
  const svc = new UsersService(fakeDb((v) => writes.push(v)) as never, {} as never, {} as never)
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

  it('never offers search or the user menu, whatever else it grows to hold', () => {
    // The half of this worth keeping. One is how you find anything and the
    // other is how you reach the setting that governs this row, so making
    // either hideable is a trap the member cannot get out of.
    assert.ok(!(TOPBAR_ITEMS as readonly string[]).includes('search'))
    assert.ok(!(TOPBAR_ITEMS as readonly string[]).includes('userMenu'))
  })

  /*
   * This used to assert the catalogue was exactly those five. That was right
   * under §1.5, where the list was "the controls a member may put away", and it
   * is wrong under §6, where the list is "the tools a member may pin" — and
   * where [08:29] is the objection to a short list we chose: "as compared to
   * hum limited de dein ke okay, theek hai, something ke hum ne rakha hai aur
   * woh us ko choose karna parega."
   *
   * So it is replaced rather than deleted, by the invariant that actually
   * matters now: everything she named is offerable.
   */
  it('offers every tool she pins at [07:55]–[08:03]', () => {
    for (const tool of [
      'create',      // "yeh task creation ka option hai"
      'timer',       // "yeh timing ka option"
      'docs',        // "yeh document ka"
      'clips',       // "yeh Loom ka"
      'recordings',  // "yeh voice recordings ka"
      'whiteboards', // "yeh whiteboards ka"
      'dashboards',  // "aur yeh dashboard ka option hai"
    ]) {
      assert.ok(
        (TOPBAR_ITEMS as readonly string[]).includes(tool),
        `${tool} is not pinnable, but she names it`,
      )
    }
  })

  it('validates a pinned list the same way it validates a hidden one', async () => {
    // Same jsonb column hazard: unvalidated, it is a place to park arbitrary
    // data on a user row through a field the client controls.
    const { svc } = service()
    await assert.rejects(
      () => svc.updateProfile('u1', { topbarPinned: ['docs', 'not-a-control'] }),
      /Unknown top bar item/,
    )
    await assert.rejects(
      () => svc.updateProfile('u1', { topbarPinned: { evil: true } as never }),
      /must be an array/,
    )
  })

  it('de-duplicates a pinned list, so it stores a set and not a log of clicks', async () => {
    const { svc, writes } = service()
    await svc.updateProfile('u1', { topbarPinned: ['docs', 'docs', 'timer'] })
    assert.deepEqual(writes[0].topbarPinned, ['docs', 'timer'])
  })
})
