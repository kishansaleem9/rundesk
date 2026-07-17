import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { NotFoundException } from '@nestjs/common'
import { FeatureFlagGuard } from './feature-flag.guard'

/**
 * The @FeatureFlag decorator + FeatureFlagGuard enforce workspace feature flags
 * at the API (defense-in-depth beside the frontend gate). Contract:
 *   - a route with NO required flag passes untouched (the guard is a no-op on
 *     the vast majority of routes), without ever hitting the flag service;
 *   - a required flag that resolves enabled passes;
 *   - a required flag that resolves disabled 404s (the feature "does not exist");
 *   - the resolution context is the request's workspace (param first, else the
 *     user's active workspace) + user id + role.
 */
function ctx(opts: { flags?: string[]; user?: any; params?: any }) {
  const reflector = { getAllAndOverride: mock.fn(() => opts.flags) } as any
  const request = { user: opts.user, params: opts.params ?? {} }
  const execCtx = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as any
  return { reflector, execCtx }
}

describe('FeatureFlagGuard', () => {
  it('allows a route with no required flag and never calls the flag service', async () => {
    const { reflector, execCtx } = ctx({ flags: undefined })
    const svc = { isEnabled: mock.fn(async () => false) } as any
    const guard = new FeatureFlagGuard(reflector, svc)
    assert.equal(await guard.canActivate(execCtx), true)
    assert.equal(svc.isEnabled.mock.callCount(), 0, 'no flag → no resolution')
  })

  it('allows when the required flag resolves enabled', async () => {
    const { reflector, execCtx } = ctx({
      flags: ['chat'],
      user: { id: 'u1', role: 'member' },
      params: { workspaceId: 'w1' },
    })
    const svc = { isEnabled: mock.fn(async () => true) } as any
    const guard = new FeatureFlagGuard(reflector, svc)
    assert.equal(await guard.canActivate(execCtx), true)
    // Resolution context = request workspace param + user id + role.
    const arg = svc.isEnabled.mock.calls[0].arguments
    assert.equal(arg[0], 'chat')
    assert.deepEqual(arg[1], { userId: 'u1', workspaceId: 'w1', role: 'member' })
  })

  it('404s when the required flag resolves disabled', async () => {
    const { reflector, execCtx } = ctx({
      flags: ['docs'],
      user: { id: 'u1', role: 'member' },
      params: { workspaceId: 'w1' },
    })
    const svc = { isEnabled: mock.fn(async () => false) } as any
    const guard = new FeatureFlagGuard(reflector, svc)
    await assert.rejects(() => guard.canActivate(execCtx), NotFoundException)
  })

  it('falls back to the user active workspace when the route has no :workspaceId', async () => {
    const { reflector, execCtx } = ctx({
      flags: ['search'],
      user: { id: 'u1', role: 'manager', activeWorkspaceId: 'w-active' },
      params: {},
    })
    const svc = { isEnabled: mock.fn(async () => true) } as any
    const guard = new FeatureFlagGuard(reflector, svc)
    await guard.canActivate(execCtx)
    assert.equal(svc.isEnabled.mock.calls[0].arguments[1].workspaceId, 'w-active')
  })
})
