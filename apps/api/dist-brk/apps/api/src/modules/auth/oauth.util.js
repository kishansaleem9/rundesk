"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROVIDER_META = exports.OAUTH_PROVIDERS = void 0;
exports.isOAuthProvider = isOAuthProvider;
exports.buildAuthorizeUrl = buildAuthorizeUrl;
exports.signOAuthState = signOAuthState;
exports.createOAuthState = createOAuthState;
exports.verifyOAuthState = verifyOAuthState;
const node_crypto_1 = require("node:crypto");
exports.OAUTH_PROVIDERS = ['google', 'microsoft'];
function isOAuthProvider(value) {
    return value === 'google' || value === 'microsoft';
}
/** Provider authorize / token / userinfo endpoints (task spec + OIDC discovery). */
exports.PROVIDER_META = {
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
};
/**
 * Build the provider's authorization-endpoint URL with the standard code-flow
 * parameters. `redirectUri` MUST be byte-for-byte identical to the one used at
 * token-exchange time, so callers derive it from a single source (see
 * OAuthService.redirectUri).
 */
function buildAuthorizeUrl(provider, params) {
    const meta = exports.PROVIDER_META[provider];
    const url = new URL(meta.authorizeUrl);
    url.searchParams.set('client_id', params.clientId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', params.scope ?? meta.scope);
    url.searchParams.set('state', params.state);
    // Always let the user pick which account to use rather than silently reusing a
    // provider SSO session.
    url.searchParams.set('prompt', 'select_account');
    // Google returns a refresh token only when access_type=offline is requested.
    if (provider === 'google')
        url.searchParams.set('access_type', 'offline');
    return url.toString();
}
const DEFAULT_STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes
function signOAuthState(payload, secret) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = (0, node_crypto_1.createHmac)('sha256', secret).update(body).digest('base64url');
    return `${body}.${sig}`;
}
/** Fresh signed state for a login attempt (random nonce + issued-at timestamp). */
function createOAuthState(provider, secret) {
    return signOAuthState({ provider, nonce: (0, node_crypto_1.randomBytes)(16).toString('base64url'), iat: Date.now() }, secret);
}
/**
 * Verify a signed state token. Returns the decoded payload when the signature is
 * valid, the token is not expired, and (optionally) the provider matches;
 * otherwise null. Signature comparison is constant-time.
 */
function verifyOAuthState(token, secret, opts = {}) {
    if (!token || typeof token !== 'string')
        return null;
    const dot = token.lastIndexOf('.');
    if (dot <= 0)
        return null;
    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = (0, node_crypto_1.createHmac)('sha256', secret).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !(0, node_crypto_1.timingSafeEqual)(a, b))
        return null;
    let payload;
    try {
        payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    }
    catch {
        return null;
    }
    if (!isOAuthProvider(payload?.provider))
        return null;
    if (opts.provider && payload.provider !== opts.provider)
        return null;
    const maxAge = opts.maxAgeMs ?? DEFAULT_STATE_MAX_AGE_MS;
    if (typeof payload.iat !== 'number' || payload.iat > Date.now() || Date.now() - payload.iat > maxAge) {
        return null;
    }
    return payload;
}
//# sourceMappingURL=oauth.util.js.map