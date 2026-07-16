import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAuthorizeUrl,
  createOAuthState,
  isOAuthProvider,
  PROVIDER_META,
  signOAuthState,
  verifyOAuthState,
} from './oauth.util'

const SECRET = 'test-oauth-state-secret'

test('isOAuthProvider only accepts google/microsoft', () => {
  assert.equal(isOAuthProvider('google'), true)
  assert.equal(isOAuthProvider('microsoft'), true)
  assert.equal(isOAuthProvider('github'), false)
  assert.equal(isOAuthProvider('providers'), false)
  assert.equal(isOAuthProvider(''), false)
})

test('buildAuthorizeUrl builds a Google authorize URL with all code-flow params', () => {
  const url = new URL(
    buildAuthorizeUrl('google', {
      clientId: 'client-123',
      redirectUri: 'http://localhost:3001/api/v1/auth/oauth/google/callback',
      state: 'signed-state',
    }),
  )
  assert.equal(`${url.origin}${url.pathname}`, PROVIDER_META.google.authorizeUrl)
  assert.equal(url.searchParams.get('client_id'), 'client-123')
  assert.equal(
    url.searchParams.get('redirect_uri'),
    'http://localhost:3001/api/v1/auth/oauth/google/callback',
  )
  assert.equal(url.searchParams.get('response_type'), 'code')
  assert.equal(url.searchParams.get('scope'), 'openid email profile')
  assert.equal(url.searchParams.get('state'), 'signed-state')
  assert.equal(url.searchParams.get('access_type'), 'offline') // Google-only
})

test('buildAuthorizeUrl targets the Microsoft common tenant and omits access_type', () => {
  const url = new URL(
    buildAuthorizeUrl('microsoft', {
      clientId: 'ms-client',
      redirectUri: 'http://localhost:3001/api/v1/auth/oauth/microsoft/callback',
      state: 'st',
    }),
  )
  assert.equal(`${url.origin}${url.pathname}`, PROVIDER_META.microsoft.authorizeUrl)
  assert.equal(url.searchParams.get('client_id'), 'ms-client')
  assert.equal(url.searchParams.get('response_type'), 'code')
  assert.equal(url.searchParams.get('access_type'), null)
})

test('createOAuthState → verifyOAuthState round-trips and carries the provider', () => {
  const state = createOAuthState('google', SECRET)
  const payload = verifyOAuthState(state, SECRET, { provider: 'google' })
  assert.ok(payload)
  assert.equal(payload!.provider, 'google')
  assert.match(payload!.nonce, /.+/)
})

test('verifyOAuthState rejects a wrong provider expectation', () => {
  const state = createOAuthState('google', SECRET)
  assert.equal(verifyOAuthState(state, SECRET, { provider: 'microsoft' }), null)
})

test('verifyOAuthState rejects a tampered payload', () => {
  const state = createOAuthState('google', SECRET)
  const [body, sig] = state.split('.')
  const forged = Buffer.from(
    JSON.stringify({ provider: 'microsoft', nonce: 'x', iat: Date.now() }),
  ).toString('base64url')
  assert.notEqual(body, forged)
  assert.equal(verifyOAuthState(`${forged}.${sig}`, SECRET), null)
})

test('verifyOAuthState rejects a wrong signing secret', () => {
  const state = createOAuthState('microsoft', SECRET)
  assert.equal(verifyOAuthState(state, 'different-secret'), null)
})

test('verifyOAuthState rejects an expired state', () => {
  const stale = signOAuthState(
    { provider: 'google', nonce: 'n', iat: Date.now() - 60 * 60 * 1000 },
    SECRET,
  )
  assert.equal(verifyOAuthState(stale, SECRET, { maxAgeMs: 10 * 60 * 1000 }), null)
})

test('verifyOAuthState rejects malformed / empty tokens', () => {
  assert.equal(verifyOAuthState('', SECRET), null)
  assert.equal(verifyOAuthState('nodot', SECRET), null)
  assert.equal(verifyOAuthState(undefined, SECRET), null)
})
