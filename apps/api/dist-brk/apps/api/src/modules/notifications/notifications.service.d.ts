import type { Db } from '@rundesk/db';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';
export declare const ALLOWED_REMINDER_LEAD_DAYS: readonly [1, 2, 7];
export declare const DEFAULT_REMINDER_LEAD_DAYS: number[];
/**
 * Sanitize a stored/submitted lead-days value into a clean, sorted, de-duped
 * array drawn from {@link ALLOWED_REMINDER_LEAD_DAYS}.
 *
 * - Absent/invalid input (not an array) → the default `[1, 2]`.
 * - An explicit empty array is respected (→ `[]`, meaning "overdue only").
 * - Out-of-set or non-integer entries are dropped.
 */
export declare function normalizeReminderLeadDays(input: unknown): number[];
/**
 * §7.11 — sanitize a stored/submitted daily-briefing preference: coerce
 * `enabled` to a boolean and clamp `hour` to an integer 0–23 (default 8). Pure
 * so the profile patch path and the cron's due-hour selection agree exactly.
 */
export declare function normalizeBriefingPrefs(input: unknown): {
    enabled: boolean;
    hour: number;
};
/** Human label for a due-soon reminder fired `diffDays` before the due date. */
export declare function reminderLeadLabel(diffDays: number): string;
/** Loose shape of the deep-link target persisted on a notification row. */
type NotificationTargetLike = {
    entityType?: string | null;
    entityId?: string | null;
    url?: string | null;
} | null | undefined;
/**
 * §10.1 — resolve a click-through URL for a notification so the web app can
 * jump straight to the relevant item when the notification is clicked. Pure so
 * both the list serializer and the realtime payload agree on the same link.
 *
 * Resolution order:
 *  1. The deep-link stored on the row's `target.url` at creation time. Every
 *     first-party creation site sets this — task → its board route with
 *     `?task=`, chat_message → channel deep link, approval_needed → time
 *     approvals, doc → docs with `?doc=`, briefing/workload → insights.
 *  2. A best-effort route rebuilt from `target.entityType` + `entityId` and the
 *     notification's own `workspaceId`, for legacy rows that recorded an entity
 *     reference but no url.
 *  3. `null` when the notification carries no resolvable target — the caller
 *     renders it as non-navigable rather than crashing.
 */
export declare function resolveNotificationUrl(row: {
    workspaceId?: string | null;
    target?: NotificationTargetLike;
}): string | null;
/**
 * §A4.7 — the verdict of one push attempt. Push is the channel that fails
 * quietly: an unset VAPID key, a browser that never subscribed, or an endpoint
 * the vendor has retired all look identical from the app. Naming each outcome is
 * what makes the test send worth pressing.
 */
export type PushDelivery = {
    status: 'not_configured';
} | {
    status: 'no_subscriptions';
} | {
    status: 'channel_off';
} | {
    status: 'quiet_hours';
} | {
    status: 'sent';
    sent: number;
    failed: number;
};
/**
 * §A2.6 — the three inbox buckets. They partition the same table on two
 * timestamps rather than a status column, so a snooze that lapses returns the
 * row to `inbox` with no sweeper job: `later` is defined as "snoozed until a
 * moment still in the future".
 */
export type InboxView = 'inbox' | 'later' | 'cleared' | 'all';
export declare const INBOX_VIEWS: InboxView[];
/** Snooze presets the inbox offers, in hours from now. */
export declare const SNOOZE_PRESET_HOURS: readonly [1, 4, 24, number];
type NotificationType = 'task_assigned' | 'task_mentioned' | 'task_commented' | 'task_due_soon' | 'task_overdue' | 'task_status_changed' | 'task_updated' | 'chat_message' | 'chat_reply' | 'doc_mentioned' | 'doc_commented' | 'approval_needed' | 'task_blocked' | 'ai_briefing' | 'workload_alert' | 'test_notification' | 'task_unassigned' | 'task_follower_changed' | 'message_reaction' | 'shared_with_me' | 'access_requested' | 'call_started' | 'message_assigned' | 'message_reminder' | 'comment_assigned' | 'comment_resolved' | 'subtask_created';
type NotificationEventKey = 'mention' | 'assigned' | 'comment' | 'due' | 'status' | 'doc' | 'chat' | 'activity';
type NotificationChannelMatrix = Record<'inApp' | 'web' | 'mobile' | 'email', boolean>;
/**
 * §2.2 — every notification type the Primary customiser may offer. Kept as a
 * value rather than only a type so the API can reject anything else: this ends
 * up in a jsonb column straight from the client.
 */
