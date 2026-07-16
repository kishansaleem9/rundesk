import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { OAuthService } from './oauth.service'
import type { OAuthProfile, OAuthTokens } from './oauth.service'

/**
 * Security regression: the Google/Microsoft provider access & refresh tokens
 * are used only transiently during the OAuth callback (to fetch the profile)
 * and are never read back anywhere in the app. `upsertUserAndLink` must NOT
 * persist them — it writes null into oauth_accounts.access_token/refresh_token
 * so there is no plaintext-secret-at-rest liability.
 */

function buildDb(limitResults: any[][]) {
  let call = 0
  const inserts: any[] = []
  const updates: any[] = []
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => limitResults[call++] ?? [],
        }),
      }),
    }),
    insert: () => ({
      values: (v: any) => {
        inserts.push(v)
        const awaitable: any = Promise.resolve(undefined)
        awaitable.returning = async () => [{ id: 'user-1', email: v.email, displayName: v.displayName }]
        return awaitable
      },
    }),
    update: () => ({
      set: (v: any) => {
        updates.push(v)
        return { where: async () => undefined }
      },
    }),
  } as any
  return { db, inserts, updates }
}

function buildService(limitResults: any[][]) {
  const { db, inserts, updates } = buildDb(limitResults)
  const config = {} as any // not used by upsertUserAndLink
  const security = { logAuditEvent: mock.fn(async () => undefined) } as any
  return { svc: new OAuthService(db, config, security), inserts, updates }
}

const PROFILE: OAuthProfile = { providerId: 'g-123', email: 'new@acme.test', displayName: 'New User', avatarUrl: null }
const TOKENS: OAuthTokens = { accessToken: 'ya29.SUPER_SECRET', refreshToken: 'rt.SUPER_SECRET', expiresAt: new Date() }

describe('OAuthService.upsertUserAndLink — provider tokens are not stored at rest', () => {
  it('inserts a new oauth_accounts row with null tokens (new user + new link)', async () => {
    const { svc, inserts } = buildService([[], []]) // no existing user, no existing link
    await svc.upsertUserAndLink('google', PROFILE, TOKENS)

    const oauthInsert = inserts.find((i) => 'provider' in i && 'accessToken' in i)
    assert.ok(oauthInsert, 'expected an oauth_accounts insert')
    assert.equal(oauthInsert.accessToken, null)
    assert.equal(oauthInsert.refreshToken, null)
    assert.equal(oauthInsert.expiresAt, null)
    // The real token material must never reach the database.
    assert.doesNotMatch(JSON.stringify(inserts), /SUPER_SECRET/)
  })

  it('nulls the tokens when refreshing an existing oauth_accounts link', async () => {
    const existingUser = {
      id: 'user-1',
      email: 'new@acme.test',
      displayName: 'New User',
      avatarUrl: null,
      emailVerified: true,
    }
    const existingLink = { id: 'link-1' }
    // 1st select → existing user; 2nd select → existing link.
    const { svc, updates } = buildService([[existingUser], [existingLink]])
    await svc.upsertUserAndLink('google', PROFILE, TOKENS)

    const oauthUpdate = updates.find((u) => 'accessToken' in u)
    assert.ok(oauthUpdate, 'expected an oauth_accounts update')
    assert.equal(oauthUpdate.accessToken, null)
    assert.equal(oauthUpdate.refreshToken, null)
    assert.equal(oauthUpdate.expiresAt, null)
    assert.doesNotMatch(JSON.stringify(updates), /SUPER_SECRET/)
  })
})
