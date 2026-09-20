/**
 * Social-login OAuth 2.0 helpers (Plan §1.1 "Google SSO" / "Microsoft SSO").
 *
 * Everything in this file is PURE (no DB, no Nest, no network) so the authorize
 * URL builder and the signed/expiring `state` codec can be unit-tested in
 * isolation. The stateful pieces (env creds, token exchange, user upsert) live
 * in oauth.service.ts.
 */
export type OAuthProvider = 'google' | 'microsoft';
export declare const OAUTH_PROVIDERS: readonly ["google", "microsoft"];
export declare function isOAuthProvider(value: string): value is OAuthProvider;
type ProviderMeta = {
    authorizeUrl: string;
    tokenUrl: string;
    userInfoUrl: string;
    scope: string;
};
/** Provider authorize / token / userinfo endpoints (task spec + OIDC discovery). */
export declare const PROVIDER_META: Record<OAuthProvider, ProviderMeta>;
/**
 * Build the provider's authorization-endpoint URL with the standard code-flow
 * parameters. `redirectUri` MUST be byte-for-byte identical to the one used at
 * token-exchange time, so callers derive it from a single source (see
 * OAuthService.redirectUri).
 */
export declare function buildAuthorizeUrl(provider: OAuthProvider, params: {
    clientId: string;
    redirectUri: string;
    state: string;
    scope?: string;
}): string;
export type OAuthStatePayload = {
    provider: OAuthProvider;
    nonce: string;
    iat: number;
};
export declare function signOAuthState(payload: OAuthStatePayload, secret: string): string;
/** Fresh signed state for a login attempt (random nonce + issued-at timestamp). */
export declare function createOAuthState(provider: OAuthProvider, secret: string): string;
/**
 * Verify a signed state token. Returns the decoded payload when the signature is
 * valid, the token is not expired, and (optionally) the provider matches;
 * otherwise null. Signature comparison is constant-time.
 */
export declare function verifyOAuthState(token: string | undefined | null, secret: string, opts?: {
    provider?: OAuthProvider;
    maxAgeMs?: number;
}): OAuthStatePayload | null;
export {};
