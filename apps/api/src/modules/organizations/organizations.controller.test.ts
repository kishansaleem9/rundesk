import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ForbiddenException } from '@nestjs/common'
import { OrganizationsController } from './organizations.controller'

const superAdmin = { id: 'root', email: 'root@rundesk.dev', role: 'super_admin' } as const
const member = { id: 'u', email: 'u@rundesk.dev', role: 'member' } as const

describe('OrganizationsController.listDirectory (global user directory)', () => {
  it('rejects a non-super-admin', async () => {
    const ctrl = new OrganizationsController({} as any)
    await assert.rejects(() => ctrl.listDirectory(member as any), ForbiddenException)
  })

  it('forwards search + parsed pagination to the service for a super admin', async () => {
    let received: any
    const svc = {
      listDirectory: (opts: any) => {
        received = opts
        return Promise.resolve({ users: [], total: 0, limit: 50, offset: 0 })
      },
    }
    const ctrl = new OrganizationsController(svc as any)
    await ctrl.listDirectory(superAdmin as any, 'ann', '25', '50')
    assert.equal(received.q, 'ann')
    assert.equal(received.limit, 25)
    assert.equal(received.offset, 50)
  })

  it('passes undefined pagination when the query params are absent', async () => {
    let received: any
    const svc = {
      listDirectory: (opts: any) => {
        received = opts
        return Promise.resolve({ users: [], total: 0, limit: 50, offset: 0 })
      },
    }
    const ctrl = new OrganizationsController(svc as any)
    await ctrl.listDirectory(superAdmin as any)
    assert.equal(received.limit, undefined)
    assert.equal(received.offset, undefined)
  })
})
