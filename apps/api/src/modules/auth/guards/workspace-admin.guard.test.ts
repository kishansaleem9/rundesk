import test from 'node:test'
import assert from 'node:assert/strict'
import { ForbiddenException, NotFoundException, type ExecutionContext } from '@nestjs/common'
import type { Db } from '@rundesk/db'
import { WorkspaceAdminGuard } from './workspace-admin.guard'

// Minimal drizzle chain mock: select().from().where().limit() resolves to `rows`.
function makeDb(rows: unknown[]): Db {
  const chain: Record<string, unknown> = {}
  chain.from = () => chain
  chain.where = () => chain
  chain.limit = () => Promise.resolve(rows)
  return { select: () => chain } as unknown as Db
}

function ctxFor(user: unknown, params: unknown): ExecutionContext {
  const req = { user, params }
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext
}

const WS = 'ws-1'

test('WorkspaceAdminGuard rejects an unauthenticated request', async () => {
  const guard = new WorkspaceAdminGuard(makeDb([]))
  await assert.rejects(() => guard.canActivate(ctxFor(undefined, { workspaceId: WS })), ForbiddenException)
})

test('WorkspaceAdminGuard rejects when no workspace context', async () => {
  const guard = new WorkspaceAdminGuard(makeDb([]))
  await assert.rejects(() => guard.canActivate(ctxFor({ id: 'u', role: 'workspace_admin' }, {})), ForbiddenException)
})

test('WorkspaceAdminGuard DENIES a guest member', async () => {
  const guard = new WorkspaceAdminGuard(makeDb([{ userId: 'u', workspaceId: WS, role: 'guest' }]))
  await assert.rejects(() => guard.canActivate(ctxFor({ id: 'u', role: 'member' }, { workspaceId: WS })), ForbiddenException)
})

test('WorkspaceAdminGuard DENIES a plain member', async () => {
  const guard = new WorkspaceAdminGuard(makeDb([{ userId: 'u', workspaceId: WS, role: 'member' }]))
  await assert.rejects(() => guard.canActivate(ctxFor({ id: 'u', role: 'member' }, { workspaceId: WS })), ForbiddenException)
})

test('WorkspaceAdminGuard DENIES a non-member (no membership row)', async () => {
  const guard = new WorkspaceAdminGuard(makeDb([]))
  await assert.rejects(() => guard.canActivate(ctxFor({ id: 'outsider', role: 'member' }, { workspaceId: WS })), NotFoundException)
})

test('WorkspaceAdminGuard ALLOWS a workspace_admin', async () => {
  const guard = new WorkspaceAdminGuard(makeDb([{ userId: 'u', workspaceId: WS, role: 'workspace_admin' }]))
  assert.equal(await guard.canActivate(ctxFor({ id: 'u', role: 'member' }, { workspaceId: WS })), true)
})

test('WorkspaceAdminGuard ALLOWS a manager', async () => {
  const guard = new WorkspaceAdminGuard(makeDb([{ userId: 'u', workspaceId: WS, role: 'manager' }]))
  assert.equal(await guard.canActivate(ctxFor({ id: 'u', role: 'member' }, { workspaceId: WS })), true)
})

test('WorkspaceAdminGuard ALLOWS a super_admin when the workspace exists', async () => {
  const guard = new WorkspaceAdminGuard(makeDb([{ id: WS }]))
  assert.equal(await guard.canActivate(ctxFor({ id: 'root', role: 'super_admin' }, { workspaceId: WS })), true)
})

test('WorkspaceAdminGuard 404s a super_admin when the workspace is missing', async () => {
  const guard = new WorkspaceAdminGuard(makeDb([]))
  await assert.rejects(() => guard.canActivate(ctxFor({ id: 'root', role: 'super_admin' }, { workspaceId: 'nope' })), NotFoundException)
})
