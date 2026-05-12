import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it, mock } from 'node:test'
import { SsoService } from './sso.service'

function buildService() {
  const db = {} as any
  const config = {
    get: mock.fn(() => 'http://localhost:3001'),
    getOrThrow: mock.fn(() => 'http://localhost:3001'),
  } as any
  const security = { logAuditEvent: mock.fn(async () => undefined) } as any
  return new SsoService(db, config, security)
}

describe('SsoService SCIM helpers', () => {
  it('hashScimToken returns deterministic sha256 hash', () => {
    const svc = buildService()
    const out = svc.hashScimToken('scim_test-token')
    const expected = createHash('sha256').update('scim_test-token').digest('hex')
    assert.equal(out, expected)
  })

  it('generateScimToken returns a scim_-prefixed token with matching sha256 hash', () => {
    const svc = buildService()
    const { raw, hash, prefix } = svc.generateScimToken()
    assert.ok(raw.startsWith('scim_'), 'raw token must start with scim_')
    assert.equal(prefix.length, 12, 'prefix must be 12 chars for display')
    assert.equal(raw.slice(0, 12), prefix, 'prefix must match the raw token prefix')
    assert.equal(hash, createHash('sha256').update(raw).digest('hex'))
  })

  it('generates unique tokens across multiple calls', () => {
    const svc = buildService()
    const a = svc.generateScimToken()
    const b = svc.generateScimToken()
    assert.notEqual(a.raw, b.raw)
    assert.notEqual(a.hash, b.hash)
  })
})
