"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const csrf_guard_1 = require("./csrf.guard");
// Double-submit CSRF decision table (Plan §1.1 requirement 5).
(0, node_test_1.default)('CSRF: safe GET is always allowed, even when cookie-authenticated', () => {
    strict_1.default.equal((0, csrf_guard_1.isCsrfRequestAllowed)({ method: 'GET', cookies: { access_token: 'x' } }), true);
});
(0, node_test_1.default)('CSRF: HEAD/OPTIONS are allowed', () => {
    strict_1.default.equal((0, csrf_guard_1.isCsrfRequestAllowed)({ method: 'HEAD', cookies: { access_token: 'x' } }), true);
    strict_1.default.equal((0, csrf_guard_1.isCsrfRequestAllowed)({ method: 'OPTIONS', cookies: { access_token: 'x' } }), true);
});
(0, node_test_1.default)('CSRF: Bearer-authenticated POST is exempt (cannot be CSRF-forged)', () => {
    strict_1.default.equal((0, csrf_guard_1.isCsrfRequestAllowed)({ method: 'POST', headers: { authorization: 'Bearer token' }, cookies: {} }), true);
});
(0, node_test_1.default)('CSRF: Bearer exemption still applies even if cookies are also attached', () => {
    strict_1.default.equal((0, csrf_guard_1.isCsrfRequestAllowed)({
        method: 'POST',
        headers: { authorization: 'Bearer token' },
        cookies: { access_token: 'a', csrf_token: 'c' },
    }), true);
});
(0, node_test_1.default)('CSRF: cookie-less unsafe request is exempt (not cookie-authenticated)', () => {
    strict_1.default.equal((0, csrf_guard_1.isCsrfRequestAllowed)({ method: 'POST', headers: {}, cookies: {} }), true);
});
(0, node_test_1.default)('CSRF: cookie-authenticated POST with NO X-CSRF-Token header is rejected', () => {
    strict_1.default.equal((0, csrf_guard_1.isCsrfRequestAllowed)({ method: 'POST', headers: {}, cookies: { access_token: 'a', csrf_token: 'c' } }), false);
});
(0, node_test_1.default)('CSRF: cookie-authenticated POST with a MISMATCHED header is rejected', () => {
    strict_1.default.equal((0, csrf_guard_1.isCsrfRequestAllowed)({
        method: 'POST',
        headers: { 'x-csrf-token': 'wrong' },
        cookies: { access_token: 'a', csrf_token: 'c' },
    }), false);
});
(0, node_test_1.default)('CSRF: cookie-authenticated POST with a MATCHING header is allowed', () => {
    strict_1.default.equal((0, csrf_guard_1.isCsrfRequestAllowed)({
        method: 'POST',
        headers: { 'x-csrf-token': 'c' },
        cookies: { access_token: 'a', csrf_token: 'c' },
    }), true);
});
(0, node_test_1.default)('CSRF: access cookie present but csrf cookie missing is rejected', () => {
    strict_1.default.equal((0, csrf_guard_1.isCsrfRequestAllowed)({ method: 'POST', headers: { 'x-csrf-token': 'c' }, cookies: { access_token: 'a' } }), false);
});
(0, node_test_1.default)('CSRF: PUT/PATCH/DELETE follow the same cookie rule', () => {
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
        strict_1.default.equal((0, csrf_guard_1.isCsrfRequestAllowed)({ method, headers: {}, cookies: { access_token: 'a', csrf_token: 'c' } }), false, `${method} without header must be rejected`);
        strict_1.default.equal((0, csrf_guard_1.isCsrfRequestAllowed)({ method, headers: { 'x-csrf-token': 'c' }, cookies: { access_token: 'a', csrf_token: 'c' } }), true, `${method} with matching header must be allowed`);
    }
});
// Cookie-auth refresh/logout present only a refresh_token cookie (no
// access_token). Those state-changing calls must also be CSRF-protected.
(0, node_test_1.default)('CSRF: refresh_token cookie alone is now a CSRF target — POST without header rejected', () => {
    strict_1.default.equal((0, csrf_guard_1.isCsrfRequestAllowed)({ method: 'POST', headers: {}, cookies: { refresh_token: 'r', csrf_token: 'c' } }), false);
});
(0, node_test_1.default)('CSRF: refresh_token cookie with a MATCHING header is allowed', () => {
    strict_1.default.equal((0, csrf_guard_1.isCsrfRequestAllowed)({
        method: 'POST',
        headers: { 'x-csrf-token': 'c' },
        cookies: { refresh_token: 'r', csrf_token: 'c' },
    }), true);
});
(0, node_test_1.default)('CSRF: refresh_token cookie but missing csrf cookie is rejected', () => {
    strict_1.default.equal((0, csrf_guard_1.isCsrfRequestAllowed)({ method: 'POST', headers: { 'x-csrf-token': 'c' }, cookies: { refresh_token: 'r' } }), false);
});
(0, node_test_1.default)('CSRF: neither access nor refresh cookie → still exempt (not cookie-authenticated)', () => {
    strict_1.default.equal((0, csrf_guard_1.isCsrfRequestAllowed)({ method: 'POST', headers: {}, cookies: { csrf_token: 'c' } }), true);
});
(0, node_test_1.default)('CSRF: constant-time compare rejects mismatched-length tokens without throwing', () => {
    strict_1.default.equal((0, csrf_guard_1.isCsrfRequestAllowed)({
        method: 'POST',
        headers: { 'x-csrf-token': 'short' },
        cookies: { access_token: 'a', csrf_token: 'a-much-longer-token-value' },
    }), false);
});
//# sourceMappingURL=csrf.guard.test.js.map