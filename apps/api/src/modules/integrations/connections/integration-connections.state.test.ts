import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createHmac } from 'node:crypto'
import type { ConfigService } from '@nestjs/config'
import { IntegrationConnectionsService } from './integration-connections.service'

/**
 * Integration OAuth `state` signing key. The state is the CSRF/binding token
 * round-tripped through the provider, so its HMAC key must be a real secret.
 * The previous code keyed it on a never-defined `JWT_SECRET` env var and a
 * hardcoded literal (a forgeable, predictable key). It is now keyed on
 * `JWT_ACCESS_SECRET` via `getOrThrow` (mirroring social-login OAuthService),
 * with an optional dedicated override — and never on a predictable fallback.
 */

/** Deterministic ConfigService stub (independent of process.env). */
function fakeConfig(vals: Record<string, string | undefined>): ConfigService {
  return {
    get<T = string>(key: string): T | undefined {
      return vals[key] as unknown as T | undefined
    },
    getOrThrow<T = string>(key: string): T {
      const v = vals[key]
      if (v === undefined || v === null) throw new Error(`Configuration key "${key}" does not exist`)
      return v as unknown as T
    },
  } as unknown as ConfigService
}

const makeSvc = (vals: Record<string, string | undefined>) =>
  // The fifth argument is CalendarAccountsService (§V2-14). These checks only
  // exercise OAuth state signing, so every collaborator is a stub.
  new IntegrationConnectionsService({} as any, {} as any, fakeConfig(vals), {} as any, {} as any)

const payload = { provider: 'github', workspaceId: 'w1', userId: 'u1', ts: 1_700_000_000_000 }

describe('IntegrationConnectionsService OAuth state secret', () => {
  it('signs the state with JWT_ACCESS_SECRET when no dedicated secret is set', () => {
    const svc = makeSvc({ JWT_ACCESS_SECRET: 'jwt-access-key' })
    const state = (svc as any).signState(payload) as string
    const [body, sig] = state.split('.')
    const expected = createHmac('sha256', 'jwt-access-key').update(body).digest('base64url')
    assert.equal(sig, expected, 'signature is keyed on JWT_ACCESS_SECRET')
  })

  it('verifies a state signed with the same key and rejects one signed with a different key', () => {
    const svc = makeSvc({ JWT_ACCESS_SECRET: 'jwt-access-key' })
    const state = (svc as any).signState(payload) as string

    const verified = (svc as any).verifyState(state)
    assert.equal(verified.workspaceId, 'w1')
    assert.equal(verified.provider, 'github')

    const other = makeSvc({ JWT_ACCESS_SECRET: 'a-completely-different-key' })
    assert.throws(() => (other as any).verifyState(state), /Invalid OAuth signature/)
  })

  it('prefers INTEGRATIONS_OAUTH_STATE_SECRET over JWT_ACCESS_SECRET when present', () => {
    const svc = makeSvc({ INTEGRATIONS_OAUTH_STATE_SECRET: 'dedicated-secret', JWT_ACCESS_SECRET: 'jwt-access-key' })
    const state = (svc as any).signState(payload) as string
    const [body, sig] = state.split('.')
    assert.equal(sig, createHmac('sha256', 'dedicated-secret').update(body).digest('base64url'))
  })

  it('never falls back to a predictable/empty key — throws when nothing is configured', () => {
    const svc = makeSvc({})
    assert.throws(() => (svc as any).signState(payload), /JWT_ACCESS_SECRET/)

    // Regression guard: the removed hardcoded literal must not verify a state.
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const legacySig = createHmac('sha256', 'rundesk-oauth-state').update(body).digest('base64url')
    const legacyState = `${body}.${legacySig}`
    const svcWithKey = makeSvc({ JWT_ACCESS_SECRET: 'jwt-access-key' })
    assert.throws(() => (svcWithKey as any).verifyState(legacyState), /Invalid OAuth signature/)
  })
})
