"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const oauth_util_1 = require("./oauth.util");
const SECRET = 'test-oauth-state-secret';
(0, node_test_1.default)('isOAuthProvider only accepts google/microsoft', () => {
    strict_1.default.equal((0, oauth_util_1.isOAuthProvider)('google'), true);
    strict_1.default.equal((0, oauth_util_1.isOAuthProvider)('microsoft'), true);
    strict_1.default.equal((0, oauth_util_1.isOAuthProvider)('github'), false);
    strict_1.default.equal((0, oauth_util_1.isOAuthProvider)('providers'), false);
    strict_1.default.equal((0, oauth_util_1.isOAuthProvider)(''), false);
});
(0, node_test_1.default)('buildAuthorizeUrl builds a Google authorize URL with all code-flow params', () => {
    const url = new URL((0, oauth_util_1.buildAuthorizeUrl)('google', {
        clientId: 'client-123',
        redirectUri: 'http://localhost:3001/api/v1/auth/oauth/google/callback',
        state: 'signed-state',
    }));
    strict_1.default.equal(`${url.origin}${url.pathname}`, oauth_util_1.PROVIDER_META.google.authorizeUrl);
    strict_1.default.equal(url.searchParams.get('client_id'), 'client-123');
    strict_1.default.equal(url.searchParams.get('redirect_uri'), 'http://localhost:3001/api/v1/auth/oauth/google/callback');
    strict_1.default.equal(url.searchParams.get('response_type'), 'code');
    strict_1.default.equal(url.searchParams.get('scope'), 'openid email profile');
    strict_1.default.equal(url.searchParams.get('state'), 'signed-state');
    strict_1.default.equal(url.searchParams.get('access_type'), 'offline'); // Google-only
});
(0, node_test_1.default)('buildAuthorizeUrl targets the Microsoft common tenant and omits access_type', () => {
    const url = new URL((0, oauth_util_1.buildAuthorizeUrl)('microsoft', {
        clientId: 'ms-client',
        redirectUri: 'http://localhost:3001/api/v1/auth/oauth/microsoft/callback',
        state: 'st',
    }));
    strict_1.default.equal(`${url.origin}${url.pathname}`, oauth_util_1.PROVIDER_META.microsoft.authorizeUrl);
    strict_1.default.equal(url.searchParams.get('client_id'), 'ms-client');
    strict_1.default.equal(url.searchParams.get('response_type'), 'code');
    strict_1.default.equal(url.searchParams.get('access_type'), null);
});
(0, node_test_1.default)('createOAuthState → verifyOAuthState round-trips and carries the provider', () => {
    const state = (0, oauth_util_1.createOAuthState)('google', SECRET);
    const payload = (0, oauth_util_1.verifyOAuthState)(state, SECRET, { provider: 'google' });
    strict_1.default.ok(payload);
    strict_1.default.equal(payload.provider, 'google');
    strict_1.default.match(payload.nonce, /.+/);
});
(0, node_test_1.default)('verifyOAuthState rejects a wrong provider expectation', () => {
    const state = (0, oauth_util_1.createOAuthState)('google', SECRET);
    strict_1.default.equal((0, oauth_util_1.verifyOAuthState)(state, SECRET, { provider: 'microsoft' }), null);
});
(0, node_test_1.default)('verifyOAuthState rejects a tampered payload', () => {
    const state = (0, oauth_util_1.createOAuthState)('google', SECRET);
    const [body, sig] = state.split('.');
    const forged = Buffer.from(JSON.stringify({ provider: 'microsoft', nonce: 'x', iat: Date.now() })).toString('base64url');
    strict_1.default.notEqual(body, forged);
    strict_1.default.equal((0, oauth_util_1.verifyOAuthState)(`${forged}.${sig}`, SECRET), null);
});
(0, node_test_1.default)('verifyOAuthState rejects a wrong signing secret', () => {
    const state = (0, oauth_util_1.createOAuthState)('microsoft', SECRET);
    strict_1.default.equal((0, oauth_util_1.verifyOAuthState)(state, 'different-secret'), null);
});
(0, node_test_1.default)('verifyOAuthState rejects an expired state', () => {
    const stale = (0, oauth_util_1.signOAuthState)({ provider: 'google', nonce: 'n', iat: Date.now() - 60 * 60 * 1000 }, SECRET);
    strict_1.default.equal((0, oauth_util_1.verifyOAuthState)(stale, SECRET, { maxAgeMs: 10 * 60 * 1000 }), null);
});
(0, node_test_1.default)('verifyOAuthState rejects malformed / empty tokens', () => {
    strict_1.default.equal((0, oauth_util_1.verifyOAuthState)('', SECRET), null);
    strict_1.default.equal((0, oauth_util_1.verifyOAuthState)('nodot', SECRET), null);
    strict_1.default.equal((0, oauth_util_1.verifyOAuthState)(undefined, SECRET), null);
});
//# sourceMappingURL=oauth.util.test.js.map