import { ConfigService } from '@nestjs/config';
import type { Db } from '@rundesk/db';
import { SecurityService } from '../../security/security.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { CalendarAccountsService } from '../../calendar-sync/calendar-accounts.service';
type Provider = 'github' | 'gitlab' | 'gcal' | 'google-drive' | 'outlook' | 'onedrive' | 'linear' | 'salesforce' | 'dropbox' | 'zoom';
type ProviderAvailability = {
    provider: Provider;
    available: boolean;
    reason?: string;
};
export declare class IntegrationConnectionsService {
    private readonly db;
    private readonly security;
    private readonly config;
    private readonly notifications;
    private readonly calendarAccounts;
    constructor(db: Db, security: SecurityService, config: ConfigService, notifications: NotificationsService, calendarAccounts: CalendarAccountsService);
    list(workspaceId: string): Promise<{
        provider: string;
        status: string;
        health: string;
        scopes: string[];
        externalAccountEmail: string | null;
        tokenExpiresAt: Date | null;
        lastError: string | null;
        lastErrorAt: Date | null;
        connectedAt: Date;
        updatedAt: Date;
    }[]>;
    /**
     * §V2-11 frame `18:39` — remember what the provider said, against the
     * integration it said it about.
     *
     * Upserts rather than requiring a row: a connection that has NEVER succeeded
     * is exactly the case the card exists for, and it has no row yet. The token
     * columns are deliberately untouched, so recording a failed refresh does not
     * throw away a credential that may still work.
     *
     * Best-effort by contract — the caller is an error path, and an error path
     * that can itself fail is how a person ends up with a blank screen instead of
     * a message.
     */
    recordFailure(workspaceId: string, providerRaw: string, message: string): Promise<void>;
    listSupportedProviders(): readonly ["github", "gitlab", "gcal", "google-drive", "outlook", "onedrive", "linear", "salesforce", "dropbox", "zoom"];
    listProviderAvailability(): ProviderAvailability[];
    getOAuthStartUrl(workspaceId: string, userId: string, providerRaw: string): Promise<{
        authUrl: string;
    }>;
    handleOAuthCallback(providerRaw: string, code: string, state: string, ipAddress?: string): Promise<{
        workspaceId: string;
        provider: Provider;
    }>;
    disconnect(workspaceId: string, providerRaw: string, actorId?: string): Promise<{
        ok: boolean;
    }>;
    listAccessRequests(workspaceId: string): Promise<{
        provider: string;
        status: string;
        note: string | null;
        requestedById: string;
        createdAt: Date;
        updatedAt: Date;
        requesterName: string | null;
        requesterEmail: string | null;
    }[]>;
    requestAccess(workspaceId: string, userId: string, provider: string, note?: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        workspaceId: string;
        status: string;
        provider: string;
        note: string | null;
        requestedById: string;
    }>;
    setAccessRequestStatus(workspaceId: string, provider: string, status: 'pending' | 'approved' | 'rejected', note?: string, actorId?: string): Promise<{
        id: string;
        workspaceId: string;
        provider: string;
        requestedById: string;
        status: string;
        note: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    private assertProvider;
    private signState;
    private verifyState;
    private getProviderConfig;
    private getMissingProviderEnv;
    /**
     * HMAC key for the signed OAuth `state` (the CSRF/binding token round-tripped
     * through the provider). Prefers a dedicated secret when operators set one,
     * otherwise falls back to the always-present `JWT_ACCESS_SECRET` via
     * `getOrThrow` — mirroring the social-login `OAuthService`. The previous code
     * referenced a `JWT_SECRET` that is never defined app-wide and a hardcoded
     * literal, which resolved to a forgeable, predictable key.
     */
    private getStateSecret;
    private getRedirectUri;
    private getWebBase;
    getSuccessRedirect(workspaceId: string, provider: string): string;
    /**
     * §V2-11 — where a failed grant lands.
     *
     * **A defect, found while building the card.** This used to send every
     * failure to `/app?oauth=error&reason=…` — the app root. The banner that
     * reads `?oauth=error` is on `/app/:workspaceId/integrations` and nowhere
     * else, so it rendered on no failure that has ever happened: the one piece
     * of UI whose whole job was to explain a failed connection was unreachable
     * from the failure path. Classic dead control, and invisible because both
     * halves individually look right.
     *
     * With a workspace in hand the redirect now goes where the banner lives; the
     * app root stays as the fallback for a state so broken that not even the
     * workspace could be read out of it.
     */
    getFailureRedirect(reason: string, ctx?: {
        workspaceId?: string | null;
        provider?: string | null;
    }): string;
    /**
     * Read a callback's state WITHOUT throwing — for the failure path only.
     *
     * The error card is attached to an integration, so the failure handler needs
     * to know which one even when the thing that failed is what would normally
     * tell it. Signature-checked all the same: an unsigned state must not be
     * able to write an error message onto somebody else's workspace.
     */
    peekState(state: string): {
        workspaceId: string;
        provider: Provider;
    } | null;
    private exchangeCode;
    private fetchProfile;
}
export {};
