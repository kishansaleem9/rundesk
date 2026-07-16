import test from 'node:test'
import assert from 'node:assert/strict'
import { isCsrfRequestAllowed } from './csrf.guard'

// Double-submit CSRF decision table (Plan §1.1 requirement 5).

test('CSRF: safe GET is always allowed, even when cookie-authenticated', () => {
  assert.equal(isCsrfRequestAllowed({ method: 'GET', cookies: { access_token: 'x' } }), true)
})

test('CSRF: HEAD/OPTIONS are allowed', () => {
  assert.equal(isCsrfRequestAllowed({ method: 'HEAD', cookies: { access_token: 'x' } }), true)
  assert.equal(isCsrfRequestAllowed({ method: 'OPTIONS', cookies: { access_token: 'x' } }), true)
})

test('CSRF: Bearer-authenticated POST is exempt (cannot be CSRF-forged)', () => {
  assert.equal(
    isCsrfRequestAllowed({ method: 'POST', headers: { authorization: 'Bearer token' }, cookies: {} }),
    true,
  )
})

test('CSRF: Bearer exemption still applies even if cookies are also attached', () => {
  assert.equal(
    isCsrfRequestAllowed({
      method: 'POST',
      headers: { authorization: 'Bearer token' },
      cookies: { access_token: 'a', csrf_token: 'c' },
    }),
    true,
  )
})

test('CSRF: cookie-less unsafe request is exempt (not cookie-authenticated)', () => {
  assert.equal(isCsrfRequestAllowed({ method: 'POST', headers: {}, cookies: {} }), true)
})

test('CSRF: cookie-authenticated POST with NO X-CSRF-Token header is rejected', () => {
  assert.equal(
    isCsrfRequestAllowed({ method: 'POST', headers: {}, cookies: { access_token: 'a', csrf_token: 'c' } }),
    false,
  )
})

test('CSRF: cookie-authenticated POST with a MISMATCHED header is rejected', () => {
  assert.equal(
    isCsrfRequestAllowed({
      method: 'POST',
      headers: { 'x-csrf-token': 'wrong' },
      cookies: { access_token: 'a', csrf_token: 'c' },
    }),
    false,
  )
})

test('CSRF: cookie-authenticated POST with a MATCHING header is allowed', () => {
  assert.equal(
    isCsrfRequestAllowed({
      method: 'POST',
      headers: { 'x-csrf-token': 'c' },
      cookies: { access_token: 'a', csrf_token: 'c' },
    }),
    true,
  )
})

test('CSRF: access cookie present but csrf cookie missing is rejected', () => {
  assert.equal(
    isCsrfRequestAllowed({ method: 'POST', headers: { 'x-csrf-token': 'c' }, cookies: { access_token: 'a' } }),
    false,
  )
})

test('CSRF: PUT/PATCH/DELETE follow the same cookie rule', () => {
  for (const method of ['PUT', 'PATCH', 'DELETE']) {
    assert.equal(
      isCsrfRequestAllowed({ method, headers: {}, cookies: { access_token: 'a', csrf_token: 'c' } }),
      false,
      `${method} without header must be rejected`,
    )
    assert.equal(
      isCsrfRequestAllowed({ method, headers: { 'x-csrf-token': 'c' }, cookies: { access_token: 'a', csrf_token: 'c' } }),
      true,
      `${method} with matching header must be allowed`,
    )
  }
})

// Cookie-auth refresh/logout present only a refresh_token cookie (no
// access_token). Those state-changing calls must also be CSRF-protected.

test('CSRF: refresh_token cookie alone is now a CSRF target — POST without header rejected', () => {
  assert.equal(
    isCsrfRequestAllowed({ method: 'POST', headers: {}, cookies: { refresh_token: 'r', csrf_token: 'c' } }),
    false,
  )
})

test('CSRF: refresh_token cookie with a MATCHING header is allowed', () => {
  assert.equal(
    isCsrfRequestAllowed({
      method: 'POST',
      headers: { 'x-csrf-token': 'c' },
      cookies: { refresh_token: 'r', csrf_token: 'c' },
    }),
    true,
  )
})

test('CSRF: refresh_token cookie but missing csrf cookie is rejected', () => {
  assert.equal(
    isCsrfRequestAllowed({ method: 'POST', headers: { 'x-csrf-token': 'c' }, cookies: { refresh_token: 'r' } }),
    false,
  )
})

test('CSRF: neither access nor refresh cookie → still exempt (not cookie-authenticated)', () => {
  assert.equal(isCsrfRequestAllowed({ method: 'POST', headers: {}, cookies: { csrf_token: 'c' } }), true)
})

test('CSRF: constant-time compare rejects mismatched-length tokens without throwing', () => {
  assert.equal(
    isCsrfRequestAllowed({
      method: 'POST',
      headers: { 'x-csrf-token': 'short' },
      cookies: { access_token: 'a', csrf_token: 'a-much-longer-token-value' },
    }),
    false,
  )
})
