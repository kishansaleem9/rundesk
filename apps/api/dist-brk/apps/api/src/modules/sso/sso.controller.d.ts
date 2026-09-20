import { SsoService, type SsoConnectionUpdate } from './sso.service';
import { AuthService } from '../auth/auth.service';
import type { SsoProvider } from '@rundesk/db';
type CurrentUserPayload = {
    id: string;
    email: string;
};
export declare class SsoAdminController {
    private sso;
    constructor(sso: SsoService);
    list(workspaceId: string): Promise<{
        oidcClientSecret: string | null;
        samlIdpCertificate: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        workspaceId: string;
        displayName: string;
        createdById: string | null;
        provider: SsoProvider;
        isEnabled: boolean;
        lastUsedAt: Date | null;
        enforceForDomain: string | null;
        jitProvisioning: boolean;
        defaultRole: string;
        oidcIssuer: string | null;
        oidcClientId: string | null;
        oidcScopes: string | null;
        samlIdpEntityId: string | null;
        samlIdpSsoUrl: string | null;
        samlSpEntityId: string | null;
        samlSignRequests: boolean;
        attributeMapping: {
            email?: string;
            displayName?: string;
            groups?: string;
        } | null;
    }[]>;
    upsert(workspaceId: string, provider: string, body: SsoConnectionUpdate, user: CurrentUserPayload): Promise<{
        oidcClientSecret: string | null;
        samlIdpCertificate: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        workspaceId: string;
        displayName: string;
        createdById: string | null;
        provider: SsoProvider;
        isEnabled: boolean;
        lastUsedAt: Date | null;
        enforceForDomain: string | null;
        jitProvisioning: boolean;
        defaultRole: string;
        oidcIssuer: string | null;
        oidcClientId: string | null;
        oidcScopes: string | null;
        samlIdpEntityId: string | null;
        samlIdpSsoUrl: string | null;
        samlSpEntityId: string | null;
        samlSignRequests: boolean;
        attributeMapping: {
            email?: string;
            displayName?: string;
            groups?: string;
        } | null;
    }> | {
        error: string;
    };
    remove(workspaceId: string, connectionId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
}
export declare class SsoAuthController {
    private sso;
    private auth;
    constructor(sso: SsoService, auth: AuthService);
    /**
     * GET /auth/sso/lookup?email=user@example.com — does this domain have SSO?
     * Public endpoint used by the sign-in page to decide whether to surface
     * "Sign in with SSO". Returns null when no enforced connection exists.
     */
    lookup(email?: string): Promise<{
        connection: null;
    } | {
        connection: {
            workspaceId: string;
            provider: SsoProvider;
            displayName: string;
        };
    }>;
    start(provider: string, workspaceId: string, redirectTo: string | undefined, res: any): Promise<void>;
    oidcCallback(query: Record<string, string>, res: any): Promise<void>;
    samlCallback(body: {
        SAMLResponse: string;
        RelayState?: string;
    }, res: any): Promise<void>;
    /**
     * Finish SSO by setting the session as httpOnly cookies (access + refresh)
     * plus the readable CSRF cookie, then redirecting to the SPA. Tokens are NO
     * LONGER placed in the URL hash (Plan §1.1) — the /sso-complete route hydrates
     * from the cookie session via POST /auth/refresh, so the token never becomes a
     * durable client-side store and never appears in browser history / referrers.
     */
    private redirectToApp;
    private redirectWithError;
}
export {};
