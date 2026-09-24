import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { NamedWorkspaceMemberGuard } from './named-workspace-member.guard'

const WS = '11111111-1111-4111-8111-111111111111'

/** A db whose membership lookup answers `role` (or nothing), counting the lookups. */
function dbAnswering(role: string | null) {
  const calls = { lookups: 0 }
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            calls.lookups += 1
            return role ? [{ role }] : []
          },
        }),
      }),
    }),
  } as any
  return { db, calls }
}

function ctxFor(req: Record<string, unknown>) {
  return { switchToHttp: () => ({ getRequest: () => req }) } as any
}

describe('NamedWorkspaceMemberGuard — the workspace a request names is the caller’s', () => {
  it('lets a member through, whether the workspace is in the path, the body or the query', async () => {
    for (const where of ['params', 'body', 'query']) {
      const { db } = dbAnswering('member')
      const req = { user: { id: 'u1', role: 'member' }, params: {}, body: {}, query: {}, [where]: { workspaceId: WS } }
      assert.equal(await new NamedWorkspaceMemberGuard(db).canActivate(ctxFor(req)), true)
    }
  })

  it('answers a stranger 404, as the workspace guard does', async () => {
    const { db } = dbAnswering(null)
    const req = { user: { id: 'u1', role: 'member' }, body: { workspaceId: WS } }
    await assert.rejects(() => new NamedWorkspaceMemberGuard(db).canActivate(ctxFor(req)), NotFoundException)
  })

  it('refuses a guest of the workspace, whatever the account-wide role says', async () => {
    const { db } = dbAnswering('guest')
    const req = { user: { id: 'u1', role: 'member' }, body: { workspaceId: WS } }
    await assert.rejects(() => new NamedWorkspaceMemberGuard(db).canActivate(ctxFor(req)), ForbiddenException)
  })

  it('answers 404 for something that is not a workspace id, without asking the database', async () => {
    const { db, calls } = dbAnswering('member')
    const req = { user: { id: 'u1', role: 'member' }, body: { workspaceId: "x' or 1=1" } }
    await assert.rejects(() => new NamedWorkspaceMemberGuard(db).canActivate(ctxFor(req)), NotFoundException)
    assert.equal(calls.lookups, 0)
  })

  it('passes a request that names no workspace, and a platform super admin', async () => {
    const none = dbAnswering(null)
    assert.equal(await new NamedWorkspaceMemberGuard(none.db).canActivate(ctxFor({ user: { id: 'u1' }, body: {} })), true)
    const sa = dbAnswering(null)
    const req = { user: { id: 'u9', role: 'super_admin' }, body: { workspaceId: WS } }
    assert.equal(await new NamedWorkspaceMemberGuard(sa.db).canActivate(ctxFor(req)), true)
    assert.equal(sa.calls.lookups, 0)
  })
})
