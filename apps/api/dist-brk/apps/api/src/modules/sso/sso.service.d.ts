import { ConfigService } from '@nestjs/config';
import { ssoConnections, type SsoProvider } from '@rundesk/db';
import type { Db } from '@rundesk/db';
import { SecurityService } from '../security/security.service';
export type SsoConnectionUpdate = {
    displayName?: string;
    isEnabled?: boolean;
    enforceForDomain?: string | null;
    jitProvisioning?: boolean;
    defaultRole?: string;
    oidcIssuer?: string | null;
    oidcClientId?: string | null;
    oidcClientSecret?: string | null;
    oidcScopes?: string | null;
    samlIdpEntityId?: string | null;
    samlIdpSsoUrl?: string | null;
    samlIdpCertificate?: string | null;
    samlSpEntityId?: string | null;
    samlSignRequests?: boolean;
    attributeMapping?: {
        email?: string;
        displayName?: string;
        groups?: string;
    };
};
export type SsoCallbackResult = {
    userId: string;
    email: string;
    displayName: string;
    workspaceId: string;
    isNewUser: boolean;
    isNewMembership: boolean;
    connectionId: string;
};
export declare class SsoService {
    private db;
    private config;
    private security;
    private readonly appUrl;
    constructor(db: Db, config: ConfigService, security: SecurityService);
    listConnections(workspaceId: string): Promise<{
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
    getConnectionByProvider(workspaceId: string, provider: SsoProvider): Promise<{
        id: string;
        workspaceId: string;
        provider: SsoProvider;
        displayName: string;
        isEnabled: boolean;
        enforceForDomain: string | null;
        jitProvisioning: boolean;
        defaultRole: string;
        oidcIssuer: string | null;
        oidcClientId: string | null;
        oidcClientSecret: string | null;
        oidcScopes: string | null;
        samlIdpEntityId: string | null;
        samlIdpSsoUrl: string | null;
        samlIdpCertificate: string | null;
        samlSpEntityId: string | null;
        samlSignRequests: boolean;
        attributeMapping: {
            email?: string;
            displayName?: string;
            groups?: string;
        } | null;
        lastUsedAt: Date | null;
        createdById: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    upsertConnection(workspaceId: string, provider: SsoProvider, actorId: string, patch: SsoConnectionUpdate): Promise<{
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
    }>;
    deleteConnection(workspaceId: string, connectionId: string, actorId: string): Promise<{
        ok: boolean;
    }>;
    /**
     * Look up the SSO connection that should be used for a user based on their
     * email domain. Used by the sign-in page to decide whether to surface a
     * "Sign in with SSO" path.
     */
    findConnectionForEmail(email: string): Promise<typeof ssoConnections.$inferSelect | null>;
    beginOidcLogin(workspaceId: string, redirectTo?: string): Promise<{
        url: string;
        state: `${string}-${string}-${string}-${string}-${string}`;
    }>;
    handleOidcCallback(callbackUrl: URL): Promise<SsoCallbackResult>;
    beginSamlLogin(workspaceId: string, redirectTo?: string): Promise<{
        url: string;
    }>;
    handleSamlCallback(body: {
        SAMLResponse: string;
        RelayState?: string;
    }): Promise<SsoCallbackResult>;
    private buildSamlClient;
    private completeSsoLogin;
    private callbackUrl;
    /**
     * Strip secrets so connections can be returned to the UI safely. The full
     * client secret / certificate values are never exposed back to the client
     * — only redacted placeholders that indicate whether the field is set.
     */
    private sanitizeConnection;
    /** Best-effort cleanup of stale state rows; called by a scheduled task. */
    pruneExpiredStates(): Promise<void>;
    /** Issue a hash for SCIM token storage. Used by SCIM module. */
    hashScimToken(raw: string): string;
    generateScimToken(): {
        raw: string;
        hash: string;
        prefix: string;
    };
    /** Touch a connection on every SSO action so admins see real activity. */
    touchConnection(connectionId: string): Promise<void>;
}
