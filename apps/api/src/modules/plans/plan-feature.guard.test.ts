import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { ForbiddenException } from '@nestjs/common'
import { PlanFeatureGuard } from './plan-feature.guard'

function ctx(request: any) {
  return {
    getHandler: () => () => {},
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as any
}

function reflector(feature: string | undefined) {
  return { getAllAndOverride: () => feature } as any
}

describe('PlanFeatureGuard', () => {
  it('allows when no @RequirePlan metadata is present (fail-open)', async () => {
    const plans = { assertFeature: mock.fn(async () => undefined) } as any
    const guard = new PlanFeatureGuard(reflector(undefined), plans)
    assert.equal(await guard.canActivate(ctx({ body: { workspaceId: 'ws' } })), true)
    assert.equal(plans.assertFeature.mock.callCount(), 0)
  })

  it('allows when no workspaceId can be resolved (cannot gate → preserve behavior)', async () => {
    const plans = { assertFeature: mock.fn(async () => undefined) } as any
    const guard = new PlanFeatureGuard(reflector('ai'), plans)
    assert.equal(await guard.canActivate(ctx({ body: {}, query: {}, params: {} })), true)
    assert.equal(plans.assertFeature.mock.callCount(), 0)
  })

  it('resolves workspaceId from the body and delegates to PlansService', async () => {
    const plans = { assertFeature: mock.fn(async () => undefined) } as any
    const guard = new PlanFeatureGuard(reflector('ai'), plans)
    assert.equal(await guard.canActivate(ctx({ body: { workspaceId: 'ws-9' } })), true)
    assert.equal(plans.assertFeature.mock.callCount(), 1)
    assert.deepEqual(plans.assertFeature.mock.calls[0].arguments, ['ws-9', 'ai'])
  })

  it('propagates the 403 when the plan lacks the feature (free plan)', async () => {
    const plans = {
      assertFeature: mock.fn(async () => {
        throw new ForbiddenException('no ai')
      }),
    } as any
    const guard = new PlanFeatureGuard(reflector('ai'), plans)
    await assert.rejects(() => guard.canActivate(ctx({ params: { workspaceId: 'ws' } })), ForbiddenException)
  })
})
