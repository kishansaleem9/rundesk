import { UnauthorizedException } from '@nestjs/common'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it, mock } from 'node:test'
import { ScimService } from './scim.service'

type Fixture = {
  scimRow: {
    id: string
    workspaceId: string
    tokenHash: string
    revokedAt: Date | null
    expiresAt: Date | null
  } | null
}

function buildDb(fixture: Fixture) {
  return {
    select: mock.fn(() => ({
      from: mock.fn(() => ({
        where: mock.fn(() => ({
          limit: mock.fn(async () => (fixture.scimRow ? [fixture.scimRow] : [])),
        })),
      })),
    })),
    update: mock.fn(() => ({
      set: mock.fn(() => ({
        where: mock.fn(async () => undefined),
      })),
    })),
  } as any
}

function buildService(fixture: Fixture) {
  const db = buildDb(fixture)
  const security = { logAuditEvent: mock.fn(async () => undefined) } as any
  const groups = {} as any
  return { svc: new ScimService(db, security, groups), db, security }
}

function sha256(raw: string) {
  return createHash('sha256').update(raw).digest('hex')
}

describe('ScimService discovery endpoints', () => {
  it('exposes ServiceProviderConfig advertising PATCH + filter support', () => {
    const { svc } = buildService({ scimRow: null })
    const config = svc.serviceProviderConfig()
    assert.equal(config.patch.supported, true)
    assert.equal(config.bulk.supported, false)
    assert.equal(config.filter.supported, true)
    assert.ok(
      config.authenticationSchemes.some((s) => s.type === 'oauthbearertoken'),
      'should advertise oauth bearer token auth',
    )
  })

  it('schemas() includes both User and Group resources', () => {
    const { svc } = buildService({ scimRow: null })
    const result = svc.schemas()
    const ids = result.Resources.map((r) => r.id)
    assert.ok(ids.includes('urn:ietf:params:scim:schemas:core:2.0:User'))
    assert.ok(ids.includes('urn:ietf:params:scim:schemas:core:2.0:Group'))
  })

  it('resourceTypes() includes both Users and Groups endpoints', () => {
    const { svc } = buildService({ scimRow: null })
    const result = svc.resourceTypes()
    const endpoints = result.Resources.map((r) => r.endpoint)
    assert.deepEqual(new Set(endpoints), new Set(['/Users', '/Groups']))
  })
})

describe('ScimService.authenticate', () => {
  const sample = (raw: string, overrides: Partial<{ revokedAt: Date | null; expiresAt: Date | null }> = {}) => ({
    id: 'tok-1',
    workspaceId: 'ws-1',
    tokenHash: sha256(raw),
    revokedAt: null as Date | null,
    expiresAt: null as Date | null,
    ...overrides,
  })

  it('rejects missing token with 401', async () => {
    const { svc } = buildService({ scimRow: null })
    await assert.rejects(() => svc.authenticate(undefined), (e: unknown) => e instanceof UnauthorizedException)
  })

  it('rejects token without scim_ prefix', async () => {
    const { svc } = buildService({ scimRow: null })
    await assert.rejects(() => svc.authenticate('Bearer-style-junk'), (e: unknown) => e instanceof UnauthorizedException)
  })

  it('rejects unknown SCIM token', async () => {
    const { svc } = buildService({ scimRow: null })
    await assert.rejects(
      () => svc.authenticate('scim_unknown'),
      (e: unknown) => e instanceof UnauthorizedException,
    )
  })

  it('rejects revoked SCIM token', async () => {
    const raw = 'scim_revoked'
    const { svc } = buildService({ scimRow: sample(raw, { revokedAt: new Date() }) })
    await assert.rejects(
      () => svc.authenticate(raw),
      (e: unknown) => e instanceof UnauthorizedException && /revoked/i.test(e.message),
    )
  })

  it('rejects expired SCIM token', async () => {
    const raw = 'scim_expired'
    const past = new Date(Date.now() - 60_000)
    const { svc } = buildService({ scimRow: sample(raw, { expiresAt: past }) })
    await assert.rejects(
      () => svc.authenticate(raw),
      (e: unknown) => e instanceof UnauthorizedException && /expired/i.test(e.message),
    )
  })

  it('returns workspaceId for a valid SCIM token', async () => {
    const raw = 'scim_valid'
    const { svc } = buildService({ scimRow: sample(raw) })
    const workspaceId = await svc.authenticate(raw)
    assert.equal(workspaceId, 'ws-1')
  })
})
