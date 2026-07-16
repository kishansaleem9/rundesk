import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Social-login OAuth 2.0 helpers (Plan §1.1 "Google SSO" / "Microsoft SSO").
 *
 * Everything in this file is PURE (no DB, no Nest, no network) so the authorize
 * URL builder and the signed/expiring `state` codec can be unit-tested in
 * isolation. The stateful pieces (env creds, token exchange, user upsert) live
 * in oauth.service.ts.
 */

export type OAuthProvider = 'google' | 'microsoft'

export const OAUTH_PROVIDERS = ['google', 'microsoft'] as const

export function isOAuthProvider(value: string): value is OAuthProvider {
  return value === 'google' || value === 'microsoft'
}

type ProviderMeta = {
  authorizeUrl: string
  tokenUrl: string
  userInfoUrl: string
  scope: string
}

/** Provider authorize / token / userinfo endpoints (task spec + OIDC discovery). */
export const PROVIDER_META: Record<OAuthProvider, ProviderMeta> = {
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
  },
  microsoft: {
    authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    userInfoUrl: 'https://graph.microsoft.com/oidc/userinfo',
    scope: 'openid email profile',
  },
}

/**
 * Build the provider's authorization-endpoint URL with the standard code-flow
 * parameters. `redirectUri` MUST be byte-for-byte identical to the one used at
 * token-exchange time, so callers derive it from a single source (see
 * OAuthService.redirectUri).
 */
export function buildAuthorizeUrl(
  provider: OAuthProvider,
  params: { clientId: string; redirectUri: string; state: string; scope?: string },
): string {
  const meta = PROVIDER_META[provider]
  const url = new URL(meta.authorizeUrl)
  url.searchParams.set('client_id', params.clientId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', params.scope ?? meta.scope)
  url.searchParams.set('state', params.state)
  // Always let the user pick which account to use rather than silently reusing a
  // provider SSO session.
  url.searchParams.set('prompt', 'select_account')
  // Google returns a refresh token only when access_type=offline is requested.
  if (provider === 'google') url.searchParams.set('access_type', 'offline')
  return url.toString()
}

// ─── Signed, expiring OAuth `state` (CSRF protection) ────────────────────────
//
// The `state` we hand to the provider is an HMAC-signed, self-describing token:
//   base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload, secret))
// It is ALSO planted in a short-lived httpOnly cookie, so the callback verifies
// both (a) the signature/expiry and (b) that the round-tripped value matches the
// cookie the browser held — a double check against forged/replayed callbacks.

export type OAuthStatePayload = { provider: OAuthProvider; nonce: string; iat: number }

const DEFAULT_STATE_MAX_AGE_MS = 10 * 60 * 1000 // 10 minutes

export function signOAuthState(payload: OAuthStatePayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${sig}`
}

/** Fresh signed state for a login attempt (random nonce + issued-at timestamp). */
export function createOAuthState(provider: OAuthProvider, secret: string): string {
  return signOAuthState(
    { provider, nonce: randomBytes(16).toString('base64url'), iat: Date.now() },
    secret,
  )
}

/**
 * Verify a signed state token. Returns the decoded payload when the signature is
 * valid, the token is not expired, and (optionally) the provider matches;
 * otherwise null. Signature comparison is constant-time.
 */
export function verifyOAuthState(
  token: string | undefined | null,
  secret: string,
  opts: { provider?: OAuthProvider; maxAgeMs?: number } = {},
): OAuthStatePayload | null {
  if (!token || typeof token !== 'string') return null
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)

  const expected = createHmac('sha256', secret).update(body).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  let payload: OAuthStatePayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthStatePayload
  } catch {
    return null
  }
  if (!isOAuthProvider(payload?.provider)) return null
  if (opts.provider && payload.provider !== opts.provider) return null
  const maxAge = opts.maxAgeMs ?? DEFAULT_STATE_MAX_AGE_MS
  if (typeof payload.iat !== 'number' || payload.iat > Date.now() || Date.now() - payload.iat > maxAge) {
    return null
  }
  return payload
}
