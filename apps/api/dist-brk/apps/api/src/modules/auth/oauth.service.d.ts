import { ConfigService } from '@nestjs/config';
import type { Db } from '@rundesk/db';
import { SecurityService } from '../security/security.service';
import { type OAuthProvider } from './oauth.util';
export type OAuthProfile = {
    providerId: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
};
export type OAuthTokens = {
    accessToken: string;
    refreshToken: string | null;
    expiresAt: Date | null;
};
/**
 * Google + Microsoft social login (OAuth 2.0 authorization-code flow).
 *
 * Credentials are read from the environment via ConfigService and the whole
 * feature is env-gated: when a provider's client id/secret are absent the
 * provider is simply reported as "not configured" (like web-push), so the flow
 * stays dormant until an operator sets the secrets. Session minting is delegated
 * to AuthService (see the controller) — this service only resolves the external
 * identity and links it to a Rundesk user.
 */
export declare class OAuthService {
    private db;
    private config;
    private security;
    private readonly logger;
    constructor(db: Db, config: ConfigService, security: SecurityService);
    private creds;
    isConfigured(provider: OAuthProvider): boolean;
    /** Which providers have env creds present — powers GET /auth/oauth/providers. */
    configuredProviders(): {
        google: boolean;
        microsoft: boolean;
    };
    /** HMAC key for the signed `state`. Falls back to the always-present JWT secret. */
    private get stateSecret();
    /**
     * The provider redirect_uri. Must be identical at authorize + token-exchange
     * time, so both paths call this. Falls back to `${API_URL}/api/v1` (the global
     * route prefix) when OAUTH_REDIRECT_BASE is not set.
     */
    redirectUri(provider: OAuthProvider): string;
    /** Build the provider authorize URL + the signed state to plant in a cookie. */
    beginLogin(provider: OAuthProvider): {
        url: string;
        state: string;
    };
    /**
     * Validate the round-tripped `state`: it must equal the value we planted in
     * the httpOnly cookie AND carry a valid, unexpired signature for this provider.
     */
    validateState(provider: OAuthProvider, queryState?: string, cookieState?: string): void;
    exchangeCodeForProfile(provider: OAuthProvider, code: string): Promise<{
        profile: OAuthProfile;
        tokens: OAuthTokens;
    }>;
    /**
     * Upsert the Rundesk user by email and link the `oauth_accounts` row for
     * (provider, providerId). New users are created password-less with a verified
     * email (the provider vouches for it), mirroring SSO JIT provisioning. Returns
     * the user id for session minting + an audit trail entry.
     */
    upsertUserAndLink(provider: OAuthProvider, profile: OAuthProfile, _tokens: OAuthTokens, meta?: {
        ip?: string;
        userAgent?: string;
    }): Promise<{
        userId: string;
        isNewUser: boolean;
    }>;
}
