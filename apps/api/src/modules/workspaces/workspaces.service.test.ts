import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { WorkspacesService } from './workspaces.service'

describe('WorkspacesService.updateMemberRole role allowlist', () => {
  it('rejects assigning super_admin (privilege escalation guard)', async () => {
    const svc = new WorkspacesService({} as any, {} as any, {} as any, {} as any)
    await assert.rejects(() => svc.updateMemberRole('ws', 'u', 'super_admin'), /Invalid role/)
  })

  it('rejects an unknown role', async () => {
    const svc = new WorkspacesService({} as any, {} as any, {} as any, {} as any)
    await assert.rejects(() => svc.updateMemberRole('ws', 'u', 'root'), /Invalid role/)
  })
})

// §13.5 — the branding accent color persists through the workspace update, and
// the IP threaded from the controller reaches the audit event.
describe('WorkspacesService.update — accent color + audit IP (§13.3/§13.5)', () => {
  function buildDb() {
    let captured: Record<string, unknown> | null = null
    const db = {
      update: () => ({
        set: (vals: Record<string, unknown>) => {
          captured = vals
          return { where: () => ({ returning: async () => [{ id: 'ws-1', ...vals }] }) }
        },
      }),
    } as any
    return { db, captured: () => captured }
  }

  it('writes accent_color to the update set and records actor IP in the audit event', async () => {
    const { db, captured } = buildDb()
    const security = { logAuditEvent: mock.fn(async () => undefined) } as any
    const svc = new WorkspacesService(db, security, {} as any, {} as any)

    const row = await svc.update(
      'ws-1',
      { name: 'Acme', primaryColor: '#112233', accentColor: '#abcdef' },
      { id: 'admin-1', email: 'admin@acme.test', ip: '203.0.113.9' },
    )

    assert.equal((row as any).accentColor, '#abcdef')
    assert.equal(captured()?.accentColor, '#abcdef')

    const call = (security.logAuditEvent as any).mock.calls[0].arguments[0]
    assert.equal(call.action, 'workspace.updated')
    assert.equal(call.ipAddress, '203.0.113.9')
    assert.equal(call.metadata.accentColor, '#abcdef')
  })
})

// §13.5 — logo upload presign mirrors the avatar flow: rejects non-images and
// oversized files, and returns an upload + public URL for valid images.
describe('WorkspacesService.createLogoUploadUrl (§13.5)', () => {
  const okR2 = {
    configured: true,
    presignPutObject: async () => 'https://r2.example/upload',
    getObjectUrl: async () => 'https://cdn.example/logo.png',
  } as any

  it('throws when storage is not configured', async () => {
    const svc = new WorkspacesService({} as any, {} as any, {} as any, { configured: false } as any)
    await assert.rejects(() => svc.createLogoUploadUrl('ws', { contentType: 'image/png' }), /not configured/)
  })

  it('rejects a non-image content type', async () => {
    const svc = new WorkspacesService({} as any, {} as any, {} as any, okR2)
    await assert.rejects(() => svc.createLogoUploadUrl('ws', { contentType: 'application/pdf' }), /image files/)
  })

  it('rejects an oversized image', async () => {
    const svc = new WorkspacesService({} as any, {} as any, {} as any, okR2)
    await assert.rejects(
      () => svc.createLogoUploadUrl('ws', { contentType: 'image/png', sizeBytes: 99 * 1024 * 1024 }),
      /limit/,
    )
  })

  it('returns upload + public URLs for a valid image', async () => {
    const svc = new WorkspacesService({} as any, {} as any, {} as any, okR2)
    const res = await svc.createLogoUploadUrl('ws-7', { contentType: 'image/png', sizeBytes: 1024 })
    assert.equal(res.uploadUrl, 'https://r2.example/upload')
    assert.equal(res.publicUrl, 'https://cdn.example/logo.png')
    assert.match(res.storageKey, /^workspace-logos\/ws-7-[0-9a-f]+\.png$/)
  })
})
