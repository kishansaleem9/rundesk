import type { Db } from '@rundesk/db';
/**
 * §V2-14 — a person's calendar accounts, frame `13:50`.
 *
 * `[13:38]` "aur jitna chahoon main add kar sakti hoon."
 *
 * EVERY METHOD IS SCOPED BY `userId`, and that is the security model rather
 * than a convenience. These rows hold OAuth refresh tokens for somebody's
 * personal Google account; an endpoint that took an account id without also
 * proving whose it is would let any member of the workspace unhook — or read
 * the address of — a colleague's calendar. So the id is never trusted alone:
 * every lookup is `(id AND userId)`, and a mismatch is a 404 rather than a 403,
 * because the existence of somebody else's calendar account is not something
 * you should be able to confirm.
 */
declare const PROVIDERS: readonly ["gcal", "outlook"];
export type CalendarProviderId = (typeof PROVIDERS)[number];
export declare class CalendarAccountsService {
    private db;
    constructor(db: Db);
    private assertProvider;
    /**
     * The accounts a person has connected in this workspace.
     *
     * Projected through `PUBLIC_CALENDAR_ACCOUNT_COLUMNS` so tokens cannot leave
     * by accident — a bare `select()` here would put a refresh token in a JSON
     * response, and nothing else in the request would look wrong.
     */
    list(userId: string, workspaceId: string): Promise<{
        readonly id: string;
        readonly provider: string;
        readonly externalAccountEmail: string | null;
        readonly externalCalendarId: string;
        readonly status: string;
        readonly isDefault: boolean;
        readonly countsAsBusy: boolean;
        readonly createdAt: Date;
    }[]>;
    /**
     * Record a completed OAuth grant.
     *
     * RE-CONNECTING THE SAME ACCOUNT REFRESHES IT rather than adding a second
     * row — that is what the unique key on `external_account_id` is for. The old
     * behaviour was the opposite and much worse: a second grant for a DIFFERENT
     * account overwrote the first, because the key was (workspace, provider).
     *
     * The first account a person connects becomes their default, because the
     * alternative is a fresh connection that writes nowhere until they visit a
     * settings page they have no reason to think they need.
     */
    upsertFromOAuth(input: {
        userId: string;
        workspaceId: string;
        provider: string;
        externalAccountId: string;
        externalAccountEmail?: string | null;
        accessToken?: string | null;
        refreshToken?: string | null;
        tokenExpiresAt?: Date | null;
        scopes?: string[];
    }): Promise<{
        id: string;
        created: boolean;
    }>;
    /**
     * "Default calendar" — where new events are written.
     *
     * The clear-then-set is a TRANSACTION because the database enforces at most
     * one default with a partial unique index: setting the new one before
     * clearing the old would collide, and clearing outside a transaction would
     * leave a person with no default at all if the second statement failed.
     */
    setDefault(userId: string, workspaceId: string, accountId: string): Promise<{
        readonly id: string;
        readonly provider: string;
        readonly externalAccountEmail: string | null;
        readonly externalCalendarId: string;
        readonly status: string;
        readonly isDefault: boolean;
        readonly countsAsBusy: boolean;
        readonly createdAt: Date;
    }[]>;
    /** "Busy calendars" — whether this one is read when working out free time. */
    setCountsAsBusy(userId: string, workspaceId: string, accountId: string, busy: boolean): Promise<{
        readonly id: string;
        readonly provider: string;
        readonly externalAccountEmail: string | null;
        readonly externalCalendarId: string;
        readonly status: string;
        readonly isDefault: boolean;
        readonly countsAsBusy: boolean;
        readonly createdAt: Date;
    }[]>;
    /**
     * Disconnect one account.
     *
     * When the default is removed, the oldest remaining account takes over rather
     * than leaving nobody holding it — a workspace with connected calendars and
     * no default writes new events nowhere, which looks like the sync breaking.
     */
    remove(userId: string, workspaceId: string, accountId: string): Promise<{
        readonly id: string;
        readonly provider: string;
        readonly externalAccountEmail: string | null;
        readonly externalCalendarId: string;
        readonly status: string;
        readonly isDefault: boolean;
        readonly countsAsBusy: boolean;
        readonly createdAt: Date;
    }[]>;
    /**
     * The accounts whose events count as busy — §V2-14c reads this.
     *
     * Returns tokens, because the caller has to talk to the provider. It is
     * deliberately NOT the same method the controller calls, so the safe list and
     * the privileged one cannot be confused at a call site.
     */
    busyAccountsWithTokens(userId: string, workspaceId: string): Promise<{
        id: string;
        userId: string;
        workspaceId: string;
        provider: string;
        externalAccountId: string;
        externalAccountEmail: string | null;
        externalCalendarId: string;
        accessToken: string | null;
        refreshToken: string | null;
        tokenExpiresAt: Date | null;
        scopes: string[];
        status: string;
        isDefault: boolean;
        countsAsBusy: boolean;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    /**
     * §V2-14c — when this person is busy, according to the calendars they said
     * should decide that.
     *
     * WHAT IS AND IS NOT EXERCISED HERE. The Google call below is real and
     * unverified: this environment has no Google credentials, so no test in this
     * repository reaches it. What IS covered is everything around it — which
     * accounts get asked (`countsAsBusy`), what a returned window is allowed to
     * contain (no title, ever), and how windows merge. The provider's half is
     * the provider's.
     *
     * Failures are swallowed PER ACCOUNT rather than for the whole call: one
     * revoked token should cost that calendar's busy time, not everybody else's.
     */
    externalBusyWindows(userId: string, workspaceId: string, from: Date, to: Date): Promise<import("./free-busy").BusyWindow[]>;
    /**
     * An account belonging to this person, or a 404.
     *
     * 404 rather than 403 on a mismatch: whether a colleague has connected a
     * calendar is not something the id in a URL should be able to confirm.
     */
    private owned;
}
export {};
