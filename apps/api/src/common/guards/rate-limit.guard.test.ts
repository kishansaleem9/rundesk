import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { HttpException } from '@nestjs/common'
import { RateLimitGuard, RATE_LIMIT_KEY } from './rate-limit.guard'

function reflector(options: unknown) {
  return { getAllAndOverride: () => options } as any
}

function makeCtx(
  req: { ip?: string; method?: string },
  res: { header: (...a: unknown[]) => unknown },
  handlerName = 'login',
  className = 'AuthController',
) {
  function handler() {}
  Object.defineProperty(handler, 'name', { value: handlerName })
  return {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => ({ name: className }),
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as any
}

const noopRes = () => ({ header: mock.fn() })

describe('RateLimitGuard', () => {
  it('is a no-op for routes without @RateLimit metadata', () => {
    const guard = new RateLimitGuard(reflector(undefined))
    const ctx = makeCtx({ ip: '1.2.3.4', method: 'POST' }, noopRes())
    for (let i = 0; i < 100; i++) assert.equal(guard.canActivate(ctx), true)
  })

  it('allows requests up to the limit, then returns 429 with Retry-After', () => {
    const guard = new RateLimitGuard(reflector({ limit: 3, windowMs: 60_000 }))
    const res = noopRes()
    const ctx = makeCtx({ ip: '9.9.9.9', method: 'POST' }, res)

    assert.equal(guard.canActivate(ctx), true)
    assert.equal(guard.canActivate(ctx), true)
    assert.equal(guard.canActivate(ctx), true)

    assert.throws(
      () => guard.canActivate(ctx),
      (err: any) => {
        assert.ok(err instanceof HttpException)
        assert.equal(err.getStatus(), 429)
        const body = err.getResponse() as any
        assert.equal(body.error, 'rate_limited')
        assert.ok(body.retryAfter >= 1)
        return true
      },
    )
    // Retry-After header must be set on the response.
    assert.ok(res.header.mock.callCount() >= 1)
    assert.equal(res.header.mock.calls[0].arguments[0], 'Retry-After')
  })

  it('keys buckets per client IP (one IP hitting the limit does not affect another)', () => {
    const guard = new RateLimitGuard(reflector({ limit: 1, windowMs: 60_000 }))
    assert.equal(guard.canActivate(makeCtx({ ip: 'a', method: 'POST' }, noopRes())), true)
    assert.throws(() => guard.canActivate(makeCtx({ ip: 'a', method: 'POST' }, noopRes())))
    // Different IP has its own independent window.
    assert.equal(guard.canActivate(makeCtx({ ip: 'b', method: 'POST' }, noopRes())), true)
  })

  it('keys buckets per route (same IP on a different handler is independent)', () => {
    const guard = new RateLimitGuard(reflector({ limit: 1, windowMs: 60_000 }))
    assert.equal(guard.canActivate(makeCtx({ ip: 'a', method: 'POST' }, noopRes(), 'login')), true)
    assert.throws(() => guard.canActivate(makeCtx({ ip: 'a', method: 'POST' }, noopRes(), 'login')))
    assert.equal(guard.canActivate(makeCtx({ ip: 'a', method: 'POST' }, noopRes(), 'signup')), true)
  })

  it('slides the window forward as time passes', () => {
    mock.timers.enable({ apis: ['Date'] })
    try {
      const guard = new RateLimitGuard(reflector({ limit: 2, windowMs: 1000 }))
      const ctx = makeCtx({ ip: 'z', method: 'POST' }, noopRes())
      assert.equal(guard.canActivate(ctx), true)
      assert.equal(guard.canActivate(ctx), true)
      assert.throws(() => guard.canActivate(ctx)) // 3rd within 1s → blocked
      mock.timers.tick(1500) // advance past the window
      assert.equal(guard.canActivate(ctx), true) // window cleared → allowed again
    } finally {
      mock.timers.reset()
    }
  })

  it('exports a stable metadata key for the @RateLimit decorator', () => {
    assert.equal(typeof RATE_LIMIT_KEY, 'string')
  })
})
