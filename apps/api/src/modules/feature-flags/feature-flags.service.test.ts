import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FeatureFlagsService } from './feature-flags.service'

// thenable Drizzle chain that resolves to the given rows
const chain = (rows: any[]): any => ({
  from: () => chain(rows),
  where: () => chain(rows),
  limit: () => chain(rows),
  then: (res: (v: any) => any, rej: (e: any) => any) => Promise.resolve(rows).then(res, rej),
})

describe('FeatureFlagsService.setFlag authorization', () => {
  it('rejects a non-super-admin setting a global flag', async () => {
    const svc = new FeatureFlagsService({} as any, {} as any)
    await assert.rejects(
      () => svc.setFlag('x' as any, true, 'global', null, null, { id: 'u', role: 'member' }),
      /super admin/i,
    )
  })

  it('rejects a non-admin setting a workspace flag', async () => {
    const db = { select: () => chain([]) } // membership lookup returns nothing
    const svc = new FeatureFlagsService(db as any, {} as any)
    await assert.rejects(
      () => svc.setFlag('x' as any, true, 'workspace', null, 'ws1', { id: 'u', role: 'member' }),
      /workspace admin/i,
    )
  })

  it('allows a super_admin to set a global flag', async () => {
    const db = { insert: () => ({ values: () => ({ onConflictDoUpdate: async () => undefined }) }) }
    const security = { logAuditEvent: async () => undefined }
    const svc = new FeatureFlagsService(db as any, security as any)
    await svc.setFlag('x' as any, true, 'global', null, null, { id: 'u', role: 'super_admin' })
  })
})
