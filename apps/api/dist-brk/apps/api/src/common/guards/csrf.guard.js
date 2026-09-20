"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CsrfGuard = void 0;
exports.isCsrfRequestAllowed = isCsrfRequestAllowed;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const auth_cookies_1 = require("../../modules/auth/auth-cookies");
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/**
 * Constant-time string comparison. Returns false immediately on a length
 * mismatch (timingSafeEqual throws on unequal-length buffers), otherwise
 * compares in time independent of how many leading bytes match — so an attacker
 * cannot recover the token byte-by-byte from response timing.
 */
function constantTimeEqual(a, b) {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length)
        return false;
    return (0, node_crypto_1.timingSafeEqual)(bufA, bufB);
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
function isCsrfRequestAllowed(req) {
    const method = (req.method ?? 'GET').toUpperCase();
    if (SAFE_METHODS.has(method))
        return true;
    const authHeader = req.headers?.['authorization'];
    if (typeof authHeader === 'string' && /^bearer\s+/i.test(authHeader))
        return true;
    const accessCookie = req.cookies?.[auth_cookies_1.ACCESS_TOKEN_COOKIE];
    const refreshCookie = req.cookies?.[auth_cookies_1.REFRESH_TOKEN_COOKIE];
    if (!accessCookie && !refreshCookie)
        return true; // no cookie-auth material → not a CSRF target
    const headerToken = req.headers?.[auth_cookies_1.CSRF_HEADER];
    const cookieToken = req.cookies?.[auth_cookies_1.CSRF_TOKEN_COOKIE];
    if (!cookieToken || typeof headerToken !== 'string' || headerToken.length === 0)
        return false;
    return constantTimeEqual(headerToken, cookieToken);
}
/**
 * Global guard that applies {@link isCsrfRequestAllowed} to HTTP requests.
 * Registered via APP_GUARD in AppModule.
 */
let CsrfGuard = class CsrfGuard {
    canActivate(context) {
        // Only HTTP requests carry the cookies/headers this check relies on;
        // WebSocket / RPC contexts are out of scope.
        if (context.getType() !== 'http')
            return true;
        const req = context.switchToHttp().getRequest();
        if (isCsrfRequestAllowed(req))
            return true;
        throw new common_1.ForbiddenException('Invalid or missing CSRF token');
    }
};
exports.CsrfGuard = CsrfGuard;
exports.CsrfGuard = CsrfGuard = __decorate([
    (0, common_1.Injectable)()
], CsrfGuard);
//# sourceMappingURL=csrf.guard.js.map