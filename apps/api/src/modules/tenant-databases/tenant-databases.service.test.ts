import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TenantDatabasesService, maskConnectionHost } from './tenant-databases.service'

// Minimal thenable query-builder stub (mirrors the organizations.service test idiom):
// select().from().where().limit() eventually resolves to `rows`.
const selectChain = (rows: any[]): any => ({
  from: () => selectChain(rows),
  where: () => selectChain(rows),
  limit: () => selectChain(rows),
  then: (res: (v: any) => any, rej: (e: any) => any) => Promise.resolve(rows).then(res, rej),
})

describe('TenantDatabasesService.getDbForOrganization (resolver)', () => {
  it('returns the SHARED db when no active row exists', async () => {
    const db = { select: () => selectChain([]) }
    const svc = new TenantDatabasesService(db as any)
    const resolved = await svc.getDbForOrganization('org-1')
    assert.equal(resolved, db, 'must fall back to the injected shared db handle')
  })
})

describe('TenantDatabasesService masked projection', () => {
  const secret = 'postgres://admin:sup3r-s3cret-pw@db.internal.example.com:5432/tenant_acme'

  it('getForOrg never returns the raw connectionUrl', async () => {
    const row = {
      organizationId: 'org-1',
      connectionUrl: secret,
      status: 'active',
      label: 'Acme dedicated',
      lastCheckedAt: null,
    }
    const db = { select: () => selectChain([row]) }
    const svc = new TenantDatabasesService(db as any)

    const view = await svc.getForOrg('org-1')
    if (!view) throw new Error('expected a masked view')

    const serialized = JSON.stringify(view)
    assert.ok(!serialized.includes('sup3r-s3cret-pw'), 'must not leak the password')
    assert.ok(!serialized.includes(secret), 'must not leak the raw DSN')
    assert.equal((view as any).connectionUrl, undefined, 'view must not carry connectionUrl')
    assert.equal(view.status, 'active')
    assert.equal(view.host, 'db.internal.example.com:5432', 'host is masked to host:port only')
  })

  it('listAll masks every row', async () => {
    const rows = [
      { organizationId: 'o1', connectionUrl: 'postgres://u:pw-one@h1:5432/d', status: 'active', label: null, lastCheckedAt: null },
      { organizationId: 'o2', connectionUrl: 'postgres://u:pw-two@h2:6543/d', status: 'disabled', label: null, lastCheckedAt: null },
    ]
    const db = { select: () => selectChain(rows) }
    const svc = new TenantDatabasesService(db as any)

    const views = await svc.listAll()
    const serialized = JSON.stringify(views)
    assert.ok(!serialized.includes('pw-one') && !serialized.includes('pw-two'), 'must not leak any password')
    assert.equal(views[0].host, 'h1:5432')
    assert.equal(views[1].host, 'h2:6543')
  })

  it('maskConnectionHost collapses unparseable DSNs to ***', () => {
    assert.equal(maskConnectionHost('not a dsn'), '***')
    assert.equal(maskConnectionHost('postgres://u:p@only-host/db'), 'only-host')
  })
})

describe('TenantDatabasesService.upsertForOrg', () => {
  it('upserts and returns a masked view carrying the given status', async () => {
    let capturedValues: any
    let capturedSet: any
    const db = {
      insert: () => ({
        values: (values: any) => {
          capturedValues = values
          return {
            onConflictDoUpdate: (cfg: any) => {
              capturedSet = cfg.set
              return {
                returning: () =>
                  Promise.resolve([
                    {
                      organizationId: values.organizationId,
                      connectionUrl: values.connectionUrl,
                      status: values.status,
                      label: values.label,
                      lastCheckedAt: null,
                    },
                  ]),
              }
            },
          }
        },
      }),
    }
    const svc = new TenantDatabasesService(db as any)

    const view = await svc.upsertForOrg('org-1', {
      connectionUrl: 'postgres://u:pw@dedicated-host:5432/acme',
      label: 'Primary',
      status: 'active',
    })

    assert.equal(capturedValues.status, 'active', 'insert values carry the status')
    assert.equal(capturedSet.status, 'active', 'onConflict set updates the status')
    assert.equal(view.status, 'active')
    assert.equal(view.host, 'dedicated-host:5432')
    assert.equal((view as any).connectionUrl, undefined, 'view must not carry connectionUrl')
  })

  it('defaults status to pending when omitted', async () => {
    let capturedValues: any
    const db = {
      insert: () => ({
        values: (values: any) => {
          capturedValues = values
          return {
            onConflictDoUpdate: () => ({
              returning: () =>
                Promise.resolve([{ ...values, lastCheckedAt: null }]),
            }),
          }
        },
      }),
    }
    const svc = new TenantDatabasesService(db as any)
    const view = await svc.upsertForOrg('org-1', { connectionUrl: 'postgres://u:pw@h:5432/d' })
    assert.equal(capturedValues.status, 'pending')
    assert.equal(view.status, 'pending')
  })
})

describe('TenantDatabasesService.disable', () => {
  it('updates status to disabled and returns the masked view', async () => {
    let capturedSet: any
    const db = {
      update: () => ({
        set: (patch: any) => {
          capturedSet = patch
          return {
            where: () => ({
              returning: () =>
                Promise.resolve([
                  {
                    organizationId: 'org-1',
                    connectionUrl: 'postgres://u:pw@h:5432/d',
                    status: 'disabled',
                    label: null,
                    lastCheckedAt: null,
                  },
                ]),
            }),
          }
        },
      }),
    }
    const svc = new TenantDatabasesService(db as any)

    const view = await svc.disable('org-1')
    assert.equal(capturedSet.status, 'disabled', 'update sets status to disabled')
    if (!view) throw new Error('expected a masked view')
    assert.equal(view.status, 'disabled')
    assert.equal((view as any).connectionUrl, undefined, 'view must not carry connectionUrl')
  })
})
