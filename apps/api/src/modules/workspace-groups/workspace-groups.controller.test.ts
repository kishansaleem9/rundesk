import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { PermissionsGuard } from '../custom-roles/permissions.guard'
import { WorkspaceGroupsController } from './workspace-groups.controller'

/**
 * `found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`, the
 * user-groups slice. Making, renaming and deleting a group and setting its
 * members ask `groups.manage`; reading them asks only membership. And what a
 * person sets through these routes is never the SCIM `externalId`, which the
 * IdP's calls resolve groups by.
 */

const REQUIRED = 'rundesk.required_permissions'
const proto = WorkspaceGroupsController.prototype as unknown as Record<string, object>

function build() {
  const groups = {
    create: mock.fn(async () => ({ id: 'g-1' })),
    update: mock.fn(async () => ({ id: 'g-1' })),
  } as any
  return { controller: new WorkspaceGroupsController(groups), groups }
}

describe('WorkspaceGroupsController', () => {
  it('asks groups.manage on every route that makes, renames, deletes or staffs a group', () => {
    for (const route of ['create', 'update', 'remove', 'addMembers', 'replaceMembers', 'removeMember']) {
      assert.deepEqual(Reflect.getMetadata(REQUIRED, proto[route]), ['groups.manage'], `${route} asks groups.manage`)
      const guards = Reflect.getMetadata(GUARDS_METADATA, proto[route]) ?? []
      assert.ok(guards.includes(PermissionsGuard), `${route} is guarded by PermissionsGuard`)
    }
  })

  it('leaves reading the groups to every member: the list and one group ask no key', () => {
    for (const route of ['list', 'get']) {
      assert.equal(Reflect.getMetadata(REQUIRED, proto[route]), undefined, `${route} asks no key`)
    }
  })

  it('never passes a body’s externalId to the service when a group is made', async () => {
    const { controller, groups } = build()
    await controller.create(
      'ws-1',
      { name: 'Design', description: 'd', alias: 'design', memberIds: ['u-1'], externalId: 'idp-42' } as any,
      { id: 'actor-1' },
    )
    const input = groups.create.mock.calls[0].arguments[2]
    assert.deepEqual(input, { name: 'Design', description: 'd', alias: 'design', memberIds: ['u-1'] })
    assert.equal('externalId' in input, false)
  })

  it('never passes a body’s externalId to the service when a group is renamed', async () => {
    const { controller, groups } = build()
    await controller.update('ws-1', 'g-1', { name: 'Design', externalId: 'idp-42' } as any, { id: 'actor-1' })
    assert.deepEqual(groups.update.mock.calls[0].arguments[3], { name: 'Design' })
    // A body that carried nothing else changes nothing.
    await controller.update('ws-1', 'g-1', { externalId: null } as any, { id: 'actor-1' })
    assert.deepEqual(groups.update.mock.calls[1].arguments[3], {})
  })

  it('keeps an explicit null description and alias, which clear them', async () => {
    const { controller, groups } = build()
    await controller.update('ws-1', 'g-1', { description: null, alias: null }, { id: 'actor-1' })
    assert.deepEqual(groups.update.mock.calls[0].arguments[3], { description: null, alias: null })
  })
})
