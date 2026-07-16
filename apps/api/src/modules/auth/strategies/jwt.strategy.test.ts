import test from 'node:test'
import assert from 'node:assert/strict'
import { cookieOrBearerExtractor } from './jwt.strategy'

// The dual extractor is the heart of Plan §1.1's "cookies for browsers, Bearer
// still works" requirement, so it is unit-tested directly.

test('cookieOrBearerExtractor prefers the access_token cookie over the Bearer header', () => {
  const req = { cookies: { access_token: 'cookie-jwt' }, headers: { authorization: 'Bearer header-jwt' } }
  assert.equal(cookieOrBearerExtractor(req as any), 'cookie-jwt')
})

test('cookieOrBearerExtractor falls back to the Bearer header when no cookie is present', () => {
  const req = { cookies: {}, headers: { authorization: 'Bearer header-jwt' } }
  assert.equal(cookieOrBearerExtractor(req as any), 'header-jwt')
})

test('cookieOrBearerExtractor tolerates a missing cookies object (Bearer only)', () => {
  const req = { headers: { authorization: 'Bearer only-bearer' } }
  assert.equal(cookieOrBearerExtractor(req as any), 'only-bearer')
})

test('cookieOrBearerExtractor returns null when neither cookie nor Bearer header is present', () => {
  const req = { cookies: {}, headers: {} }
  assert.equal(cookieOrBearerExtractor(req as any), null)
})
