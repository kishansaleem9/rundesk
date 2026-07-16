import { ForbiddenException, NotFoundException } from '@nestjs/common'
import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { DashboardsService } from './dashboards.service'

/**
 * §5.7 — Workspace-default dashboard for admins.
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
      from: mock.fn(() => ({
        where: mock.fn(() => chainable(selectQueue.shift() ?? [])),
      })),
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
  it('marks the target and clears the workspace-default on every other preset', async () => {
    const { db, updateSets } = buildDb({
      selectQueue: [
        [{ role: 'workspace_admin' }], // assertWorkspaceAdmin membership lookup
        [{ id: PRESET, workspaceId: WS }], // preset existence check
      ],
      updateReturning: [{ id: PRESET, isWorkspaceDefault: true }],
    })
    const svc = new DashboardsService(db)

    const result = await svc.setWorkspaceDefault(WS, PRESET, { id: 'admin', role: 'member' })

    assert.equal(result.isWorkspaceDefault, true)
    // Two writes: first clears others, then sets the target.
    assert.equal(updateSets.length, 2)
    assert.equal(updateSets[0].isWorkspaceDefault, false)
    assert.equal(updateSets[1].isWorkspaceDefault, true)
  })

  it('allows a global super_admin without a membership lookup', async () => {
    const { db, updateSets } = buildDb({
      // No membership row queued — the super_admin branch must not consult it.
      selectQueue: [[{ id: PRESET, workspaceId: WS }]],
      updateReturning: [{ id: PRESET, isWorkspaceDefault: true }],
    })
    const svc = new DashboardsService(db)

    const result = await svc.setWorkspaceDefault(WS, PRESET, { id: 'root', role: 'super_admin' })

    assert.equal(result.isWorkspaceDefault, true)
    assert.equal(updateSets.length, 2)
  })

  it('rejects a non-admin member', async () => {
    const { db } = buildDb({ selectQueue: [[{ role: 'member' }]] })
    const svc = new DashboardsService(db)

    await assert.rejects(
      () => svc.setWorkspaceDefault(WS, PRESET, { id: 'u', role: 'member' }),
      (e) => e instanceof ForbiddenException,
    )
  })

  it('rejects a non-member (no membership row)', async () => {
    const { db } = buildDb({ selectQueue: [[]] })
    const svc = new DashboardsService(db)

    await assert.rejects(
      () => svc.setWorkspaceDefault(WS, PRESET, { id: 'outsider', role: 'member' }),
      (e) => e instanceof ForbiddenException,
    )
  })

  it('404s when the preset is not in the workspace', async () => {
    const { db } = buildDb({
      selectQueue: [
        [{ role: 'workspace_admin' }], // passes the admin gate
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
    const { db } = buildDb({ selectQueue: [rows] })
    const svc = new DashboardsService(db)

    const result = await svc.listPresets('u', WS)

    assert.equal(result.length, 2)
    assert.ok(result.some((p: any) => p.isWorkspaceDefault === true))
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
