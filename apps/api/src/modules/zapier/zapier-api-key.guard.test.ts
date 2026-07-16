import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common'
import type { Db } from '@rundesk/db'
import { ZapierApiKeyGuard } from './zapier-api-key.guard'

// select().from().where().limit() resolves to `rows`. No `update` is provided —
// the guard's best-effort usage write must swallow that failure.
function makeDb(rows: unknown[]): Db {
  const chain: Record<string, unknown> = {}
  chain.from = () => chain
  chain.where = () => chain
  chain.limit = () => Promise.resolve(rows)
  return { select: () => chain } as unknown as Db
}

function ctxFor(headers: Record<string, unknown>) {
  const req: any = { headers }
  const ctx = { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext
  return { ctx, req }
}

const KEY_ROW = {
  id: 'key-1',
  workspaceId: 'ws-1',
  createdById: 'user-1',
  scope: 'read_write',
  isRevoked: false,
  expiresAt: null,
  requestCount: 0,
}

describe('ZapierApiKeyGuard', () => {
  it('rejects a request with no API key', async () => {
    const guard = new ZapierApiKeyGuard(makeDb([]))
    const { ctx } = ctxFor({})
    await assert.rejects(() => guard.canActivate(ctx), UnauthorizedException)
  })

  it('rejects an unknown / revoked key', async () => {
    const guard = new ZapierApiKeyGuard(makeDb([]))
    const { ctx } = ctxFor({ authorization: 'Bearer rd_live_deadbeef' })
    await assert.rejects(() => guard.canActivate(ctx), UnauthorizedException)
  })

  it('authenticates a valid Bearer key and attaches workspace + user context', async () => {
    const guard = new ZapierApiKeyGuard(makeDb([KEY_ROW]))
    const { ctx, req } = ctxFor({ authorization: 'Bearer rd_live_whatever' })
    assert.equal(await guard.canActivate(ctx), true)
    assert.equal(req.workspaceId, 'ws-1')
    assert.equal(req.user.id, 'user-1')
  })

  it('accepts the key via the X-API-Key header too', async () => {
    const guard = new ZapierApiKeyGuard(makeDb([KEY_ROW]))
    const { ctx, req } = ctxFor({ 'x-api-key': 'rd_live_whatever' })
    assert.equal(await guard.canActivate(ctx), true)
    assert.equal(req.workspaceId, 'ws-1')
  })

  it('rejects an expired key', async () => {
    const guard = new ZapierApiKeyGuard(makeDb([{ ...KEY_ROW, expiresAt: new Date(Date.now() - 1000) }]))
    const { ctx } = ctxFor({ authorization: 'Bearer rd_live_expired' })
    await assert.rejects(() => guard.canActivate(ctx), UnauthorizedException)
  })
})
