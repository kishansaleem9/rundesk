/**
 * Secure-token-storage cookies (Plan §1.1).
 *
 * These cookies are ADDITIVE: every endpoint that sets them still returns the
 * raw tokens in its JSON body, so Bearer / API-token clients (and the existing
 * test suite) keep working unchanged. Browsers additionally receive httpOnly
 * cookies so the access token never has to live in localStorage.
 */
export declare const ACCESS_TOKEN_COOKIE = "access_token";
export declare const REFRESH_TOKEN_COOKIE = "refresh_token";
export declare const CSRF_TOKEN_COOKIE = "csrf_token";
export declare const CSRF_HEADER = "x-csrf-token";
/** Minimal shape of the reply object we need — keeps this file framework-light. */
export type CookieCarrier = {
    setCookie(name: string, value: string, options?: Record<string, unknown>): unknown;
    clearCookie(name: string, options?: Record<string, unknown>): unknown;
};
/** Fresh random value for the double-submit CSRF cookie/header pair. */
export declare function generateCsrfToken(): string;
/**
 * Set the httpOnly access + refresh cookies and the client-readable CSRF
 * cookie. Returns the CSRF value that was written (callers rarely need it —
 * the browser reads it straight off the cookie).
 */
export declare function setAuthCookies(reply: CookieCarrier, tokens: {
    accessToken: string;
    refreshToken: string;
}, opts: {
    secure: boolean;
    csrfToken?: string;
}): string;
/** Expire all three auth cookies (logout). */
export declare function clearAuthCookies(reply: CookieCarrier, opts: {
    secure: boolean;
}): void;
