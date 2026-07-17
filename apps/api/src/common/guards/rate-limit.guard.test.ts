import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { HttpException } from '@nestjs/common'
import { RateLimitGuard, RATE_LIMIT_KEY } from './rate-limit.guard'
import { RateLimitCleanupService } from './rate-limit-cleanup.service'

function reflector(options: unknown) {
  return { getAllAndOverride: () => options } as any
}

/**
 * Fake of the shared Postgres fixed-window store: implements the exact
 * `insert().values().onConflictDoUpdate().returning()` chain the guard calls,
 * backed by an in-memory Map keyed by bucket. `rows` is exposed so tests can
 * assert the upsert-increment actually recorded hits.
 */
function fakeStore() {
  const rows = new Map<string, { count: number; expiresAt: Date }>()
  const db = {
    insert() {
      let vals: { bucket: string; count: number; expiresAt: Date }
      const chain = {
        values(v: { bucket: string; count: number; expiresAt: Date }) {
          vals = v
          return chain
        },
        onConflictDoUpdate() {
          return chain
        },
        async returning() {
          const existing = rows.get(vals.bucket)
          const count = existing ? existing.count + 1 : vals.count
          rows.set(vals.bucket, { count, expiresAt: vals.expiresAt })
          return [{ count }]
        },
      }
      return chain
    },
  }
  return { db: db as any, rows }
}

/** A DB whose upsert always throws — forces the in-memory fallback path. */
function throwingStore() {
  const chain: any = {
    values: () => chain,
    onConflictDoUpdate: () => chain,
    returning: async () => {
      throw new Error('db down')
    },
  }
  return { insert: () => chain } as any
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
  it('is a no-op for routes without @RateLimit metadata', async () => {
    const guard = new RateLimitGuard(reflector(undefined), fakeStore().db)
    const ctx = makeCtx({ ip: '1.2.3.4', method: 'POST' }, noopRes())
    for (let i = 0; i < 100; i++) assert.equal(await guard.canActivate(ctx), true)
  })

  it('allows requests up to the limit, then returns 429 with Retry-After', async () => {
    const guard = new RateLimitGuard(reflector({ limit: 3, windowMs: 60_000 }), fakeStore().db)
    const res = noopRes()
    const ctx = makeCtx({ ip: '9.9.9.9', method: 'POST' }, res)

    assert.equal(await guard.canActivate(ctx), true)
    assert.equal(await guard.canActivate(ctx), true)
    assert.equal(await guard.canActivate(ctx), true)

    await assert.rejects(
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

  it('shared-store path: upsert-increments the counter and 429s once the count exceeds the limit', async () => {
    const { db, rows } = fakeStore()
    const guard = new RateLimitGuard(reflector({ limit: 2, windowMs: 60_000 }), db)
    const ctx = makeCtx({ ip: '5.5.5.5', method: 'POST' }, noopRes())

    assert.equal(await guard.canActivate(ctx), true) // count 1
    assert.equal(await guard.canActivate(ctx), true) // count 2
    await assert.rejects(
      () => guard.canActivate(ctx), // count 3 > limit 2
      (err: any) => err instanceof HttpException && err.getStatus() === 429,
    )

    // All three hits landed in a SINGLE fixed-window bucket that incremented 1→3,
    // keyed by route + ip + window index.
    const entries = [...rows.entries()]
    assert.equal(entries.length, 1)
    assert.match(entries[0][0], /^AuthController\.login:POST:5\.5\.5\.5:\d+$/)
    assert.equal(entries[0][1].count, 3)
  })

  it('falls back to the in-memory limiter when the shared store throws (never crashes the request)', async () => {
    const guard = new RateLimitGuard(reflector({ limit: 2, windowMs: 60_000 }), throwingStore())
    const ctx = makeCtx({ ip: '7.7.7.7', method: 'POST' }, noopRes())

    // Store is down, but the request is still served — and the limit is still
    // enforced locally rather than failing open.
    assert.equal(await guard.canActivate(ctx), true)
    assert.equal(await guard.canActivate(ctx), true)
    await assert.rejects(
      () => guard.canActivate(ctx),
      (err: any) => err instanceof HttpException && err.getStatus() === 429,
    )
  })

  it('keys buckets per client IP (one IP hitting the limit does not affect another)', async () => {
    const guard = new RateLimitGuard(reflector({ limit: 1, windowMs: 60_000 }), fakeStore().db)
    assert.equal(await guard.canActivate(makeCtx({ ip: 'a', method: 'POST' }, noopRes())), true)
    await assert.rejects(() => guard.canActivate(makeCtx({ ip: 'a', method: 'POST' }, noopRes())))
    // Different IP has its own independent window.
    assert.equal(await guard.canActivate(makeCtx({ ip: 'b', method: 'POST' }, noopRes())), true)
  })

  it('keys buckets per route (same IP on a different handler is independent)', async () => {
    const guard = new RateLimitGuard(reflector({ limit: 1, windowMs: 60_000 }), fakeStore().db)
    assert.equal(await guard.canActivate(makeCtx({ ip: 'a', method: 'POST' }, noopRes(), 'login')), true)
    await assert.rejects(() => guard.canActivate(makeCtx({ ip: 'a', method: 'POST' }, noopRes(), 'login')))
    assert.equal(await guard.canActivate(makeCtx({ ip: 'a', method: 'POST' }, noopRes(), 'signup')), true)
  })

  it('rolls the fixed window forward as time passes', async () => {
    mock.timers.enable({ apis: ['Date'] })
    try {
      const guard = new RateLimitGuard(reflector({ limit: 2, windowMs: 1000 }), fakeStore().db)
      const ctx = makeCtx({ ip: 'z', method: 'POST' }, noopRes())
      assert.equal(await guard.canActivate(ctx), true)
      assert.equal(await guard.canActivate(ctx), true)
      await assert.rejects(() => guard.canActivate(ctx)) // 3rd within the window → blocked
      mock.timers.tick(1500) // advance into the next fixed window
      assert.equal(await guard.canActivate(ctx), true) // fresh window → allowed again
    } finally {
      mock.timers.reset()
    }
  })

  it('exports a stable metadata key for the @RateLimit decorator', () => {
    assert.equal(typeof RATE_LIMIT_KEY, 'string')
  })
})

describe('RateLimitCleanupService', () => {
  it('deletes counter rows whose window has expired', async () => {
    let deleted = false
    let predicate: unknown
    const db = {
      delete: () => ({
        where: async (p: unknown) => {
          deleted = true
          predicate = p
          return []
        },
      }),
    } as any
    await new RateLimitCleanupService(db).sweepExpired()
    assert.equal(deleted, true)
    // An `expires_at < now` condition was handed to the delete.
    assert.ok(predicate)
  })

  it('never throws even if the delete fails', async () => {
    const db = {
      delete: () => ({
        where: async () => {
          throw new Error('db down')
        },
      }),
    } as any
    await assert.doesNotReject(() => new RateLimitCleanupService(db).sweepExpired())
  })
})
