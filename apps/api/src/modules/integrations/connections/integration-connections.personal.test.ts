import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getTableName } from 'drizzle-orm'
import type { ConfigService } from '@nestjs/config'
import { IntegrationConnectionsService } from './integration-connections.service'

/**
 * A PERSONAL GRANT IS THE PERSON'S ALONE
 * (`found-24-sep/personal-calendar-connect-needs-integrations-manage`).
 *
 * ClickUp's calendar integrations are private to the person who connects one.
 * A calendar connected from the planner carries `personal` in its signed
 * state, and its callback writes that person's account and nothing of the
 * workspace's — not the connection row the task push and pull run on, which
 * is the admin's to set in the App Center. A grant started there writes the
 * workspace's row, and the person's account beside it, as it always did.
 *
 * The provider's half (the code exchange, the profile) is stubbed on the
 * instance: what is measured is which rows each grant writes.
 */

const config = {
  get: (key: string) => (key === 'JWT_ACCESS_SECRET' ? 'unit-test-secret' : undefined),
  getOrThrow: (key: string) => {
    if (key === 'JWT_ACCESS_SECRET') return 'unit-test-secret'
    throw new Error(`Configuration key "${key}" does not exist`)
  },
} as unknown as ConfigService

/** A database that answers the membership read, holds no connection yet, and records every write by table. */
function makeDb() {
  const writes: string[] = []
  const chain = (): any => {
    let table = '?'
    const c: any = {
      from: (t: unknown) => { table = getTableName(t as never); return c },
      where: () => c,
      limit: () => c,
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(table === 'workspace_members' ? [{ id: 'membership' }] : []).then(resolve),
    }
    return c
  }
  const write = (kind: string) => (t: unknown) => {
    writes.push(`${kind} ${getTableName(t as never)}`)
    const c: any = { values: () => c, set: () => c, where: () => c, returning: () => c, then: (r: (v: unknown) => unknown) => Promise.resolve([]).then(r) }
    return c
  }
  return { db: { select: () => chain(), insert: write('insert'), update: write('update') }, writes }
}

function makeSvc() {
  const { db, writes } = makeDb()
  const accounts: unknown[] = []
  const audits: Array<{ action: string }> = []
  const svc = new IntegrationConnectionsService(
    db as never,
    { logAuditEvent: async (e: { action: string }) => { audits.push(e) } } as never,
    config,
    {} as never,
    { upsertFromOAuth: async (input: unknown) => { accounts.push(input); return { id: 'acct', created: true } } } as never,
  )
  Object.assign(svc as never, {
    exchangeCode: async () => ({ accessToken: 'access', refreshToken: 'refresh', expiresAt: null, scopes: ['calendar'] }),
    fetchProfile: async () => ({ id: 'google-account-1', email: 'person@example.com', metadata: {} }),
  })
  return { svc, writes, accounts, audits }
}

/** The state a start hands out, read back from its consent address. */
const stateFrom = (authUrl: string) => new URL(authUrl).searchParams.get('state') ?? ''

describe('IntegrationConnectionsService: a personal calendar grant', () => {
  it('writes the person’s own account and nothing of the workspace’s', async () => {
    const { svc, writes, accounts, audits } = makeSvc()
    const { authUrl } = await svc.getOAuthStartUrl('w1', 'u1', 'gcal', { personal: true })
    const result = await svc.handleOAuthCallback('gcal', 'code', stateFrom(authUrl))
    assert.equal(result.personal, true, 'the callback did not answer as a personal grant')
    assert.equal(accounts.length, 1, 'the person’s account was not written')
    assert.deepEqual(
      writes.filter((w) => w.endsWith('workspace_integration_connections')),
      [],
      `a personal grant wrote the workspace’s connection: ${JSON.stringify(writes)}`,
    )
    assert.ok(audits.some((a) => a.action === 'calendar_account.connected'), `no record of the connect: ${JSON.stringify(audits)}`)
  })

  it('a grant from the App Center writes the workspace’s connection, and the person’s account beside it', async () => {
    const { svc, writes, accounts } = makeSvc()
    const { authUrl } = await svc.getOAuthStartUrl('w1', 'u1', 'gcal')
    const result = await svc.handleOAuthCallback('gcal', 'code', stateFrom(authUrl))
    assert.notEqual(result.personal, true)
    assert.ok(writes.includes('insert workspace_integration_connections'), `the workspace’s connection was not written: ${JSON.stringify(writes)}`)
    assert.equal(accounts.length, 1)
  })

  it('is a calendar or nothing: no other provider is connected by one person for themselves', async () => {
    const { svc } = makeSvc()
    await assert.rejects(() => svc.getOAuthStartUrl('w1', 'u1', 'github', { personal: true }), /calendar/i)
  })
})
