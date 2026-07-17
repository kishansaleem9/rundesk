import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ForbiddenException } from '@nestjs/common'
import { TenantDatabasesController } from './tenant-databases.controller'

const superAdmin = { id: 'root', email: 'root@rundesk.dev', role: 'super_admin' } as const
const member = { id: 'u', email: 'u@rundesk.dev', role: 'member' } as const

describe('TenantDatabasesController super-admin gate', () => {
  it('rejects a non-super-admin on every handler', async () => {
    const ctrl = new TenantDatabasesController({} as any)
    await assert.rejects(() => ctrl.list(member as any), ForbiddenException)
    await assert.rejects(() => ctrl.upsert('org', { connectionUrl: 'x' }, member as any), ForbiddenException)
    await assert.rejects(() => ctrl.test('org', member as any), ForbiddenException)
    await assert.rejects(() => ctrl.disable('org', member as any), ForbiddenException)
    await assert.rejects(() => ctrl.remove('org', member as any), ForbiddenException)
    // New §14.2 provisioning / data-migration ops surface — also super-admin only.
    await assert.rejects(() => ctrl.provision('org', member as any), ForbiddenException)
    await assert.rejects(() => ctrl.schemaStatus('org', member as any), ForbiddenException)
    await assert.rejects(() => ctrl.migrateData('org', { dryRun: true }, member as any), ForbiddenException)
  })

  it('forwards provision / schema-status / migrate-data to the service for a super admin', async () => {
    const calls: string[] = []
    let migrateOpts: any
    const svc = {
      provisionSchema: (org: string) => {
        calls.push(`provision:${org}`)
        return Promise.resolve({ ok: true })
      },
      getSchemaStatus: (org: string) => {
        calls.push(`status:${org}`)
        return Promise.resolve({ ok: true })
      },
      migrateOrgData: (org: string, opts: any) => {
        calls.push(`migrate:${org}`)
        migrateOpts = opts
        return Promise.resolve({ ok: true })
      },
    }
    const ctrl = new TenantDatabasesController(svc as any)

    await ctrl.provision('o1', superAdmin as any)
    await ctrl.schemaStatus('o2', superAdmin as any)
    await ctrl.migrateData('o3', { dryRun: true }, superAdmin as any)
    assert.deepEqual(calls, ['provision:o1', 'status:o2', 'migrate:o3'])
    assert.equal(migrateOpts.dryRun, true, 'dryRun flag forwarded to the service')

    // Missing body defaults dryRun to false (safe: a real copy is explicit).
    await ctrl.migrateData('o4', {} as any, superAdmin as any)
    assert.equal(migrateOpts.dryRun, false)
  })

  it('forwards to the service for a super admin (list)', async () => {
    let called = false
    const svc = {
      listAll: () => {
        called = true
        return Promise.resolve([])
      },
    }
    const ctrl = new TenantDatabasesController(svc as any)
    const out = await ctrl.list(superAdmin as any)
    assert.equal(called, true)
    assert.deepEqual(out, [])
  })

  it('forwards the upsert body to the service for a super admin', async () => {
    let receivedOrg: string | undefined
    let receivedBody: any
    const svc = {
      upsertForOrg: (orgId: string, body: any) => {
        receivedOrg = orgId
        receivedBody = body
        return Promise.resolve({ organizationId: orgId, status: 'pending', label: null, host: 'h:5432', lastCheckedAt: null })
      },
    }
    const ctrl = new TenantDatabasesController(svc as any)
    await ctrl.upsert('org-9', { connectionUrl: 'postgres://u:pw@h:5432/d', label: 'x' }, superAdmin as any)
    assert.equal(receivedOrg, 'org-9')
    assert.equal(receivedBody.connectionUrl, 'postgres://u:pw@h:5432/d')
  })
})
