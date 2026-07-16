import { UnauthorizedException } from '@nestjs/common'
import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { ScimController } from './scim.controller'

/**
 * SCIM 2.0 provisioning is protected NOT by the workspace JWT but by the
 * long-lived SCIM bearer token: every protocol method must call
 * `scim.authenticate(bearer)` first, and the workspaceId it returns (tenant
 * scope) must be threaded into the delegated service call. These tests lock
 * that contract in for every mutation endpoint.
 */

const VALID = 'Bearer scim_valid'

function buildController(authImpl?: (t?: string) => Promise<string>) {
  const scim = {
    authenticate: mock.fn(authImpl ?? (async () => 'ws-1')),
    listUsers: mock.fn(async () => ({})),
    getUser: mock.fn(async () => ({})),
    createUser: mock.fn(async () => ({ id: 'u1' })),
    replaceUser: mock.fn(async () => ({ id: 'u1' })),
    patchUser: mock.fn(async () => ({ id: 'u1' })),
    deleteUser: mock.fn(async () => undefined),
    listGroups: mock.fn(async () => ({})),
    getGroup: mock.fn(async () => ({})),
    createGroup: mock.fn(async () => ({ id: 'g1' })),
    replaceGroup: mock.fn(async () => ({ id: 'g1' })),
    patchGroup: mock.fn(async () => ({ id: 'g1' })),
    deleteGroup: mock.fn(async () => undefined),
  } as any
  return { controller: new ScimController(scim), scim }
}

const makeRes = () => ({ code: mock.fn() }) as any

type Mutation = {
  delegate: string
  call: (c: ScimController, res: any) => Promise<unknown>
}

const MUTATIONS: Mutation[] = [
  { delegate: 'createUser', call: (c, res) => c.createUser(VALID, { userName: 'a@b.c' }, res) },
  { delegate: 'replaceUser', call: (c) => c.replaceUser(VALID, 'id-1', {}) },
  { delegate: 'patchUser', call: (c) => c.patchUser(VALID, 'id-1', {}) },
  { delegate: 'deleteUser', call: (c, res) => c.deleteUser(VALID, 'id-1', res) },
  { delegate: 'createGroup', call: (c, res) => c.createGroup(VALID, { displayName: 'G' }, res) },
  { delegate: 'replaceGroup', call: (c) => c.replaceGroup(VALID, 'id-1', {}) },
  { delegate: 'patchGroup', call: (c) => c.patchGroup(VALID, 'id-1', {}) },
  { delegate: 'deleteGroup', call: (c, res) => c.deleteGroup(VALID, 'id-1', res) },
]

describe('ScimController — every mutation authenticates + tenant-scopes', () => {
  for (const m of MUTATIONS) {
    it(`${m.delegate} authenticates the bearer token and passes the token workspaceId`, async () => {
      const { controller, scim } = buildController()
      await m.call(controller, makeRes())
      assert.equal(scim.authenticate.mock.callCount(), 1, 'must authenticate exactly once')
      assert.equal(scim.authenticate.mock.calls[0].arguments[0], 'scim_valid', 'must pass the extracted bearer token')
      assert.equal(scim[m.delegate].mock.callCount(), 1)
      assert.equal(
        scim[m.delegate].mock.calls[0].arguments[0],
        'ws-1',
        'delegated service call must be scoped to the token workspaceId',
      )
    })
  }
})

describe('ScimController — mutations reject when the bearer token is invalid', () => {
  for (const m of MUTATIONS) {
    it(`${m.delegate} rejects and does not mutate when auth fails`, async () => {
      const { controller, scim } = buildController(async () => {
        throw new UnauthorizedException('Invalid SCIM token')
      })
      await assert.rejects(() => m.call(controller, makeRes()), (e: unknown) => e instanceof UnauthorizedException)
      assert.equal(scim[m.delegate].mock.callCount(), 0, 'the service mutation must not run without auth')
    })
  }
})
