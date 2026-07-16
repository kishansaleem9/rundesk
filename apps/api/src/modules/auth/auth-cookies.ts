import { randomBytes } from 'node:crypto'

/**
 * Secure-token-storage cookies (Plan §1.1).
 *
 * These cookies are ADDITIVE: every endpoint that sets them still returns the
 * raw tokens in its JSON body, so Bearer / API-token clients (and the existing
 * test suite) keep working unchanged. Browsers additionally receive httpOnly
 * cookies so the access token never has to live in localStorage.
 */
export const ACCESS_TOKEN_COOKIE = 'access_token'
export const REFRESH_TOKEN_COOKIE = 'refresh_token'
export const CSRF_TOKEN_COOKIE = 'csrf_token'

// Header the double-submit CSRF check looks for (lower-cased: Fastify/Node
// normalise incoming header names to lower case).
export const CSRF_HEADER = 'x-csrf-token'

// Fallback lifetimes (seconds), used only if a token carries no `exp` claim.
const ACCESS_FALLBACK_MAX_AGE = 15 * 60
const REFRESH_FALLBACK_MAX_AGE = 7 * 24 * 60 * 60

/** Minimal shape of the reply object we need — keeps this file framework-light. */
export type CookieCarrier = {
  setCookie(name: string, value: string, options?: Record<string, unknown>): unknown
  clearCookie(name: string, options?: Record<string, unknown>): unknown
}

/**
 * Read a JWT's `exp` (epoch seconds) WITHOUT verifying the signature. We only
 * use it to size the cookie Max-Age so the browser drops the cookie no later
 * than the token itself expires. Signature validity is enforced elsewhere
 * (JwtStrategy for access, AuthService.refresh for refresh).
 */
function secondsUntilExpiry(token: string, fallback: number): number {
  try {
    const parts = token.split('.')
    if (parts.length >= 2) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
        exp?: number
      }
      if (typeof payload.exp === 'number') {
        const remaining = payload.exp - Math.floor(Date.now() / 1000)
        return remaining > 0 ? remaining : 0
      }
    }
  } catch {
    /* malformed token — fall through to the fallback lifetime */
  }
  return fallback
}

/** Fresh random value for the double-submit CSRF cookie/header pair. */
export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Set the httpOnly access + refresh cookies and the client-readable CSRF
 * cookie. Returns the CSRF value that was written (callers rarely need it —
 * the browser reads it straight off the cookie).
 */
export function setAuthCookies(
  reply: CookieCarrier,
  tokens: { accessToken: string; refreshToken: string },
  opts: { secure: boolean; csrfToken?: string },
): string {
  const csrfToken = opts.csrfToken ?? generateCsrfToken()
  const base = { path: '/', secure: opts.secure, sameSite: 'lax' as const }
  const refreshMaxAge = secondsUntilExpiry(tokens.refreshToken, REFRESH_FALLBACK_MAX_AGE)

  reply.setCookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    ...base,
    httpOnly: true,
    maxAge: secondsUntilExpiry(tokens.accessToken, ACCESS_FALLBACK_MAX_AGE),
  })
  reply.setCookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...base,
    httpOnly: true,
    maxAge: refreshMaxAge,
  })
  // Readable by client JS (double-submit pattern) → httpOnly:false. Lives as
  // long as the refresh session so a refresh POST always has a cookie to match
  // its X-CSRF-Token header against.
  reply.setCookie(CSRF_TOKEN_COOKIE, csrfToken, {
    ...base,
    httpOnly: false,
    maxAge: refreshMaxAge,
  })
  return csrfToken
}

/** Expire all three auth cookies (logout). */
export function clearAuthCookies(reply: CookieCarrier, opts: { secure: boolean }): void {
  const base = { path: '/', secure: opts.secure, sameSite: 'lax' as const }
  reply.clearCookie(ACCESS_TOKEN_COOKIE, { ...base, httpOnly: true })
  reply.clearCookie(REFRESH_TOKEN_COOKIE, { ...base, httpOnly: true })
  reply.clearCookie(CSRF_TOKEN_COOKIE, { ...base, httpOnly: false })
}
