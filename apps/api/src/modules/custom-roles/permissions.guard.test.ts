import test from 'node:test'
import assert from 'node:assert/strict'
import { type ExecutionContext } from '@nestjs/common'
import type { Reflector } from '@nestjs/core'
import { PermissionsGuard } from './permissions.guard'
import type { CustomRolesService } from './custom-roles.service'

/**
 * The super_admin bypass MUST run before the workspace-context requirement.
 * Regression: on routes whose workspace is only derivable by ResourceMemberGuard
 * (e.g. POST /projects carries just `spaceId`, and ResourceMemberGuard
 * short-circuits for super_admin without populating req.workspaceMember), a
 * super-admin would otherwise be wrongly 403'd on a core action like creating a
 * project.
 */
function ctxFor(user: unknown, params: unknown = {}, body: unknown = {}, workspaceMember?: unknown): ExecutionContext {
  const req: Record<string, unknown> = { user, params, body, workspaceMember }
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext
}
const reflectorReturning = (val: unknown) => ({ getAllAndOverride: () => val }) as unknown as Reflector
const rolesStub = (perms: string[] = []) =>
  ({ resolveForUser: async () => ({ permissions: perms }) }) as unknown as CustomRolesService

test('no required permissions → allow', async () => {
  const g = new PermissionsGuard(reflectorReturning(undefined), rolesStub())
  assert.equal(await g.canActivate(ctxFor({ id: 'u', role: 'member' })), true)
})

test('super_admin bypasses even with NO workspace context (regression: POST /projects)', async () => {
  // A required permission IS declared, and the request carries no workspaceId
  // anywhere (params/body/workspaceMember all lack it) — must NOT 403.
  const g = new PermissionsGuard(reflectorReturning(['project.create']), rolesStub())
  assert.equal(await g.canActivate(ctxFor({ id: 'root', role: 'super_admin' }, {}, { spaceId: 'sp-1' })), true)
})

test('non-super_admin without any workspace context → 403 Workspace context required', async () => {
  const g = new PermissionsGuard(reflectorReturning(['project.create']), rolesStub())
  await assert.rejects(
    () => g.canActivate(ctxFor({ id: 'u', role: 'member' }, {}, { spaceId: 'sp-1' })),
    /Workspace context required/,
  )
})

test('member WITH the granted permission (workspace via req.workspaceMember) → allow', async () => {
  const g = new PermissionsGuard(reflectorReturning(['project.create']), rolesStub(['project.create']))
  assert.equal(
    await g.canActivate(ctxFor({ id: 'u', role: 'member' }, {}, {}, { workspaceId: 'ws-1' })),
    true,
  )
})

test('member MISSING the permission → 403 Missing required permission', async () => {
  const g = new PermissionsGuard(reflectorReturning(['project.create']), rolesStub([]))
  await assert.rejects(
    () => g.canActivate(ctxFor({ id: 'u', role: 'member' }, { workspaceId: 'ws-1' })),
    /Missing required permission/,
  )
})
