import { NotFoundException } from '@nestjs/common'
import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { DashboardsService } from './dashboards.service'

/**
 * §5.7 — Workspace-default dashboard (`dashboard.workspace_default.manage`).
 *
 * The service is exercised against a minimal chainable drizzle mock, following
 * the same idiom as the other *.service.test.ts files. `selectQueue` feeds one
 * result-set per `select(...).from(...).where(...)` call (in order); update
 * `.set(...)` arguments are captured so we can assert what was written.
 */
function buildDb(opts: { selectQueue?: any[][]; updateReturning?: any[] } = {}) {
  const selectQueue = [...(opts.selectQueue ?? [])]
  const updateReturning = [...(opts.updateReturning ?? [])]
  const updateSets: any[] = []

  // Thenable so `await select().from().where()` resolves, while still exposing
  // `.limit()` for the callers that page down to a single row.
  const chainable = (rows: any[]) => ({
    then: (resolve: (v: any) => void, reject?: (e: any) => void) =>
      Promise.resolve(rows).then(resolve, reject),
    limit: mock.fn(async () => rows),
  })

  const db = {
    select: mock.fn(() => ({
      from: mock.fn(() => {
        const where = mock.fn(() => chainable(selectQueue.shift() ?? []))
        // listPresets joins the owner in, so `from(...)` must also accept a
        // leftJoin before the where.
        return { where, leftJoin: mock.fn(() => ({ where })) }
      }),
    })),
    update: mock.fn(() => ({
      set: mock.fn((arg: any) => {
        updateSets.push(arg)
        return {
          where: mock.fn(() => ({
            // Awaitable for clear-style updates (no `.returning()`)...
            then: (resolve: (v: any) => void, reject?: (e: any) => void) =>
              Promise.resolve(undefined).then(resolve, reject),
            // ...and `.returning()` for the update that reads the row back.
            returning: mock.fn(async () => [updateReturning.shift() ?? {}]),
          })),
        }
      }),
    })),
  } as any

  return { db, updateSets }
}

const WS = 'ws-1'
const PRESET = 'preset-1'

describe('DashboardsService.setWorkspaceDefault', () => {
  /*
   * Who may set it is the route's (`dashboard.workspace_default.manage`, asked by
   * `PermissionsGuard`), so the service asks no role: the cases that expected a
   * member or a non-member to be refused here encoded the old admin-role rule.
   * What it asks is WHICH preset: one its setter reads (own, shared, or already
   * the default), since the default is listed to every member.
   */
  it('marks the target and clears the workspace-default on every other preset', async () => {
    const { db, updateSets } = buildDb({
      selectQueue: [
        [{ id: PRESET, workspaceId: WS, userId: 'setter', isWorkspaceDefault: false }], // the setter's own
      ],
      updateReturning: [{ id: PRESET, isWorkspaceDefault: true }],
    })
    const svc = new DashboardsService(db)

    const result = await svc.setWorkspaceDefault(WS, PRESET, { id: 'setter', role: 'member' })

    assert.equal(result.isWorkspaceDefault, true)
    // Two writes: first clears others, then sets the target.
    assert.equal(updateSets.length, 2)
    assert.equal(updateSets[0].isWorkspaceDefault, false)
    assert.equal(updateSets[1].isWorkspaceDefault, true)
  })

  it('asks no role: a member (the key is the guard\'s) sets their own without a membership lookup', async () => {
    const { db, updateSets } = buildDb({
      // One select only, the preset: no membership row is consulted.
      selectQueue: [[{ id: PRESET, workspaceId: WS, userId: 'granted', isWorkspaceDefault: false }]],
      updateReturning: [{ id: PRESET, isWorkspaceDefault: true }],
    })
    const svc = new DashboardsService(db)

    const result = await svc.setWorkspaceDefault(WS, PRESET, { id: 'granted', role: 'member' })

    assert.equal(result.isWorkspaceDefault, true)
    assert.equal(db.select.mock.callCount(), 1)
    assert.equal(updateSets.length, 2)
  })

  it('accepts a colleague\'s preset shared with the setter', async () => {
    const { db, updateSets } = buildDb({
      selectQueue: [
        [{ id: PRESET, workspaceId: WS, userId: 'colleague', isWorkspaceDefault: false }],
        [{ objectId: PRESET }], // object_shares: granted to the setter
      ],
      updateReturning: [{ id: PRESET, isWorkspaceDefault: true }],
    })
    const svc = new DashboardsService(db)

    const result = await svc.setWorkspaceDefault(WS, PRESET, { id: 'setter', role: 'member' })

    assert.equal(result.isWorkspaceDefault, true)
    assert.equal(updateSets.length, 2)
  })

  it('accepts the preset that is already the default, whoever owns it', async () => {
    const { db } = buildDb({
      selectQueue: [[{ id: PRESET, workspaceId: WS, userId: 'colleague', isWorkspaceDefault: true }]],
      updateReturning: [{ id: PRESET, isWorkspaceDefault: true }],
    })
    const svc = new DashboardsService(db)

    const result = await svc.setWorkspaceDefault(WS, PRESET, { id: 'setter', role: 'member' })

    assert.equal(result.isWorkspaceDefault, true)
  })

  it('404s a colleague\'s preset neither shared with the setter nor the default, and writes nothing', async () => {
    const { db, updateSets } = buildDb({
      selectQueue: [
        [{ id: PRESET, workspaceId: WS, userId: 'colleague', isWorkspaceDefault: false }],
        [{ objectId: 'some-other-preset' }], // shared with them, but not this one
      ],
    })
    const svc = new DashboardsService(db)

    await assert.rejects(
      () => svc.setWorkspaceDefault(WS, PRESET, { id: 'setter', role: 'member' }),
      (e) => e instanceof NotFoundException,
    )
    assert.equal(updateSets.length, 0)
  })

  it('404s a colleague\'s unshared preset for a platform super-admin too (the list shows them no more)', async () => {
    const { db, updateSets } = buildDb({
      selectQueue: [
        [{ id: PRESET, workspaceId: WS, userId: 'colleague', isWorkspaceDefault: false }],
        [],
      ],
    })
    const svc = new DashboardsService(db)

    await assert.rejects(
      () => svc.setWorkspaceDefault(WS, PRESET, { id: 'root', role: 'super_admin' }),
      (e) => e instanceof NotFoundException,
    )
    assert.equal(updateSets.length, 0)
  })

  it('404s when the preset is not in the workspace', async () => {
    const { db } = buildDb({
      selectQueue: [
        [], // preset lookup misses
      ],
    })
    const svc = new DashboardsService(db)

    await assert.rejects(
      () => svc.setWorkspaceDefault(WS, PRESET, { id: 'admin', role: 'member' }),
      (e) => e instanceof NotFoundException,
    )
  })
})

