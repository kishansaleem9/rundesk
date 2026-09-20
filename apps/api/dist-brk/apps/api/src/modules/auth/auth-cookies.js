"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CSRF_HEADER = exports.CSRF_TOKEN_COOKIE = exports.REFRESH_TOKEN_COOKIE = exports.ACCESS_TOKEN_COOKIE = void 0;
exports.generateCsrfToken = generateCsrfToken;
exports.setAuthCookies = setAuthCookies;
exports.clearAuthCookies = clearAuthCookies;
const node_crypto_1 = require("node:crypto");
/**
 * Secure-token-storage cookies (Plan §1.1).
 *
 * These cookies are ADDITIVE: every endpoint that sets them still returns the
 * raw tokens in its JSON body, so Bearer / API-token clients (and the existing
 * test suite) keep working unchanged. Browsers additionally receive httpOnly
 * cookies so the access token never has to live in localStorage.
 */
exports.ACCESS_TOKEN_COOKIE = 'access_token';
exports.REFRESH_TOKEN_COOKIE = 'refresh_token';
exports.CSRF_TOKEN_COOKIE = 'csrf_token';
// Header the double-submit CSRF check looks for (lower-cased: Fastify/Node
// normalise incoming header names to lower case).
exports.CSRF_HEADER = 'x-csrf-token';
// Fallback lifetimes (seconds), used only if a token carries no `exp` claim.
const ACCESS_FALLBACK_MAX_AGE = 15 * 60;
const REFRESH_FALLBACK_MAX_AGE = 7 * 24 * 60 * 60;
/**
 * Read a JWT's `exp` (epoch seconds) WITHOUT verifying the signature. We only
 * use it to size the cookie Max-Age so the browser drops the cookie no later
 * than the token itself expires. Signature validity is enforced elsewhere
 * (JwtStrategy for access, AuthService.refresh for refresh).
 */
function secondsUntilExpiry(token, fallback) {
    try {
        const parts = token.split('.');
        if (parts.length >= 2) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
            if (typeof payload.exp === 'number') {
                const remaining = payload.exp - Math.floor(Date.now() / 1000);
                return remaining > 0 ? remaining : 0;
            }
        }
    }
    catch {
        /* malformed token — fall through to the fallback lifetime */
    }
    return fallback;
}
/** Fresh random value for the double-submit CSRF cookie/header pair. */
function generateCsrfToken() {
    return (0, node_crypto_1.randomBytes)(32).toString('hex');
}
/**
 * Set the httpOnly access + refresh cookies and the client-readable CSRF
 * cookie. Returns the CSRF value that was written (callers rarely need it —
 * the browser reads it straight off the cookie).
 */
function setAuthCookies(reply, tokens, opts) {
    const csrfToken = opts.csrfToken ?? generateCsrfToken();
    const base = { path: '/', secure: opts.secure, sameSite: 'lax' };
    const refreshMaxAge = secondsUntilExpiry(tokens.refreshToken, REFRESH_FALLBACK_MAX_AGE);
    reply.setCookie(exports.ACCESS_TOKEN_COOKIE, tokens.accessToken, {
        ...base,
        httpOnly: true,
        maxAge: secondsUntilExpiry(tokens.accessToken, ACCESS_FALLBACK_MAX_AGE),
    });
    reply.setCookie(exports.REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
        ...base,
        httpOnly: true,
        maxAge: refreshMaxAge,
    });
    // Readable by client JS (double-submit pattern) → httpOnly:false. Lives as
    // long as the refresh session so a refresh POST always has a cookie to match
    // its X-CSRF-Token header against.
    reply.setCookie(exports.CSRF_TOKEN_COOKIE, csrfToken, {
        ...base,
        httpOnly: false,
        maxAge: refreshMaxAge,
    });
    return csrfToken;
}
/** Expire all three auth cookies (logout). */
function clearAuthCookies(reply, opts) {
    const base = { path: '/', secure: opts.secure, sameSite: 'lax' };
    reply.clearCookie(exports.ACCESS_TOKEN_COOKIE, { ...base, httpOnly: true });
    reply.clearCookie(exports.REFRESH_TOKEN_COOKIE, { ...base, httpOnly: true });
    reply.clearCookie(exports.CSRF_TOKEN_COOKIE, { ...base, httpOnly: false });
}
//# sourceMappingURL=auth-cookies.js.map