"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const auth_cookies_1 = require("./auth-cookies");
function makeReply() {
    const set = [];
    const cleared = [];
    return {
        set,
        cleared,
        setCookie(name, value, options) {
            set.push({ name, value, options });
        },
        clearCookie(name, options) {
            cleared.push({ name, options });
        },
    };
}
// Build a JWT-shaped string whose payload carries `exp = now + seconds`.
function tokenExpiringIn(seconds) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds })).toString('base64url');
    return `${header}.${payload}.signature`;
}
(0, node_test_1.default)('setAuthCookies sets all three cookies with the correct security flags', () => {
    const reply = makeReply();
    const csrf = (0, auth_cookies_1.setAuthCookies)(reply, { accessToken: tokenExpiringIn(900), refreshToken: tokenExpiringIn(86_400) }, { secure: true });
    const byName = Object.fromEntries(reply.set.map((c) => [c.name, c]));
    // access_token: httpOnly, secure, SameSite=Lax, path=/
    const access = byName[auth_cookies_1.ACCESS_TOKEN_COOKIE];
    strict_1.default.equal(access.options.httpOnly, true);
    strict_1.default.equal(access.options.secure, true);
    strict_1.default.equal(access.options.sameSite, 'lax');
    strict_1.default.equal(access.options.path, '/');
    // refresh_token: httpOnly
    strict_1.default.equal(byName[auth_cookies_1.REFRESH_TOKEN_COOKIE].options.httpOnly, true);
    // csrf_token: readable by JS (NOT httpOnly), value returned by the helper
    strict_1.default.equal(byName[auth_cookies_1.CSRF_TOKEN_COOKIE].options.httpOnly, false);
    strict_1.default.equal(byName[auth_cookies_1.CSRF_TOKEN_COOKIE].value, csrf);
});
(0, node_test_1.default)('setAuthCookies derives Max-Age from each token exp', () => {
    const reply = makeReply();
    (0, auth_cookies_1.setAuthCookies)(reply, { accessToken: tokenExpiringIn(900), refreshToken: tokenExpiringIn(86_400) }, { secure: true });
    const byName = Object.fromEntries(reply.set.map((c) => [c.name, c]));
    const access = byName[auth_cookies_1.ACCESS_TOKEN_COOKIE].options.maxAge;
    const refresh = byName[auth_cookies_1.REFRESH_TOKEN_COOKIE].options.maxAge;
    strict_1.default.ok(access > 890 && access <= 900, `access maxAge ~900s, got ${access}`);
    strict_1.default.ok(refresh > 86_390 && refresh <= 86_400, `refresh maxAge ~86400s, got ${refresh}`);
});
(0, node_test_1.default)('setAuthCookies leaves cookies non-secure in dev (secure:false)', () => {
    const reply = makeReply();
    (0, auth_cookies_1.setAuthCookies)(reply, { accessToken: tokenExpiringIn(900), refreshToken: tokenExpiringIn(900) }, { secure: false });
    strict_1.default.ok(reply.set.every((c) => c.options.secure === false));
});
(0, node_test_1.default)('clearAuthCookies expires all three auth cookies', () => {
    const reply = makeReply();
    (0, auth_cookies_1.clearAuthCookies)(reply, { secure: false });
    strict_1.default.deepEqual(reply.cleared.map((c) => c.name).sort(), [auth_cookies_1.ACCESS_TOKEN_COOKIE, auth_cookies_1.CSRF_TOKEN_COOKIE, auth_cookies_1.REFRESH_TOKEN_COOKIE].sort());
});
(0, node_test_1.default)('generateCsrfToken returns a unique 64-char hex value', () => {
    const a = (0, auth_cookies_1.generateCsrfToken)();
    const b = (0, auth_cookies_1.generateCsrfToken)();
    strict_1.default.match(a, /^[0-9a-f]{64}$/);
    strict_1.default.notEqual(a, b);
});
//# sourceMappingURL=auth-cookies.test.js.map