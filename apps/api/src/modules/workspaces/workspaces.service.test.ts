import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { WorkspacesService } from './workspaces.service'

describe('WorkspacesService.updateMemberRole role allowlist', () => {
  it('rejects assigning super_admin (privilege escalation guard)', async () => {
    const svc = new WorkspacesService({} as any, {} as any)
    await assert.rejects(() => svc.updateMemberRole('ws', 'u', 'super_admin'), /Invalid role/)
  })

  it('rejects an unknown role', async () => {
    const svc = new WorkspacesService({} as any, {} as any)
    await assert.rejects(() => svc.updateMemberRole('ws', 'u', 'root'), /Invalid role/)
  })
})
