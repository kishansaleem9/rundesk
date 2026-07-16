import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCESS_TOKEN_COOKIE,
  CSRF_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  clearAuthCookies,
  generateCsrfToken,
  setAuthCookies,
} from './auth-cookies'

type SetCall = { name: string; value: string; options: Record<string, any> }

function makeReply() {
  const set: SetCall[] = []
  const cleared: Array<{ name: string; options: Record<string, any> }> = []
  return {
    set,
    cleared,
    setCookie(name: string, value: string, options: Record<string, any>) {
      set.push({ name, value, options })
    },
    clearCookie(name: string, options: Record<string, any>) {
      cleared.push({ name, options })
    },
  }
}

// Build a JWT-shaped string whose payload carries `exp = now + seconds`.
function tokenExpiringIn(seconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds }),
  ).toString('base64url')
  return `${header}.${payload}.signature`
}

test('setAuthCookies sets all three cookies with the correct security flags', () => {
  const reply = makeReply()
  const csrf = setAuthCookies(
    reply,
    { accessToken: tokenExpiringIn(900), refreshToken: tokenExpiringIn(86_400) },
    { secure: true },
  )
  const byName = Object.fromEntries(reply.set.map((c) => [c.name, c])) as Record<string, SetCall>

  // access_token: httpOnly, secure, SameSite=Lax, path=/
  const access = byName[ACCESS_TOKEN_COOKIE]
  assert.equal(access.options.httpOnly, true)
  assert.equal(access.options.secure, true)
  assert.equal(access.options.sameSite, 'lax')
  assert.equal(access.options.path, '/')

  // refresh_token: httpOnly
  assert.equal(byName[REFRESH_TOKEN_COOKIE].options.httpOnly, true)

  // csrf_token: readable by JS (NOT httpOnly), value returned by the helper
  assert.equal(byName[CSRF_TOKEN_COOKIE].options.httpOnly, false)
  assert.equal(byName[CSRF_TOKEN_COOKIE].value, csrf)
})

test('setAuthCookies derives Max-Age from each token exp', () => {
  const reply = makeReply()
  setAuthCookies(
    reply,
    { accessToken: tokenExpiringIn(900), refreshToken: tokenExpiringIn(86_400) },
    { secure: true },
  )
  const byName = Object.fromEntries(reply.set.map((c) => [c.name, c])) as Record<string, SetCall>
  const access = byName[ACCESS_TOKEN_COOKIE].options.maxAge as number
  const refresh = byName[REFRESH_TOKEN_COOKIE].options.maxAge as number
  assert.ok(access > 890 && access <= 900, `access maxAge ~900s, got ${access}`)
  assert.ok(refresh > 86_390 && refresh <= 86_400, `refresh maxAge ~86400s, got ${refresh}`)
})

test('setAuthCookies leaves cookies non-secure in dev (secure:false)', () => {
  const reply = makeReply()
  setAuthCookies(
    reply,
    { accessToken: tokenExpiringIn(900), refreshToken: tokenExpiringIn(900) },
    { secure: false },
  )
  assert.ok(reply.set.every((c) => c.options.secure === false))
})

test('clearAuthCookies expires all three auth cookies', () => {
  const reply = makeReply()
  clearAuthCookies(reply, { secure: false })
  assert.deepEqual(
    reply.cleared.map((c) => c.name).sort(),
    [ACCESS_TOKEN_COOKIE, CSRF_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE].sort(),
  )
})

test('generateCsrfToken returns a unique 64-char hex value', () => {
  const a = generateCsrfToken()
  const b = generateCsrfToken()
  assert.match(a, /^[0-9a-f]{64}$/)
  assert.notEqual(a, b)
})
