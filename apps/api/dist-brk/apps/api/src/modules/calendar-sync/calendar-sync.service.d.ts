import type { Db } from '@rundesk/db';
/**
 * Bidirectional calendar sync for Google Calendar + Outlook.
 *
 * Outbound: when a task with a dueDate is created/updated, we upsert an
 * event on the workspace's connected calendar. Archiving / clearing the
 * dueDate deletes the event.
 *
 * Inbound: a manual or scheduled `pullEvents` call fetches recent events
 * from the calendar and either updates the linked task or creates a new
 * task in the workspace's designated inbox list (settable on the
 * connection metadata as `inboxListId`).
 *
 * iCal: every user has a personal `/ical/:token.ics` feed that any
 * calendar client (Outlook, Apple Calendar, Google) can subscribe to.
 * This provides one-way sync to any client without OAuth.
 */
export type CalendarProvider = 'gcal' | 'outlook';
export declare class CalendarSyncService {
    private readonly db;
    constructor(db: Db);
    /**
     * Push a single task to every connected calendar in its workspace.
     * Best-effort: failures are swallowed so a flaky calendar API doesn't
     * fail the user's task update.
     */
    pushTask(taskId: string, expectedWorkspaceId?: string): Promise<{
        pushed: CalendarProvider[];
        skipped: string[];
    }>;
    /**
     * Remove this task's event from every connected calendar — called when
     * the task is archived/deleted or the dueDate is cleared.
     */
    deleteEverywhere(taskId: string): Promise<void>;
    /**
     * Pull recent events from a workspace's connected calendar and either
     * update the linked task (if we've seen this event before) or insert
     * a new task in the configured inbox list. Returns counts so the UI
     * can render a "synced N tasks" toast.
     */
    pullEvents(workspaceId: string, provider: CalendarProvider): Promise<{
        created: number;
        updated: number;
        skipped: number;
    }>;
    /**
     * Mint (or rotate) a personal iCal subscription token for a user in a
     * workspace. The returned token is the secret half of the public feed
     * URL `/ical/{token}.ics`.
     */
    /**
     * Return the user's existing (non-revoked) iCal token without rotating it,
     * minting one only if none exists. Used for read/display so opening the
     * dialog doesn't invalidate already-distributed subscription URLs.
     */
    getOrCreateIcalToken(userId: string, workspaceId: string): Promise<{
        token: string;
        url: string;
    }>;
    mintIcalToken(userId: string, workspaceId: string): Promise<{
        token: string;
        url: string;
    }>;
    revokeIcalToken(userId: string, workspaceId: string): Promise<void>;
    /**
     * Look up the iCal token + return the user/workspace it points at. Used
     * by the public feed endpoint to authorise the request without a JWT.
     */
    resolveIcalToken(token: string): Promise<{
        userId: string;
        workspaceId: string;
    } | null>;
    /**
     * Build an RFC 5545 VCALENDAR document for every task in the workspace
     * the user has access to. Any client that supports iCalendar subscriptions
     * (Outlook, Apple Calendar, Google, Fantastical) will refresh this on
     * its own cadence — usually 1-24 hours.
     */
    buildIcalFeed(userId: string, workspaceId: string): Promise<string>;
    private formatVEvent;
    private formatIcsDate;
    private escapeIcsText;
    private upsertGoogleEvent;
    private deleteGoogleEvent;
    private listGoogleEvents;
    private upsertOutlookEvent;
    private deleteOutlookEvent;
    private listOutlookEvents;
    /**
     * Return a usable access token for this connection, refreshing via the
     * refresh_token grant if it's expired or near expiry (60s buffer).
     * Updates the persisted token + expiry on success.
     */
    private ensureFreshToken;
    private getProviderTokenConfig;
    private resolveTaskContext;
    private loadConnectionsByIds;
    private requireConnection;
}