describe('DashboardsService.getDefaultPreset', () => {
  it("returns the user's own default when they have one (wins over the workspace default)", async () => {
    const { db } = buildDb({
      selectQueue: [[{ id: 'mine', isDefault: true }]], // personal default found
    })
    const svc = new DashboardsService(db)

    const result = await svc.getDefaultPreset('u', WS)

    assert.equal(result?.id, 'mine')
  })

  it('falls back to the workspace default when the user has no personal default', async () => {
    const { db } = buildDb({
      selectQueue: [
        [], // no personal default
        [{ id: 'ws-default', isWorkspaceDefault: true }], // workspace default
      ],
    })
    const svc = new DashboardsService(db)

    const result = await svc.getDefaultPreset('u', WS)

    assert.equal(result?.id, 'ws-default')
  })

  it('returns null when neither a personal nor a workspace default exists', async () => {
    const { db } = buildDb({ selectQueue: [[], []] })
    const svc = new DashboardsService(db)

    const result = await svc.getDefaultPreset('u', WS)

    assert.equal(result, null)
  })
})

describe('DashboardsService.listPresets', () => {
  it('returns the workspace-default preset alongside the user’s own', async () => {
    const rows = [
      { id: 'mine', userId: 'u', isWorkspaceDefault: false },
      { id: 'ws-default', userId: 'admin', isWorkspaceDefault: true },
    ]
    // First select resolves the object_shares grants, second the presets.
    const { db } = buildDb({ selectQueue: [[], rows] })
    const svc = new DashboardsService(db)

    const result = await svc.listPresets('u', WS)

    assert.equal(result.length, 2)
    assert.ok(result.some((p: any) => p.isWorkspaceDefault === true))
  })

  // A5.11 — a grant in object_shares is the only thing behind "Shared with me".
  it('flags ownership and shared-with-me from the share grants', async () => {
    const rows = [
      { id: 'mine', userId: 'u', isWorkspaceDefault: false },
      { id: 'theirs', userId: 'other', isWorkspaceDefault: false },
    ]
    const { db } = buildDb({ selectQueue: [[{ objectId: 'theirs' }], rows] })
    const svc = new DashboardsService(db)

    const result = await svc.listPresets('u', WS)

    assert.deepEqual(
      result.map((p: any) => [p.id, p.isOwner, p.isSharedWithMe]),
      [
        ['mine', true, false],
        ['theirs', false, true],
      ],
    )
  })
})

describe('DashboardsService.clearWorkspaceDefault', () => {
  it('clears the workspace-default flag and reports ok', async () => {
    const { db, updateSets } = buildDb()
    const svc = new DashboardsService(db)

    const result = await svc.clearWorkspaceDefault(WS)

    assert.deepEqual(result, { ok: true })
    assert.equal(updateSets.length, 1)
    assert.equal(updateSets[0].isWorkspaceDefault, false)
  })
})
