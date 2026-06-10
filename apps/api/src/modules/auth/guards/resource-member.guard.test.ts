import test from 'node:test'
import assert from 'node:assert/strict'
import { ForbiddenException, NotFoundException, type ExecutionContext } from '@nestjs/common'
import type { Db } from '@rundesk/db'
import { ResourceMemberGuard } from './resource-member.guard'

// Mock: the guard resolves a workspace (1 select chain) then checks membership
// (a 2nd select chain). `resolveRows` feeds the first, `memberRows` the second.
function makeDb(resolveRows: unknown[], memberRows: unknown[]): Db {
  let call = 0
  const chain = (rows: unknown[]): Record<string, unknown> => {
    const c: Record<string, unknown> = {}
    c.from = () => c
    c.innerJoin = () => c
    c.where = () => c
    c.limit = () => Promise.resolve(rows)
    return c
  }
  return { select: () => chain(call++ === 0 ? resolveRows : memberRows) } as unknown as Db
}
function ctxFor(user: unknown, params: unknown, body: unknown = {}): ExecutionContext {
  const req = { user, params, body }
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext
}
const WS = 'ws-1'

test('rejects unauthenticated', async () => {
  const g = new ResourceMemberGuard(makeDb([], []))
  await assert.rejects(() => g.canActivate(ctxFor(undefined, { workspaceId: WS })), ForbiddenException)
})

test('DENIES a non-member for a workspace param', async () => {
  const g = new ResourceMemberGuard(makeDb([], [])) // workspaceId direct → membership empty
  await assert.rejects(() => g.canActivate(ctxFor({ id: 'u', role: 'member' }, { workspaceId: WS })), ForbiddenException)
})

test('DENIES a non-member resolving via spaceId', async () => {
  const g = new ResourceMemberGuard(makeDb([{ w: WS }], [])) // space resolves to WS, but no membership
  await assert.rejects(() => g.canActivate(ctxFor({ id: 'outsider', role: 'member' }, { spaceId: 'sp-1' })), ForbiddenException)
})

test('404 when the resource does not resolve to a workspace', async () => {
  const g = new ResourceMemberGuard(makeDb([], [])) // taskId resolves to nothing
  await assert.rejects(() => g.canActivate(ctxFor({ id: 'u', role: 'member' }, { taskId: 'nope' })), NotFoundException)
})

test('ALLOWS a member resolving via listId (body)', async () => {
  const g = new ResourceMemberGuard(makeDb([{ w: WS }], [{ role: 'member' }]))
  assert.equal(await g.canActivate(ctxFor({ id: 'u', role: 'member' }, {}, { listId: 'li-1' })), true)
})

test('ALLOWS super_admin without a membership row', async () => {
  const g = new ResourceMemberGuard(makeDb([{ w: WS }], []))
  assert.equal(await g.canActivate(ctxFor({ id: 'root', role: 'super_admin' }, { taskId: 't-1' })), true)
})
