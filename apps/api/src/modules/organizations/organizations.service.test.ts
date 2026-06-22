import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { OrganizationsService } from './organizations.service'

const chain = (rows: any[]): any => ({
  from: () => chain(rows),
  where: () => chain(rows),
  limit: () => chain(rows),
  then: (res: (v: any) => any, rej: (e: any) => any) => Promise.resolve(rows).then(res, rej),
})

describe('OrganizationsService.updateMemberRole', () => {
  it('rejects an invalid role', async () => {
    const svc = new OrganizationsService({} as any)
    await assert.rejects(() => svc.updateMemberRole('org', 'u', 'hacker' as any), /Invalid role/)
  })

  it('rejects a non-owner granting the owner role', async () => {
    const db = { select: () => chain([{ role: 'admin' }]) } // actor is admin, not owner
    const svc = new OrganizationsService(db as any)
    await assert.rejects(
      () => svc.updateMemberRole('org', 'u', 'owner', 'actor'),
      /Only an organization owner/,
    )
  })
})
