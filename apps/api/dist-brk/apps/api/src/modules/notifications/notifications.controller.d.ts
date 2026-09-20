import { NotificationsService } from './notifications.service';
import type { CurrentUserPayload } from '../tasks/types';
export declare class NotificationsController {
    private notifications;
    constructor(notifications: NotificationsService);
    list(user: CurrentUserPayload, unreadOnly?: string, view?: string): Promise<any[]>;
    unreadCount(user: CurrentUserPayload): Promise<{
        count: number;
    }>;
    unreadByWorkspace(user: CurrentUserPayload): Promise<Record<string, number>>;
    triageCounts(user: CurrentUserPayload): Promise<{
        inbox: number;
        later: number;
        cleared: number;
        unread: number;
    }>;
    digestPreview(user: CurrentUserPayload, frequency?: string): Promise<{
        userId: string;
        frequency: "daily" | "weekly";
        since: string;
        until: string;
        total: number;
        groups: Array<{
            type: string;
            count: number;
            items: Array<{
                title: string;
                body: string | null;
                url: string | null;
                createdAt: string;
            }>;
        }>;
    }>;
    getPreferences(user: CurrentUserPayload): Promise<{
        channels: {
            webEnabled: boolean;
            mobileEnabled: boolean;
            dndOn: boolean;
            dndStart: string;
            dndEnd: string;
            muteSounds: boolean;
        };
        events: Record<"assigned" | "comment" | "status" | "doc" | "activity" | "chat" | "mention" | "due", {
            email: boolean;
            mobile: boolean;
            inApp: boolean;
            web: boolean;
        }>;
        digest: {
            enabled: boolean;
            frequency: "daily" | "weekly";
            hour: number;
        };
        briefing: {
            enabled: boolean;
            hour: number;
        };
        reminderLeadDays: number[];
        primaryTypes?: string[];
        inboxView?: {
            groupByDate: boolean;
            sortNewestFirst: boolean;
            density: "comfortable" | "compact";
        };
        autoFollow: boolean;
        onboarding?: {
            dismissed?: boolean;
        };
    }>;
    updatePreferences(user: CurrentUserPayload, body: {
        channels?: {
            webEnabled?: boolean;
            mobileEnabled?: boolean;
            dndOn?: boolean;
            dndStart?: string;
            dndEnd?: string;
            muteSounds?: boolean;
        };
        events?: Record<string, Partial<Record<'inApp' | 'web' | 'mobile' | 'email', boolean>>>;
        digest?: {
            enabled?: boolean;
            frequency?: 'daily' | 'weekly';
            hour?: number;
        };
        briefing?: {
            enabled?: boolean;
            hour?: number;
        };
        reminderLeadDays?: number[];
        /** §2.2 — which types the Inbox's Primary chip shows. */
        primaryTypes?: string[];
        /** §2.2 — the Customize Inbox drawer: grouping, order and density. */
        inboxView?: {
            groupByDate?: boolean;
            sortNewestFirst?: boolean;
            density?: 'comfortable' | 'compact';
        };
    }): Promise<{
        channels: {
            webEnabled: boolean;
            mobileEnabled: boolean;
            dndOn: boolean;
            dndStart: string;
            dndEnd: string;
            muteSounds: boolean;
        };
        events: Record<"assigned" | "comment" | "status" | "doc" | "activity" | "chat" | "mention" | "due", {
            email: boolean;
            mobile: boolean;
            inApp: boolean;
            web: boolean;
        }>;
        digest: {
            enabled: boolean;
            frequency: "daily" | "weekly";
            hour: number;
        };
        briefing: {
            enabled: boolean;
            hour: number;
        };
        reminderLeadDays: number[];
        primaryTypes?: string[];
        inboxView?: {
            groupByDate: boolean;
            sortNewestFirst: boolean;
            density: "comfortable" | "compact";
        };
        autoFollow: boolean;
        onboarding?: {
            dismissed?: boolean;
        };
    }>;
    /**
     * §G06 [06:53] — mute for a length of time.
     *
     * "NOTIFICATIONS, Mute ka option hai" — the row in the frames carries a "›",
     * i.e. a submenu of durations. Ours was a switch that stayed flipped until
     * somebody remembered to flip it back, so muting for one meeting muted you
     * for days.
     *
     * `minutes: null` (or 0) clears it. The scheduled quiet hours in preferences
     * are a separate control and are untouched by this.
     */
    muteFor(user: CurrentUserPayload, body: {
        minutes?: number | null;
    }): Promise<{
        mutedUntil: null;
    } | {
        mutedUntil: string;
    }>;
    getMute(user: CurrentUserPayload): Promise<{
        mutedUntil: string | null;
    }>;
    webPushPublicKey(): Promise<{
        publicKey: string | null;
        enabled: boolean;
    }>;
    subscribeWebPush(user: CurrentUserPayload, body: {
        subscription: {
            endpoint: string;
            keys?: {
                p256dh?: string;
                auth?: string;
            };
        };
    }, userAgent?: string): Promise<{
        ok: boolean;
        reason: "invalid_subscription";
    } | {
        ok: boolean;
        reason?: undefined;
    }>;
    unsubscribeWebPush(user: CurrentUserPayload, body: {
        endpoint: string;
    }): Promise<{
        ok: boolean;
    }>;
    markRead(notificationId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
    /** §G12 [16:56] — put a row back the way it was before you opened it. */
    markUnread(notificationId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
    markAllRead(user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
    /**
     * §2.5 — clear everything in the Inbox at once. `types` narrows it to what
     * the Primary chip is showing, so clearing while filtered does not also bin
     * what the filter was hiding.
     */
    clearAll(user: CurrentUserPayload, body?: {
        types?: string[];
    }): Promise<{
        ok: boolean;
        cleared: number;
    }>;
    clear(notificationId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
    unclear(notificationId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
    snooze(notificationId: string, user: CurrentUserPayload, body: {
        until?: string;
        hours?: number;
    }): Promise<{
        ok: boolean;
        snoozedUntil: string;
    }>;
    unsnooze(notificationId: string, user: CurrentUserPayload): Promise<{
        ok: boolean;
    }>;
    sendTest(user: CurrentUserPayload, body: {
        workspaceId?: string;
    }): Promise<{
        ok: boolean;
        delivered: boolean;
        inApp: boolean;
        email: boolean;
        quietHours: boolean;
        push: import("./notifications.service").PushDelivery;
    }>;
}
