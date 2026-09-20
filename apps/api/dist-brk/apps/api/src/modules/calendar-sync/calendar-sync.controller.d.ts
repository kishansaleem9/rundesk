import { CalendarSyncService, type CalendarProvider } from './calendar-sync.service';
import { CalendarAccountsService } from './calendar-accounts.service';
/**
 * Authenticated controller: iCal token mint/revoke + manual pull triggers.
 */
export declare class CalendarSyncController {
    private readonly sync;
    private readonly accounts;
    constructor(sync: CalendarSyncService, accounts: CalendarAccountsService);
    /**
     * §V2-14, frame `13:50` — "Accounts: Manage your accounts".
     *
     * Everything here is scoped to the CALLER, never to a userId in the path.
     * These rows hold OAuth refresh tokens for somebody's personal calendar, so
     * "whose account is this" is answered by the session and by nothing else.
     */
    listAccounts(user: {
        id: string;
    }, workspaceId: string): Promise<{
        readonly id: string;
        readonly provider: string;
        readonly externalAccountEmail: string | null;
        readonly externalCalendarId: string;
        readonly status: string;
        readonly isDefault: boolean;
        readonly countsAsBusy: boolean;
        readonly createdAt: Date;
    }[]>;
    /** "Default calendar" — where new events are written. */
    setDefaultAccount(user: {
        id: string;
    }, workspaceId: string, accountId: string): Promise<{
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
    setAccountBusy(user: {
        id: string;
    }, workspaceId: string, accountId: string, body: {
        countsAsBusy: boolean;
    }): Promise<{
        readonly id: string;
        readonly provider: string;
        readonly externalAccountEmail: string | null;
        readonly externalCalendarId: string;
        readonly status: string;
        readonly isDefault: boolean;
        readonly countsAsBusy: boolean;
        readonly createdAt: Date;
    }[]>;
    removeAccount(user: {
        id: string;
    }, workspaceId: string, accountId: string): Promise<{
        readonly id: string;
        readonly provider: string;
        readonly externalAccountEmail: string | null;
        readonly externalCalendarId: string;
        readonly status: string;
        readonly isDefault: boolean;
        readonly countsAsBusy: boolean;
        readonly createdAt: Date;
    }[]>;
    getToken(user: {
        id: string;
    }, workspaceId: string): Promise<{
        token: string;
        url: string;
    }>;
    mintToken(user: {
        id: string;
    }, workspaceId: string): Promise<{
        token: string;
        url: string;
    }>;
    revokeToken(user: {
        id: string;
    }, workspaceId: string): Promise<{
        ok: boolean;
    }>;
    pull(workspaceId: string, provider: CalendarProvider): Promise<{
        created: number;
        updated: number;
        skipped: number;
    }>;
    pushTask(workspaceId: string, taskId: string): Promise<{
        pushed: CalendarProvider[];
        skipped: string[];
    }>;
}
/**
 * Unauthenticated controller: serves the public iCal feed. Authorization
 * is by the URL token (mint/revoke via the authenticated controller).
 */
export declare class IcalFeedController {
    private readonly sync;
    constructor(sync: CalendarSyncService);
    serve(token: string, res: any): Promise<void>;
}
