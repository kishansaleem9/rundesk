import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { ForbiddenException, BadRequestException } from '@nestjs/common'
import { workspaces, workspaceMembers, projects } from '@rundesk/db'
import { PlansService } from './plans.service'

/**
 * A drizzle-shaped mock DB that resolves each select by the table passed to
 * `.from()` — robust against call ordering. `plan`/`members`/`projects` seed the
 * three read paths PlansService uses.
 */
function makeDb(opts: {
  plan?: string
  planLimits?: unknown
  members?: number
  projects?: number
  updateReturning?: any[]
} = {}) {
  const db: any = {
    select: () => {
      const chain: any = { _table: null }
      chain.from = (t: any) => {
        chain._table = t
        return chain
      }
      chain.innerJoin = () => chain
      chain.where = () => chain
      chain.limit = () => chain
      chain.orderBy = () => chain
      chain.then = (resolve: any) => {
        if (chain._table === workspaces) return resolve([{ plan: opts.plan ?? 'enterprise', planLimits: opts.planLimits ?? null }])
        if (chain._table === workspaceMembers) return resolve([{ c: opts.members ?? 0 }])
        if (chain._table === projects) return resolve([{ c: opts.projects ?? 0 }])
        return resolve([])
      }
      return chain
    },
    update: () => ({
      set: () => ({ where: () => ({ returning: async () => opts.updateReturning ?? [{ id: 'ws-1' }] }) }),
    }),
  }
  return db
}

describe('PlansService.assertFeature (AI gate)', () => {
  it('enterprise passes the AI gate (no regression)', async () => {
    const svc = new PlansService(makeDb({ plan: 'enterprise' }))
    await svc.assertFeature('ws', 'ai') // resolves
  })

  it('free plan is denied AI with a 403', async () => {
    const svc = new PlansService(makeDb({ plan: 'free' }))
    await assert.rejects(() => svc.assertFeature('ws', 'ai'), ForbiddenException)
  })

  it('hasFeature reflects the tier', async () => {
    assert.equal(await new PlansService(makeDb({ plan: 'enterprise' })).hasFeature('ws', 'ai'), true)
    assert.equal(await new PlansService(makeDb({ plan: 'free' })).hasFeature('ws', 'ai'), false)
  })
})

describe('PlansService.assertCanAddMembers (member limit on invite)', () => {
  it('enterprise never runs the count (unlimited) — always allowed', async () => {
    // members intentionally huge; unlimited plan must still pass.
    const svc = new PlansService(makeDb({ plan: 'enterprise', members: 9999 }))
    await svc.assertCanAddMembers('ws')
  })

  it('free plan allows adding up to the cap', async () => {
    // 4 members, cap 5, adding 1 => 5 <= 5 OK.
    const svc = new PlansService(makeDb({ plan: 'free', members: 4 }))
    await svc.assertCanAddMembers('ws')
  })

  it('free plan blocks the member that would exceed the cap', async () => {
    // 5 members, cap 5, adding 1 => 6 > 5 => 403.
    const svc = new PlansService(makeDb({ plan: 'free', members: 5 }))
    await assert.rejects(() => svc.assertCanAddMembers('ws'), ForbiddenException)
  })
})

describe('PlansService.assertCanCreateProjects (project limit on create)', () => {
  it('enterprise is unlimited', async () => {
    const svc = new PlansService(makeDb({ plan: 'enterprise', projects: 9999 }))
    await svc.assertCanCreateProjects('ws')
  })

  it('free plan blocks the project beyond the cap of 3', async () => {
    const svc = new PlansService(makeDb({ plan: 'free', projects: 3 }))
    await assert.rejects(() => svc.assertCanCreateProjects('ws'), ForbiddenException)
  })
})

describe('PlansService.getUsage (plan card payload)', () => {
  it('returns plan id, limits, features and live usage counts', async () => {
    const svc = new PlansService(makeDb({ plan: 'free', members: 2, projects: 1 }))
    const usage = await svc.getUsage('ws')
    assert.equal(usage.plan, 'free')
    assert.equal(usage.limits.maxMembers, 5)
    assert.equal(usage.limits.maxProjects, 3)
    assert.equal(usage.features.ai, false)
    assert.deepEqual(usage.usage, { members: 2, projects: 1 })
    assert.equal(usage.catalog.length, 4)
  })

  it('enterprise usage reports unlimited limits (null)', async () => {
    const svc = new PlansService(makeDb({ plan: 'enterprise', members: 12, projects: 40 }))
    const usage = await svc.getUsage('ws')
    assert.equal(usage.plan, 'enterprise')
    assert.equal(usage.limits.maxMembers, null)
    assert.equal(usage.features.ai, true)
    assert.deepEqual(usage.usage, { members: 12, projects: 40 })
  })
})

describe('PlansService.setWorkspacePlan (super-admin action)', () => {
  it('rejects an unknown plan id', async () => {
    const svc = new PlansService(makeDb())
    await assert.rejects(() => svc.setWorkspacePlan('ws', 'platinum'), BadRequestException)
  })

  it('accepts a valid plan id and returns the fresh usage snapshot', async () => {
    // After the update, getUsage reads the (mocked) workspace as 'free'.
    const svc = new PlansService(makeDb({ plan: 'free', members: 0, projects: 0 }))
    const usage = await svc.setWorkspacePlan('ws', 'free')
    assert.equal(usage.plan, 'free')
  })
})
