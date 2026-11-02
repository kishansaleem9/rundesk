import test from 'node:test'
import assert from 'node:assert/strict'
import { NotFoundException, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Db } from '@rundesk/db'
import { WorkspaceMemberGuard } from './workspace-member.guard'
import { AllowArchivedWorkspace } from '../../../common/decorators/allow-archived-workspace.decorator'

// `found-02-nov/archived-workspace-still-opens` — a deleted (archived)
// workspace is not found by its members, but for the routes that restore it
// or delete it for good; a platform admin reaches it as they reach any.

const WS = '11111111-1111-4111-8111-111111111111'

function dbAnswering(rows: unknown[]): Db {
  const chain: Record<string, unknown> = {}
  chain.from = () => chain
  chain.innerJoin = () => chain
  chain.where = () => chain
  chain.limit = () => Promise.resolve(rows)
  return { select: () => chain } as unknown as Db
}

class Routes {
  open() {}
  @AllowArchivedWorkspace()
  restore() {}
}

function ctxFor(user: unknown, handler: keyof Routes): ExecutionContext {
  const req = { user, params: { workspaceId: WS } }
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => Routes.prototype[handler],
    getClass: () => Routes,
  } as unknown as ExecutionContext
}

const member = { member: { workspaceId: WS, userId: 'u', role: 'member' } }

test('a member opens a live workspace', async () => {
  const g = new WorkspaceMemberGuard(dbAnswering([{ ...member, isArchived: false }]), new Reflector())
  assert.equal(await g.canActivate(ctxFor({ id: 'u', role: 'member' }, 'open')), true)
})

test('a member does not find an archived workspace', async () => {
  const g = new WorkspaceMemberGuard(dbAnswering([{ ...member, isArchived: true }]), new Reflector())
  await assert.rejects(() => g.canActivate(ctxFor({ id: 'u', role: 'member' }, 'open')), NotFoundException)
})

test('a route marked to act on an archived workspace still answers its member', async () => {
  const g = new WorkspaceMemberGuard(dbAnswering([{ ...member, isArchived: true }]), new Reflector())
  assert.equal(await g.canActivate(ctxFor({ id: 'u', role: 'member' }, 'restore')), true)
})

test('a platform admin reaches an archived workspace, and nobody one that is not there', async () => {
  const g = new WorkspaceMemberGuard(dbAnswering([{ id: WS }]), new Reflector())
  assert.equal(await g.canActivate(ctxFor({ id: 'root', role: 'super_admin' }, 'open')), true)
  const none = new WorkspaceMemberGuard(dbAnswering([]), new Reflector())
  await assert.rejects(() => none.canActivate(ctxFor({ id: 'root', role: 'super_admin' }, 'open')), NotFoundException)
  await assert.rejects(() => none.canActivate(ctxFor({ id: 'u', role: 'member' }, 'open')), NotFoundException)
})
