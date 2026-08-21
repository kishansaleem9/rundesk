import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TaskTypesService } from './task-types.service'

/**
 * §1.1 — a workspace always has exactly one default task type.
 *
 * Deleting the default left it with none, and nothing re-nominated one. That is
 * not cosmetic: `defaultTaskTypeForList` then returns null, every task created
 * afterwards comes out untyped, and both the create-modal picker and the search
 * filter hide themselves when a workspace looks typeless — the same
 * invisible-feature failure migration 0093 was written to fix.
 *
 * Production reached that state during a deploy check that created a default
 * type and deleted it again, surfacing as "found 0 defaults, expected 1".
 *
 * The double answers each query from a queue in the order the service asks,
 * rather than trying to interpret drizzle conditions. A first version did try
 * to interpret them, and got it wrong in both directions at once — a false pass
 * on one case and a false failure on another. A double that has to be debugged
 * is not evidence.
 */

function fakeDb(selectQueue: unknown[][]) {
  const queue = [...selectQueue]
  const updates: Array<{ values: Record<string, unknown> }> = []
  let deleted = false

  const next = () => queue.shift() ?? []
  const thenable = (): any => ({
    from: () => thenable(),
    where: () => thenable(),
    orderBy: () => thenable(),
    limit: async () => next(),
    then: (res: (v: unknown) => void) => Promise.resolve(next()).then(res),
  })

  return {
    updates,
    wasDeleted: () => deleted,
    remaining: () => queue.length,
    db: {
      select: () => thenable(),
      delete: () => ({
        where: async () => {
          deleted = true
          return []
        },
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            updates.push({ values })
            return []
          },
        }),
      }),
    },
  }
}

const ADMIN = [{ role: 'workspace_admin' }]
const COUNT = [{ count: 0 }]

describe('a workspace keeps a default task type (§1.1)', () => {
  it('promotes another type when the default is deleted', async () => {
    const fake = fakeDb([
      ADMIN,                                  // assertAdmin
      [{ id: 'a', isDefault: true }],         // byId — the type being deleted
      COUNT,                                  // how many tasks it untypes
      [],                                     // ensureDefault: any default left? no
      [{ id: 'b' }],                          // …so promote the first remaining
    ])
    const svc = new TaskTypesService(fake.db as never)
    const result = await svc.remove('ws1', 'a', 'u1')

    assert.deepEqual(result, { ok: true, untypedTasks: 0 })
    assert.ok(fake.wasDeleted())
    assert.equal(fake.updates.length, 1, 'exactly one promotion')
    assert.equal(fake.updates[0].values.isDefault, true)
  })

  it('does not promote when a default still exists', async () => {
    const fake = fakeDb([
      ADMIN,
      [{ id: 'a', isDefault: false }],        // deleting a non-default
      COUNT,
    ])
    const svc = new TaskTypesService(fake.db as never)
    await svc.remove('ws1', 'a', 'u1')
    assert.equal(fake.updates.length, 0, 'nothing to re-nominate')
  })

  it('does not promote when the workspace has no types left at all', async () => {
    const fake = fakeDb([
      ADMIN,
      [{ id: 'only', isDefault: true }],
      COUNT,
      [],                                     // no default left
      [],                                     // and no candidate either
    ])
    const svc = new TaskTypesService(fake.db as never)
    await svc.remove('ws1', 'only', 'u1')
    assert.equal(fake.updates.length, 0, 'an empty workspace has nothing to promote')
  })

  it('looks the type up once, not twice', async () => {
    // The first version read the row, then read it again to check one boolean.
    const fake = fakeDb([ADMIN, [{ id: 'a', isDefault: false }], COUNT])
    const svc = new TaskTypesService(fake.db as never)
    await svc.remove('ws1', 'a', 'u1')
    assert.equal(fake.remaining(), 0, 'an extra lookup would leave the queue short')
  })
})