export declare const PRIMARY_SELECTABLE_TYPES: readonly ["call_started", "task_mentioned", "doc_mentioned", "task_commented", "doc_commented", "task_assigned", "chat_message", "chat_reply", "task_due_soon", "task_overdue", "task_status_changed", "task_updated", "task_blocked", "approval_needed", "ai_briefing", "workload_alert", "task_unassigned", "task_follower_changed", "message_reaction", "shared_with_me", "access_requested", "comment_assigned", "comment_resolved", "subtask_created"];
/** What Primary shows for someone who has never opened the customiser. */
export declare const DEFAULT_PRIMARY_TYPES: string[];
/**
 * §2.2 — how the Inbox is laid out, from the gear on the Primary tab.
 *
 * Her frame calls this drawer "Customize Inbox" and shows Group by date, Sort
 * by newest first, and a display mode alongside the importance list we already
 * had. These are per-user view settings, so they live beside `primaryTypes`
 * rather than in localStorage: an inbox arranged on one machine that comes back
 * unarranged on the next is the same complaint as the sidebar favourites.
 *
 * Clamped rather than trusted. An unknown density is not a reason to render an
 * inbox with no class on it.
 */
declare const INBOX_DENSITIES: readonly ["comfortable", "compact"];
type InboxDensity = (typeof INBOX_DENSITIES)[number];
type InboxViewPrefs = {
    groupByDate: boolean;
    sortNewestFirst: boolean;
    density: InboxDensity;
};
type DigestFrequency = 'daily' | 'weekly';
type NotificationPreferences = {
    channels: {
        webEnabled: boolean;
        mobileEnabled: boolean;
        dndOn: boolean;
        dndStart: string;
        dndEnd: string;
        muteSounds: boolean;
    };
    events: Record<NotificationEventKey, NotificationChannelMatrix>;
    digest: {
        enabled: boolean;
        frequency: DigestFrequency;
        /** Hour of day (0–23, server time) the digest is sent. */
        hour: number;
    };
    /** §7.11 — daily AI briefing delivered in-app at a chosen hour. */
    briefing: {
        enabled: boolean;
        /** Hour of day (0–23, server time) the briefing is delivered. */
        hour: number;
    };
    /** §10.4 — lead days for due-date reminders (subset of {1,2,7}). */
    reminderLeadDays: number[];
    /**
     * §2.2 — which notification types the Inbox's Primary chip shows.
     *
     * > "Primary pe yeh setting ka option hai; is par main click karti hoon to
     * >  yeh mujh se poochta hai ke mujhe kya cheezein show karwani hain … Phir
     * >  aap ko Primary mein sirf wohi notifications show honge jo aap chahte
     * >  hain."
     *
     * Distinct from `events` above, which decides whether a notification is
     * *delivered* and over which channel. This decides what the Primary view
     * shows once it has arrived — "don't put this in Primary" is not the same
     * request as "never tell me".
     *
     * Absent means the default set, so an account that has never opened the
     * customiser keeps behaving exactly as before.
     */
    primaryTypes?: string[];
    /** §2.2 — the Customize Inbox drawer: grouping, order and density. */
    inboxView?: InboxViewPrefs;
    /**
     * §A4.7 — whether creating, being assigned to, or commenting on a task
     * subscribes you to it. The behaviour has always been on and invisible; this
     * makes it a choice. Off means only an explicit Watch adds you.
     */
    autoFollow: boolean;
    /**
     * §14.3 — guided-onboarding widget state. Written by WorkspacesService via a
     * JSONB concat merge; preserved here so a notification-prefs write never drops
     * the dismissed flag.
     */
    onboarding?: {
        dismissed?: boolean;
    };
};
type NotificationPreferencesPatch = {
    channels?: Partial<NotificationPreferences['channels']>;
    events?: Partial<Record<NotificationEventKey, Partial<NotificationChannelMatrix>>>;
    digest?: Partial<NotificationPreferences['digest']>;
    briefing?: Partial<NotificationPreferences['briefing']>;
    reminderLeadDays?: number[];
    autoFollow?: boolean;
    /** §2.2 — which types the Inbox's Primary chip shows. */
    primaryTypes?: string[];
    /** §2.2 — the Customize Inbox drawer. */
    inboxView?: Partial<InboxViewPrefs>;
};
export declare class NotificationsService {
    private db;
    private realtime;
    private email;
    private config;
    private readonly logger;
    private readonly appUrl;
    private readonly webPushPublicKey;
    private readonly webPushEnabled;
    constructor(db: Db, realtime: RealtimeGateway, email: EmailService, config: ConfigService);
    /**
     * Write a notification, and report whether it reached the person AT ALL.
     *
     * `create()` returns the in-app row, which is null when a recipient has
     * turned the in-app channel off and left email on — a supported combination.
     * Callers that count what they returned therefore counted an admin who got
     * the email as nobody, and told the requester nothing had been sent while
     * every admin had the mail.
     *
     * The row and the delivery are different facts. This returns both; `create`
     * keeps returning just the row, so no existing caller changes.
     */
    createWithOutcome(data: {
        userId: string;
        workspaceId?: string | null;
        actorId?: string | null;
        type: NotificationType;
        title: string;
        body?: string;
        target?: {
            entityType: string;
            entityId: string;
            url?: string;
        };
        /** Extra context needed to generate a good email — not stored */
        emailContext?: {
            workspaceName?: string;
            taskTitle?: string;
            commentSnippet?: string;
            dueDateLabel?: string;
            /** When set, task_commented emails use the "resolved" template instead of "new comment". */
            commentVariant?: 'created' | 'resolved';
        };
        /**
         * §A4.7 — the test send awaits push itself so it can report the outcome;
         * everything else keeps the fire-and-forget dispatch below.
         */
        deferPush?: boolean;
    }): Promise<{
        row: any;
        delivered: boolean;
    }>;
    /** The row, for the callers that only ever wanted that. */
    create(data: Parameters<NotificationsService['createWithOutcome']>[0]): Promise<any>;
    getWebPushPublicKey(): Promise<{
        publicKey: string | null;
        enabled: boolean;
    }>;
    subscribeWebPush(userId: string, subscription: {
        endpoint: string;
        keys?: {
            p256dh?: string;
            auth?: string;
        };
    }, userAgent?: string): Promise<{
        ok: boolean;
        reason: "invalid_subscription";
    } | {
        ok: boolean;
        reason?: undefined;
    }>;
    unsubscribeWebPush(userId: string, endpoint: string): Promise<{
        ok: boolean;
    }>;
    /**
     * §G06 [06:53] — mute for N minutes, or clear it.
     *
     * A duration rather than a moment, because a duration is what somebody
     * picking "for 1 hour" means, and letting the client compute the timestamp
     * puts the answer at the mercy of a wrong clock.
     */
    setTimedMute(userId: string, minutes: number | null): Promise<{
        mutedUntil: null;
    } | {
        mutedUntil: string;
    }>;
    /** The caller's timed mute, or null once it has run out. */
    getTimedMute(userId: string): Promise<{
        mutedUntil: string | null;
    }>;
    getPreferences(userId: string): Promise<NotificationPreferences>;
    /**
     * §A4.7 — does this user want to be auto-subscribed to what they touch?
     * Consulted by the task write paths before they add a watcher, so turning the
     * toggle off actually stops the subscription rather than only hiding it.
     */
    autoFollowEnabled(userId: string): Promise<boolean>;
    updatePreferences(userId: string, patch: NotificationPreferencesPatch): Promise<NotificationPreferences>;
    /**
     * Predicate for one inbox bucket (§A2.6). `now` is threaded in so a caller
     * computing several buckets at once partitions them against a single instant.
     */
    private viewCondition;
    list(userId: string, opts?: {
        unreadOnly?: boolean;
        limit?: number;
        view?: InboxView;
    }): Promise<any[]>;
    private formatMentionBody;
    private resolveMentionDisplayNames;
    markRead(userId: string, notificationId: string): Promise<{
        ok: boolean;
    }>;
    /**
     * §G12 [16:56] — "mark unread", the way you would in an email client.
     *
     * The Inbox could mark a row read, mark them all read, clear one and clear
     * all — and had no way back. Opening a notification to see what it was
     * therefore destroyed the only signal that you had not dealt with it yet,
     * which is exactly what "I'll come back to this" needs.
     *
     * Scoped by userId like every sibling: a notification id is not a
     * capability, and this must not let one person un-read another's row.
     */
    markUnread(userId: string, notificationId: string): Promise<{
        ok: boolean;
    }>;
    markAllRead(userId: string): Promise<{
        ok: boolean;
    }>;
    /**
     * §2.5 — "mere paas jitne bhi notifications hain main yahan se clear kar
     * sakti hoon. Maine sab clear kiye — woh yahan pe chale jayenge."
     *
     * Clearing was per-row only, which is not what she did on screen. Scoped to
     * the Inbox bucket exactly as markAllRead is: a row saved for Later is not
     * something you meant to clear, and a row already cleared is not something to
     * re-stamp — re-stamping would silently restart its 30-day retention.
     *
     * `types` honours the Primary/All chip. Without it, clearing while filtered
     * to Primary would also bin everything the filter was hiding, which is a
     * surprise you cannot see happening.
     */
    clearAll(userId: string, opts?: {
        types?: string[];
    }): Promise<{
        ok: boolean;
        cleared: number;
    }>;
    unreadCount(userId: string): Promise<{
        count: number;
    }>;
    /**
     * §G08 `[08:37]` — unread, split by workspace, for the switcher's dot.
     *
     * `unreadCount` answers "how many altogether", which is the wrong question
     * for somebody deciding WHICH workspace to open. Grouped in the database
     * rather than by asking each workspace in turn: the switcher lists every
     * workspace a person belongs to, and one request that returns all of them
     * beats N requests fired when a menu opens.
     *
     * Same predicate as `unreadCount` on purpose — unread here and unread in the
     * bell disagreeing by a different definition would be worse than no dot.
     */
    unreadByWorkspace(userId: string): Promise<Record<string, number>>;
    /**
     * Per-tab tallies for the inbox tab strip (§A2.6). One scan, four filtered
     * counts; `now()` rather than a bound timestamp so all four agree on the same
     * instant without a parameter round-trip.
     */
    triageCounts(userId: string): Promise<{
        inbox: number;
        later: number;
        cleared: number;
        unread: number;
    }>;
    /**
     * §A2.6 — Clear moves a row to the Cleared tab. `readAt` is deliberately left
     * alone so Unclear restores exactly what the user cleared, unread tint included.
     */
    clear(userId: string, notificationId: string): Promise<{
        ok: boolean;
    }>;
    /** The Unclear undo — puts a cleared row back in the Inbox. */
    unclear(userId: string, notificationId: string): Promise<{
        ok: boolean;
    }>;
    /**
     * §A2.6c — save-for-later. Parks the row in the Later tab until `until`;
     * clearing `dismissedAt` at the same time means snoozing something you had
     * already cleared brings it back rather than leaving it in two buckets.
     */
    snooze(userId: string, notificationId: string, until: Date): Promise<{
        ok: boolean;
        snoozedUntil: string;
    }>;
    unsnooze(userId: string, notificationId: string): Promise<{
        ok: boolean;
    }>;
    /**
     * §A2.11 — deliver a notification to the caller through their own preferences,
     * so "why am I not getting these?" is answerable without waiting for real
     * activity. Runs the normal create() path: a muted channel stays muted, and
     * quiet hours still suppress push/email.
     */
    sendTest(userId: string, workspaceId?: string | null): Promise<{
        ok: boolean;
        delivered: boolean;
        inApp: boolean;
        email: boolean;
        quietHours: boolean;
        push: PushDelivery;
    }>;
    /**
     * Aggregate a user's unread notifications from the current digest window
     * (last 24h daily / 7d weekly) into per-type groups. Pure read — used by the
     * preview endpoint and the scheduled digest sender.
     */
    buildDigest(userId: string, frequency?: DigestFrequency, now?: Date): Promise<{
        userId: string;
        frequency: DigestFrequency;
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
    /**
     * Recipients whose digest is enabled, with the metadata the scheduler needs
     * to decide whether to send this hour.
     */
    listDigestRecipients(): Promise<Array<{
        userId: string;
        email: string;
        displayName: string | null;
        frequency: DigestFrequency;
        hour: number;
    }>>;
    /**
     * §7.11 — users who enabled the daily AI briefing, with the delivery hour the
     * briefing cron gates on. Mirrors listDigestRecipients; the jsonb predicate
     * keeps the scan to opted-in users.
     */
    listBriefingRecipients(): Promise<Array<{
        userId: string;
        email: string;
        displayName: string | null;
        enabled: boolean;
        hour: number;
    }>>;
    private sendEmail;
    private mapTypeToEventKey;
    private mergePreferences;
    private getUserPreferences;
    private getUserNotificationContext;
    /**
     * §G06 [06:53] — muted until a moment, and not a minute longer.
     *
     * Read rather than swept, for the same reason a custom status expires on
     * read: a job that un-mutes people is a job that can be down, and staying
     * muted past the meeting is the exact failure this replaced.
     */
    static isTimedMuteActive(dndUntil: Date | string | null | undefined, now?: Date): boolean;
    private isInQuietHours;
    private toMinutes;
    private currentMinutesInTimezone;
    private sendWebPush;
}
export {};
