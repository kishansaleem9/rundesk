import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { timingSafeEqual } from 'node:crypto'
import { ACCESS_TOKEN_COOKIE, CSRF_HEADER, CSRF_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '../../modules/auth/auth-cookies'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export type CsrfRequest = {
  method?: string
  headers?: Record<string, unknown>
  cookies?: Record<string, string | undefined>
}

/**
 * Constant-time string comparison. Returns false immediately on a length
 * mismatch (timingSafeEqual throws on unequal-length buffers), otherwise
 * compares in time independent of how many leading bytes match — so an attacker
 * cannot recover the token byte-by-byte from response timing.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * Double-submit CSRF decision (pure + unit-testable).
 *
 * Enforced ONLY for cookie-authenticated, state-changing requests:
 *   1. Safe methods (GET/HEAD/OPTIONS) are always allowed — never mutate state.
 *   2. Bearer-authenticated requests (Authorization header present) are exempt:
 *      a cross-site attacker cannot attach that header, so they can't be CSRF'd.
 *   3. Requests carrying NEITHER an `access_token` NOR a `refresh_token` cookie
 *      are not cookie-authenticated, so there is nothing for CSRF to protect.
 *      The refresh_token cookie counts too: cookie-auth refresh/logout present
 *      only a refresh_token, and those state-changing calls must be protected.
 *   4. Otherwise the `X-CSRF-Token` header MUST be present and equal (in
 *      constant time) to the `csrf_token` cookie.
 */
export function isCsrfRequestAllowed(req: CsrfRequest): boolean {
  const method = (req.method ?? 'GET').toUpperCase()
  if (SAFE_METHODS.has(method)) return true

  const authHeader = req.headers?.['authorization']
  if (typeof authHeader === 'string' && /^bearer\s+/i.test(authHeader)) return true

  const accessCookie = req.cookies?.[ACCESS_TOKEN_COOKIE]
  const refreshCookie = req.cookies?.[REFRESH_TOKEN_COOKIE]
  if (!accessCookie && !refreshCookie) return true // no cookie-auth material → not a CSRF target

  const headerToken = req.headers?.[CSRF_HEADER]
  const cookieToken = req.cookies?.[CSRF_TOKEN_COOKIE]
  if (!cookieToken || typeof headerToken !== 'string' || headerToken.length === 0) return false
  return constantTimeEqual(headerToken, cookieToken)
}

/**
 * Global guard that applies {@link isCsrfRequestAllowed} to HTTP requests.
 * Registered via APP_GUARD in AppModule.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    // Only HTTP requests carry the cookies/headers this check relies on;
    // WebSocket / RPC contexts are out of scope.
    if (context.getType() !== 'http') return true
    const req = context.switchToHttp().getRequest<CsrfRequest>()
    if (isCsrfRequestAllowed(req)) return true
    throw new ForbiddenException('Invalid or missing CSRF token')
  }
}
