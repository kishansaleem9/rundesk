"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var NotificationsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsService = exports.DEFAULT_PRIMARY_TYPES = exports.PRIMARY_SELECTABLE_TYPES = exports.SNOOZE_PRESET_HOURS = exports.INBOX_VIEWS = exports.DEFAULT_REMINDER_LEAD_DAYS = exports.ALLOWED_REMINDER_LEAD_DAYS = void 0;
exports.normalizeReminderLeadDays = normalizeReminderLeadDays;
exports.normalizeBriefingPrefs = normalizeBriefingPrefs;
exports.reminderLeadLabel = reminderLeadLabel;
exports.resolveNotificationUrl = resolveNotificationUrl;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const realtime_gateway_1 = require("../realtime/realtime.gateway");
const email_service_1 = require("../email/email.service");
const config_1 = require("@nestjs/config");
const web_push_1 = __importDefault(require("web-push"));
const mentions_1 = require("../../common/utils/mentions");
// --- Reminder lead time (§10.4) --------------------------------------------
// Per-user "remind me N days before a task is due" offsets. Stored on the
// notification_preferences jsonb. The UI exposes 1 day / 2 days / 1 week.
exports.ALLOWED_REMINDER_LEAD_DAYS = [1, 2, 7];
exports.DEFAULT_REMINDER_LEAD_DAYS = [1, 2];
/**
 * Sanitize a stored/submitted lead-days value into a clean, sorted, de-duped
 * array drawn from {@link ALLOWED_REMINDER_LEAD_DAYS}.
 *
 * - Absent/invalid input (not an array) → the default `[1, 2]`.
 * - An explicit empty array is respected (→ `[]`, meaning "overdue only").
 * - Out-of-set or non-integer entries are dropped.
 */
function normalizeReminderLeadDays(input) {
    if (!Array.isArray(input))
        return [...exports.DEFAULT_REMINDER_LEAD_DAYS];
    const allowed = new Set(exports.ALLOWED_REMINDER_LEAD_DAYS);
    const picked = new Set();
    for (const raw of input) {
        const n = typeof raw === 'number' ? raw : Number(raw);
        if (Number.isInteger(n) && allowed.has(n))
            picked.add(n);
    }
    return [...picked].sort((a, b) => a - b);
}
/**
 * §7.11 — sanitize a stored/submitted daily-briefing preference: coerce
 * `enabled` to a boolean and clamp `hour` to an integer 0–23 (default 8). Pure
 * so the profile patch path and the cron's due-hour selection agree exactly.
 */
function normalizeBriefingPrefs(input) {
    const obj = (input ?? {});
    const enabled = obj.enabled === true;
    let hour = 8;
    if (obj.hour !== undefined && obj.hour !== null) {
        const h = Math.trunc(Number(obj.hour));
        if (Number.isFinite(h))
            hour = Math.min(23, Math.max(0, h));
    }
    return { enabled, hour };
}
/** Human label for a due-soon reminder fired `diffDays` before the due date. */
function reminderLeadLabel(diffDays) {
    if (diffDays <= 1)
        return 'tomorrow';
    if (diffDays === 7)
        return 'in 1 week';
    return `in ${diffDays} days`;
}
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
function resolveNotificationUrl(row) {
    const target = row?.target ?? null;
    const storedUrl = typeof target?.url === 'string' ? target.url.trim() : '';
    if (storedUrl.length > 0)
        return storedUrl;
    const entityType = target?.entityType ?? null;
    const entityId = target?.entityId ?? null;
    const workspaceId = row?.workspaceId ?? null;
    if (!entityType || !entityId || !workspaceId)
        return null;
    switch (entityType) {
        case 'task':
            return `/app/${workspaceId}/tasks/${entityId}`;
        case 'doc':
            return `/app/${workspaceId}/docs?doc=${entityId}`;
        // Channel id isn't recoverable from the message id alone, so land on the
        // workspace chat root as a best effort (the stored url carries the channel).
        case 'chat_message':
            return `/app/${workspaceId}/chat`;
        case 'timesheet':
            return `/app/${workspaceId}/time/approvals`;
        case 'insights':
        case 'workload':
            return `/app/${workspaceId}/insights`;
        case 'billing':
            return `/app/${workspaceId}/settings`;
        default:
            return null;
    }
}
exports.INBOX_VIEWS = ['inbox', 'later', 'cleared', 'all'];
/** Snooze presets the inbox offers, in hours from now. */
exports.SNOOZE_PRESET_HOURS = [1, 4, 24, 24 * 7];
/**
 * §2.2 — every notification type the Primary customiser may offer. Kept as a
 * value rather than only a type so the API can reject anything else: this ends
 * up in a jsonb column straight from the client.
 */
exports.PRIMARY_SELECTABLE_TYPES = [
    // §2.8 [19:25] — a call starting is exactly the kind of thing somebody
    // working out of Primary needs to see. Absent from this list it could never
    // appear there, and the customiser could not offer to turn it on however
    // good the picker was.
    'call_started',
    'task_mentioned',
    'doc_mentioned',
    'task_commented',
    'doc_commented',
    'task_assigned',
    'chat_message',
    // §14 — a reply in a thread, distinct from a new channel message.
    'chat_reply',
    'task_due_soon',
    'task_overdue',
    'task_status_changed',
    'task_updated',
    'task_blocked',
    'approval_needed',
    'ai_briefing',
    'workload_alert',
    'task_unassigned',
    'task_follower_changed',
    'message_reaction',
    'shared_with_me',
    'access_requested',
    // G10-10 / G10-11 — offerable as their own rows, which is the entire reason
    // they needed their own types.
    'comment_assigned',
    'comment_resolved',
    'subtask_created',
];
/** What Primary shows for someone who has never opened the customiser. */
exports.DEFAULT_PRIMARY_TYPES = [
    // ON by default: a call happening now is the most time-sensitive thing the
    // Inbox carries, and one you cannot act on later.
    'call_started',
    'task_mentioned',
    'doc_mentioned',
    'task_commented',
    'doc_commented',
    'task_assigned',
    'chat_message',
    // On by default because she asked for them by name: "kisi ne mera hi task
    // kisi aur ko de diya aur mujhe REMOVE kar diya to mujhe woh cheez show ho",
    // "FOLLOWER CHANGE", "agar ACCESS REQUEST … to mujhe show ho".
    'task_unassigned',
    'task_follower_changed',
    'access_requested',
    // G10-10 — an assigned comment is somebody asking you to do something, so it
    // defaults on alongside the other "you are being asked" kinds.
    'comment_assigned',
    // Offered but off, because she said so: "Ab neeche se REACTIONS mujhe na show
    // hon, [shared with] mujhe na show ho."
    //
    // Off too, and deliberately: `comment_resolved` and `subtask_created` are the
    // "Not Important" half of her panel — worth being able to turn on, not worth
    // interrupting anybody by default.
];
function normalizePrimaryTypes(value) {
    if (!Array.isArray(value))
        return exports.DEFAULT_PRIMARY_TYPES;
    const allowed = new Set(exports.PRIMARY_SELECTABLE_TYPES);
    const chosen = [...new Set(value.filter((v) => typeof v === 'string'))].filter((v) => allowed.has(v));
    // An empty Primary is a legitimate choice — it means "show me nothing here" —
    // but an array of nothing but junk is a malformed request, not that choice.
    return value.length > 0 && chosen.length === 0 ? exports.DEFAULT_PRIMARY_TYPES : chosen;
}
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
const INBOX_DENSITIES = ['comfortable', 'compact'];
const DEFAULT_INBOX_VIEW = {
    // The behaviour before this was a choice: day buckets, newest first.
    groupByDate: true,
    sortNewestFirst: true,
    density: 'comfortable',
};
function normalizeInboxView(value) {
    const v = (value ?? {});
    return {
        groupByDate: typeof v.groupByDate === 'boolean' ? v.groupByDate : DEFAULT_INBOX_VIEW.groupByDate,
        sortNewestFirst: typeof v.sortNewestFirst === 'boolean' ? v.sortNewestFirst : DEFAULT_INBOX_VIEW.sortNewestFirst,
        density: INBOX_DENSITIES.includes(v.density)
            ? v.density
            : DEFAULT_INBOX_VIEW.density,
    };
}
const DEFAULT_NOTIFICATION_PREFERENCES = {
    primaryTypes: exports.DEFAULT_PRIMARY_TYPES,
    inboxView: DEFAULT_INBOX_VIEW,
    channels: {
        webEnabled: true,
        mobileEnabled: false,
        dndOn: false,
        dndStart: '21:00',
        dndEnd: '08:00',
        muteSounds: false,
    },
    events: {
        mention: { inApp: true, web: true, mobile: false, email: true },
        assigned: { inApp: true, web: true, mobile: false, email: true },
        comment: { inApp: true, web: true, mobile: false, email: true },
        due: { inApp: true, web: true, mobile: false, email: true },
        status: { inApp: true, web: true, mobile: false, email: true },
        doc: { inApp: true, web: true, mobile: false, email: true },
        chat: { inApp: true, web: true, mobile: false, email: true },
        activity: { inApp: true, web: true, mobile: false, email: true },
    },
    digest: {
        enabled: false,
        frequency: 'daily',
        hour: 8,
    },
    briefing: {
        enabled: false,
        hour: 8,
    },
    reminderLeadDays: [...exports.DEFAULT_REMINDER_LEAD_DAYS],
    autoFollow: true,
};
let NotificationsService = NotificationsService_1 = class NotificationsService {
    constructor(db, realtime, email, config) {
        this.db = db;
        this.realtime = realtime;
        this.email = email;
        this.config = config;
        this.logger = new common_1.Logger(NotificationsService_1.name);
        this.appUrl = this.config.get('APP_URL') ?? 'http://localhost:5173';
        const subject = this.config.get('WEB_PUSH_SUBJECT') ?? 'mailto:admin@rundesk.internal';
        const publicKey = this.config.get('WEB_PUSH_PUBLIC_KEY') ?? null;
        const privateKey = this.config.get('WEB_PUSH_PRIVATE_KEY') ?? null;
        this.webPushPublicKey = publicKey;
        this.webPushEnabled = !!(publicKey && privateKey);
        if (this.webPushEnabled && publicKey && privateKey) {
            web_push_1.default.setVapidDetails(subject, publicKey, privateKey);
        }
    }
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
    async createWithOutcome(data) {
        const { prefs, timezone, dndUntil } = await this.getUserNotificationContext(data.userId);
        const eventKey = this.mapTypeToEventKey(data.type);
        const matrix = prefs.events[eventKey];
        /*
         * §G06 [06:53] — a timed mute suppresses the interrupting channels.
         *
         * Same effect as quiet hours and deliberately so: the notification is
         * still written, so the Inbox has it when they come back, and only the
         * things that buzz are held. Muting for a meeting should not cost you the
         * record of what happened during it.
         */
        const inQuietHours = this.isInQuietHours(prefs, timezone) || NotificationsService_1.isTimedMuteActive(dndUntil);
        const canWebOrMobile = !inQuietHours;
        // Every channel off is the only case where nothing at all happens.
        if (!matrix.inApp && !matrix.web && !matrix.email && !matrix.mobile) {
            return { row: null, delivered: false };
        }
        const formattedBody = data.body
            ? await this.formatMentionBody(data.body)
            : data.body;
        /*
         * §2.2 — DELIVERED means something actually went out.
         *
         * Read off the channel matrix alone this was true for anyone with a single
         * channel switched on, whether or not that channel then fired. Quiet hours
         * gate email and push separately below, so an admin with in-app off, email
         * on and DND running got no row, no mail and no push — and was still
         * counted as told. The requester was then shown "we told them" and refused
         * a second ask for a message that was never sent.
         *
         * Set where each channel actually dispatches, so it cannot drift from them
         * again.
         */
        let delivered = false;
        let row = null;
        if (matrix.inApp || matrix.web || matrix.mobile) {
            ;
            [row] = await this.db
                .insert(db_1.notifications)
                .values({
                userId: data.userId,
                workspaceId: data.workspaceId ?? null,
                actorId: data.actorId ?? null,
                type: data.type,
                title: data.title,
                body: formattedBody,
                target: data.target,
            })
                .returning();
            // A row in the feed is delivery: it is durable and it is read later,
            // which is exactly what a notification is for.
            delivered = Boolean(row);
            if (matrix.inApp || (matrix.web && canWebOrMobile) || (matrix.mobile && canWebOrMobile)) {
                // Push real-time event for bell/tray/toast listeners even when in-app feed is disabled.
                this.realtime.emitToUser(data.userId, {
                    type: 'notification.created',
                    userId: data.userId,
                    // §10.1 — surface the same click-through url the list serializer adds
                    // so a live toast can navigate straight to the item.
                    notification: { ...row, url: resolveNotificationUrl(row) },
                });
            }
        }
        if (matrix.email && !inQuietHours) {
            delivered = true;
            // Best-effort email — do not await, never throws
            this.sendEmail({ ...data, body: formattedBody }).catch(() => undefined);
        }
        // §6.9 / §10.2 — Mobile push delivery. Rundesk is a PWA, so the `mobile`
        // notification channel is served by the very same Web Push (VAPID) transport
        // that backs the `web` channel: an installed / home-screen PWA receives Web
        // Push exactly as a desktop browser does. Native FCM/APNs would require
        // shipping a dedicated native app; until then Web Push IS the mobile
        // transport. We therefore fire a single sendWebPush when EITHER channel is
        // enabled — and because sendWebPush fans out to each of the user's
        // subscriptions exactly once, a user with BOTH `web` and `mobile` toggled on
        // is never double-delivered to the same subscription (dedupe by design).
        if ((matrix.web || matrix.mobile) && !inQuietHours && !data.deferPush) {
            delivered = true;
            void this.sendWebPush(data.userId, {
                title: data.title,
                body: formattedBody,
                url: data.target?.url ? (data.target.url.startsWith('http') ? data.target.url : `${this.appUrl}${data.target.url}`) : this.appUrl,
            }).catch(() => undefined);
        }
        return { row, delivered };
    }
    /** The row, for the callers that only ever wanted that. */
    async create(data) {
        return (await this.createWithOutcome(data)).row;
    }
    async getWebPushPublicKey() {
        return { publicKey: this.webPushPublicKey, enabled: this.webPushEnabled };
    }
    async subscribeWebPush(userId, subscription, userAgent) {
        if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
            return { ok: false, reason: 'invalid_subscription' };
        }
        await this.db
            .insert(db_1.webPushSubscriptions)
            .values({
            userId,
            endpoint: subscription.endpoint,
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
            userAgent: userAgent ?? null,
        })
            .onConflictDoUpdate({
            target: db_1.webPushSubscriptions.endpoint,
            set: {
                userId,
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
                userAgent: userAgent ?? null,
                updatedAt: new Date(),
            },
        });
        return { ok: true };
    }
    async unsubscribeWebPush(userId, endpoint) {
        await this.db
            .delete(db_1.webPushSubscriptions)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.webPushSubscriptions.userId, userId), (0, drizzle_orm_1.eq)(db_1.webPushSubscriptions.endpoint, endpoint)));
        return { ok: true };
    }
    /**
     * §G06 [06:53] — mute for N minutes, or clear it.
     *
     * A duration rather than a moment, because a duration is what somebody
     * picking "for 1 hour" means, and letting the client compute the timestamp
     * puts the answer at the mercy of a wrong clock.
     */
    async setTimedMute(userId, minutes) {
        if (minutes === null || minutes === 0) {
            await this.db.update(db_1.users).set({ dndUntil: null }).where((0, drizzle_orm_1.eq)(db_1.users.id, userId));
            return { mutedUntil: null };
        }
        if (!Number.isFinite(minutes) || minutes < 0) {
            throw new common_1.BadRequestException('minutes must be a positive number, 0, or null');
        }
        // A week. Past that it is not "mute for a while", it is a preference, and
        // the channel switches in Preferences are where that belongs.
        const MAX_MINUTES = 7 * 24 * 60;
        if (minutes > MAX_MINUTES) {
            throw new common_1.BadRequestException('Mute for at most a week — beyond that, switch the channel off');
        }
        const until = new Date(Date.now() + minutes * 60_000);
        await this.db.update(db_1.users).set({ dndUntil: until }).where((0, drizzle_orm_1.eq)(db_1.users.id, userId));
        return { mutedUntil: until.toISOString() };
    }
    /** The caller's timed mute, or null once it has run out. */
    async getTimedMute(userId) {
        const [row] = await this.db
            .select({ dndUntil: db_1.users.dndUntil })
            .from(db_1.users)
            .where((0, drizzle_orm_1.eq)(db_1.users.id, userId))
            .limit(1);
        // Expired reads as absent — the row is left alone rather than swept, so a
        // read never has to write.
        return {
            mutedUntil: NotificationsService_1.isTimedMuteActive(row?.dndUntil)
                ? row.dndUntil.toISOString()
                : null,
        };
    }
    async getPreferences(userId) {
        return this.getUserPreferences(userId);
    }
    /**
     * §A4.7 — does this user want to be auto-subscribed to what they touch?
     * Consulted by the task write paths before they add a watcher, so turning the
     * toggle off actually stops the subscription rather than only hiding it.
     */
    async autoFollowEnabled(userId) {
        const prefs = await this.getUserPreferences(userId);
        return prefs.autoFollow !== false;
    }
    async updatePreferences(userId, patch) {
        // Merge onto the user's *current* preferences (defaults filled in) so a
        // partial patch — e.g. only `reminderLeadDays` from the profile page — never
        // clobbers unrelated settings back to defaults.
        const current = await this.getUserPreferences(userId);
        const merged = this.mergePreferences(current, patch);
        const [row] = await this.db
            .update(db_1.users)
            .set({ notificationPreferences: merged, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.users.id, userId))
            .returning({ notificationPreferences: db_1.users.notificationPreferences });
        return row?.notificationPreferences ?? merged;
    }
    /**
     * Predicate for one inbox bucket (§A2.6). `now` is threaded in so a caller
     * computing several buckets at once partitions them against a single instant.
     */
    viewCondition(view, now) {
        switch (view) {
            case 'later':
                return (0, drizzle_orm_1.and)((0, drizzle_orm_1.isNull)(db_1.notifications.dismissedAt), (0, drizzle_orm_1.gt)(db_1.notifications.snoozedUntil, now));
            case 'cleared':
                return (0, drizzle_orm_1.isNotNull)(db_1.notifications.dismissedAt);
            case 'all':
                return undefined;
            case 'inbox':
            default:
                return (0, drizzle_orm_1.and)((0, drizzle_orm_1.isNull)(db_1.notifications.dismissedAt), (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(db_1.notifications.snoozedUntil), (0, drizzle_orm_1.lte)(db_1.notifications.snoozedUntil, now)));
        }
    }
    async list(userId, opts = {}) {
        const where = (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.notifications.userId, userId), opts.unreadOnly ? (0, drizzle_orm_1.isNull)(db_1.notifications.readAt) : undefined, 
        // Default to the Inbox bucket: the bell and the workspace home both call
        // this bare, and a cleared notification must not resurface there.
        this.viewCondition(opts.view ?? 'inbox', new Date()));
        const rows = await this.db
            .select()
            .from(db_1.notifications)
            .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.notifications.actorId))
            .where(where)
            .orderBy((0, drizzle_orm_1.desc)(db_1.notifications.createdAt))
            .limit(opts.limit ?? 50);
        const mapped = rows.map((row) => ({
            ...(row.notifications ?? row),
            actor: row.users && row.users.id
                ? { id: row.users.id, displayName: row.users.displayName, email: row.users.email }
                : null,
        }));
        const mentionIds = new Set();
        for (const n of mapped) {
            if (typeof n.body === 'string') {
                for (const id of (0, mentions_1.extractMentionUserIds)(n.body))
                    mentionIds.add(id);
            }
        }
        const namesById = await this.resolveMentionDisplayNames([...mentionIds]);
        return mapped.map((n) => ({
            ...n,
            body: typeof n.body === 'string' && n.body.length > 0
                ? (0, mentions_1.formatMentionsInText)(n.body, namesById)
                : n.body,
            // §10.1 — computed click-through link so the frontend can navigate to the
            // relevant item directly (task board, chat channel, time approvals, …).
            // Falls back to null for notifications with no resolvable target.
            url: resolveNotificationUrl(n),
        }));
    }
    async formatMentionBody(body) {
        const ids = (0, mentions_1.extractMentionUserIds)(body);
        if (ids.length === 0)
            return body;
        const namesById = await this.resolveMentionDisplayNames(ids);
        return (0, mentions_1.formatMentionsInText)(body, namesById);
    }
    async resolveMentionDisplayNames(userIds) {
        if (userIds.length === 0)
            return {};
        const rows = await this.db
            .select({ id: db_1.users.id, displayName: db_1.users.displayName, email: db_1.users.email })
            .from(db_1.users)
            .where((0, drizzle_orm_1.inArray)(db_1.users.id, userIds));
        return Object.fromEntries(rows.map((r) => [r.id, (r.displayName?.trim() || r.email?.trim() || 'teammate')]));
    }
    async markRead(userId, notificationId) {
        await this.db
            .update(db_1.notifications)
            .set({ readAt: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.notifications.id, notificationId), (0, drizzle_orm_1.eq)(db_1.notifications.userId, userId)));
        return { ok: true };
    }
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
    async markUnread(userId, notificationId) {
        await this.db
            .update(db_1.notifications)
            .set({ readAt: null })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.notifications.id, notificationId), (0, drizzle_orm_1.eq)(db_1.notifications.userId, userId)));
        return { ok: true };
    }
    async markAllRead(userId) {
        const now = new Date();
        // Scoped to the Inbox bucket so a snoozed row comes back unread when its
        // Later window lapses — that is the whole point of saving it for later.
        await this.db
            .update(db_1.notifications)
            .set({ readAt: now })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.notifications.userId, userId), (0, drizzle_orm_1.isNull)(db_1.notifications.readAt), this.viewCondition('inbox', now)));
        return { ok: true };
    }
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
    async clearAll(userId, opts = {}) {
        const now = new Date();
        // An explicit empty list means "none of these", not "no filter". Omitting
        // `types` is how a caller asks to clear the whole bucket; treating `[]` the
        // same way turns "clear what the chip shows" into "clear everything" the
        // moment the chip is showing nothing.
        if (opts.types && opts.types.length === 0)
            return { ok: true, cleared: 0 };
        const rows = await this.db
            .update(db_1.notifications)
            .set({ dismissedAt: now, snoozedUntil: null })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.notifications.userId, userId), this.viewCondition('inbox', now), opts.types?.length ? (0, drizzle_orm_1.inArray)(db_1.notifications.type, opts.types) : undefined))
            .returning({ id: db_1.notifications.id });
        return { ok: true, cleared: rows.length };
    }
    async unreadCount(userId) {
        const [row] = await this.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(db_1.notifications)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.notifications.userId, userId), (0, drizzle_orm_1.isNull)(db_1.notifications.readAt), this.viewCondition('inbox', new Date())));
        return { count: row?.count ?? 0 };
    }
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
    async unreadByWorkspace(userId) {
        const rows = await this.db
            .select({
            workspaceId: db_1.notifications.workspaceId,
            count: (0, drizzle_orm_1.sql) `count(*)::int`,
        })
            .from(db_1.notifications)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.notifications.userId, userId), (0, drizzle_orm_1.isNull)(db_1.notifications.readAt), (0, drizzle_orm_1.isNotNull)(db_1.notifications.workspaceId), this.viewCondition('inbox', new Date())))
            .groupBy(db_1.notifications.workspaceId);
        const byWorkspace = {};
        for (const row of rows) {
            if (row.workspaceId)
                byWorkspace[row.workspaceId] = row.count;
        }
        return byWorkspace;
    }
    /**
     * Per-tab tallies for the inbox tab strip (§A2.6). One scan, four filtered
     * counts; `now()` rather than a bound timestamp so all four agree on the same
     * instant without a parameter round-trip.
     */
    async triageCounts(userId) {
        const [row] = await this.db
            .select({
            inbox: (0, drizzle_orm_1.sql) `count(*) filter (where ${db_1.notifications.dismissedAt} is null and (${db_1.notifications.snoozedUntil} is null or ${db_1.notifications.snoozedUntil} <= now()))::int`,
            later: (0, drizzle_orm_1.sql) `count(*) filter (where ${db_1.notifications.dismissedAt} is null and ${db_1.notifications.snoozedUntil} > now())::int`,
            cleared: (0, drizzle_orm_1.sql) `count(*) filter (where ${db_1.notifications.dismissedAt} is not null)::int`,
            unread: (0, drizzle_orm_1.sql) `count(*) filter (where ${db_1.notifications.readAt} is null and ${db_1.notifications.dismissedAt} is null and (${db_1.notifications.snoozedUntil} is null or ${db_1.notifications.snoozedUntil} <= now()))::int`,
        })
            .from(db_1.notifications)
            .where((0, drizzle_orm_1.eq)(db_1.notifications.userId, userId));
        return {
            inbox: row?.inbox ?? 0,
            later: row?.later ?? 0,
            cleared: row?.cleared ?? 0,
            unread: row?.unread ?? 0,
        };
    }
    /**
     * §A2.6 — Clear moves a row to the Cleared tab. `readAt` is deliberately left
     * alone so Unclear restores exactly what the user cleared, unread tint included.
     */
    async clear(userId, notificationId) {
        await this.db
            .update(db_1.notifications)
            .set({ dismissedAt: new Date(), snoozedUntil: null })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.notifications.id, notificationId), (0, drizzle_orm_1.eq)(db_1.notifications.userId, userId)));
        return { ok: true };
    }
    /** The Unclear undo — puts a cleared row back in the Inbox. */
    async unclear(userId, notificationId) {
        await this.db
            .update(db_1.notifications)
            .set({ dismissedAt: null })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.notifications.id, notificationId), (0, drizzle_orm_1.eq)(db_1.notifications.userId, userId)));
        return { ok: true };
    }
    /**
     * §A2.6c — save-for-later. Parks the row in the Later tab until `until`;
     * clearing `dismissedAt` at the same time means snoozing something you had
     * already cleared brings it back rather than leaving it in two buckets.
     */
    async snooze(userId, notificationId, until) {
        await this.db
            .update(db_1.notifications)
            .set({ snoozedUntil: until, dismissedAt: null })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.notifications.id, notificationId), (0, drizzle_orm_1.eq)(db_1.notifications.userId, userId)));
        return { ok: true, snoozedUntil: until.toISOString() };
    }
    async unsnooze(userId, notificationId) {
        await this.db
            .update(db_1.notifications)
            .set({ snoozedUntil: null })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.notifications.id, notificationId), (0, drizzle_orm_1.eq)(db_1.notifications.userId, userId)));
        return { ok: true };
    }
    /**
     * §A2.11 — deliver a notification to the caller through their own preferences,
     * so "why am I not getting these?" is answerable without waiting for real
     * activity. Runs the normal create() path: a muted channel stays muted, and
     * quiet hours still suppress push/email.
     */
    async sendTest(userId, workspaceId) {
        const { prefs, timezone, dndUntil } = await this.getUserNotificationContext(userId);
        const matrix = prefs.events[this.mapTypeToEventKey('test_notification')];
        // The test send has to report the truth, including "you are muted until
        // 3pm" — that is the whole point of pressing it.
        const inQuietHours = this.isInQuietHours(prefs, timezone) || NotificationsService_1.isTimedMuteActive(dndUntil);
        const row = await this.create({
            userId,
            workspaceId: workspaceId ?? null,
            type: 'test_notification',
            title: 'Test notification',
            body: 'If you can see this, in-app delivery is working. Push and email follow the same preferences.',
            target: workspaceId ? { entityType: 'insights', entityId: workspaceId, url: `/app/${workspaceId}/inbox` } : undefined,
            deferPush: true,
        });
        // §A4.7 — push is sent here rather than inside create() so its verdict can
        // be returned. Without this the button reported "sent" whenever the in-app
        // row was written, which is precisely the case where push silently isn't.
        let push;
        if (!matrix.web && !matrix.mobile)
            push = { status: 'channel_off' };
        else if (inQuietHours)
            push = { status: 'quiet_hours' };
        else {
            push = await this.sendWebPush(userId, {
                title: 'Test notification',
                body: 'Push delivery is working.',
                url: workspaceId ? `${this.appUrl}/app/${workspaceId}/inbox` : this.appUrl,
            }).catch(() => ({ status: 'sent', sent: 0, failed: 1 }));
        }
        return {
            ok: true,
            delivered: Boolean(row),
            inApp: matrix.inApp,
            email: matrix.email && !inQuietHours,
            quietHours: inQuietHours,
            push,
        };
    }
    // ---------------------------------------------------------------------------
    // Digest
    // ---------------------------------------------------------------------------
    /**
     * Aggregate a user's unread notifications from the current digest window
     * (last 24h daily / 7d weekly) into per-type groups. Pure read — used by the
     * preview endpoint and the scheduled digest sender.
     */
    async buildDigest(userId, frequency = 'daily', now = new Date()) {
        const windowMs = frequency === 'weekly' ? 7 * 24 * 3600_000 : 24 * 3600_000;
        const since = new Date(now.getTime() - windowMs);
        const rows = await this.db
            .select({
            type: db_1.notifications.type,
            title: db_1.notifications.title,
            body: db_1.notifications.body,
            target: db_1.notifications.target,
            createdAt: db_1.notifications.createdAt,
        })
            .from(db_1.notifications)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.notifications.userId, userId), (0, drizzle_orm_1.isNull)(db_1.notifications.readAt), (0, drizzle_orm_1.gte)(db_1.notifications.createdAt, since)))
            .orderBy((0, drizzle_orm_1.desc)(db_1.notifications.createdAt));
        const ITEMS_PER_GROUP = 6;
        const byType = new Map();
        for (const r of rows) {
            const g = byType.get(r.type) ?? { count: 0, items: [] };
            g.count += 1;
            if (g.items.length < ITEMS_PER_GROUP) {
                g.items.push({
                    title: r.title,
                    body: r.body,
                    url: r.target?.url ?? null,
                    createdAt: r.createdAt.toISOString(),
                });
            }
            byType.set(r.type, g);
        }
        const groups = [...byType.entries()]
            .map(([type, g]) => ({ type, count: g.count, items: g.items }))
            .sort((a, b) => b.count - a.count);
        return {
            userId,
            frequency,
            since: since.toISOString(),
            until: now.toISOString(),
            total: rows.length,
            groups,
        };
    }
    /**
     * Recipients whose digest is enabled, with the metadata the scheduler needs
     * to decide whether to send this hour.
     */
    async listDigestRecipients() {
        const rows = await this.db
            .select({
            userId: db_1.users.id,
            email: db_1.users.email,
            displayName: db_1.users.displayName,
            prefs: db_1.users.notificationPreferences,
        })
            .from(db_1.users)
            .where((0, drizzle_orm_1.sql) `(${db_1.users.notificationPreferences} -> 'digest' ->> 'enabled')::boolean = true`);
        return rows
            .map((r) => {
            const d = r.prefs?.digest;
            return {
                userId: r.userId,
                email: r.email,
                displayName: r.displayName,
                frequency: (d?.frequency ?? 'daily'),
                hour: typeof d?.hour === 'number' ? d.hour : 8,
            };
        })
            .filter((r) => Boolean(r.email));
    }
    /**
     * §7.11 — users who enabled the daily AI briefing, with the delivery hour the
     * briefing cron gates on. Mirrors listDigestRecipients; the jsonb predicate
     * keeps the scan to opted-in users.
     */
    async listBriefingRecipients() {
        const rows = await this.db
            .select({
            userId: db_1.users.id,
            email: db_1.users.email,
            displayName: db_1.users.displayName,
            prefs: db_1.users.notificationPreferences,
        })
            .from(db_1.users)
            .where((0, drizzle_orm_1.sql) `(${db_1.users.notificationPreferences} -> 'briefing' ->> 'enabled')::boolean = true`);
        return rows.map((r) => {
            const b = normalizeBriefingPrefs(r.prefs?.briefing);
            return {
                userId: r.userId,
                email: r.email,
                displayName: r.displayName,
                enabled: b.enabled,
                hour: b.hour,
            };
        });
    }
    // ---------------------------------------------------------------------------
    // Private — email dispatch
    // ---------------------------------------------------------------------------
    async sendEmail(data) {
        // Resolve recipient user
        const [recipient] = await this.db
            .select({ email: db_1.users.email, displayName: db_1.users.displayName })
            .from(db_1.users)
            .where((0, drizzle_orm_1.eq)(db_1.users.id, data.userId))
            .limit(1);
        if (!recipient)
            return;
        // Resolve actor display name
        let actorName = 'Someone';
        if (data.actorId) {
            const [actor] = await this.db
                .select({ displayName: db_1.users.displayName })
                .from(db_1.users)
                .where((0, drizzle_orm_1.eq)(db_1.users.id, data.actorId))
                .limit(1);
            if (actor)
                actorName = actor.displayName;
        }
        const taskUrl = data.target?.url
            ? (data.target.url.startsWith('http') ? data.target.url : `${this.appUrl}${data.target.url}`)
            : this.appUrl;
        const ctx = data.emailContext ?? {};
        const taskTitle = ctx.taskTitle ?? data.title;
        const workspaceName = ctx.workspaceName ?? 'your workspace';
        switch (data.type) {
            case 'task_assigned':
                await this.email.sendTaskAssigned({
                    to: recipient.email,
                    recipientName: recipient.displayName,
                    actorName,
                    taskTitle,
                    taskUrl,
                    workspaceName,
                });
                break;
            case 'task_mentioned':
                await this.email.sendMention({
                    to: recipient.email,
                    recipientName: recipient.displayName,
                    actorName,
                    context: 'in a comment',
                    taskTitle,
                    taskUrl,
                    workspaceName,
                });
                break;
            case 'task_commented':
                if (ctx.commentVariant === 'resolved') {
                    await this.email.sendCommentResolved({
                        to: recipient.email,
                        recipientName: recipient.displayName,
                        actorName,
                        taskTitle,
                        taskUrl,
                        commentSnippet: ctx.commentSnippet ?? '(view in app)',
                        workspaceName,
                    });
                }
                else {
                    await this.email.sendComment({
                        to: recipient.email,
                        recipientName: recipient.displayName,
                        actorName,
                        taskTitle,
                        taskUrl,
                        commentSnippet: ctx.commentSnippet ?? '(view in app)',
                        workspaceName,
                    });
                }
                break;
            case 'task_due_soon':
                await this.email.sendDueSoon({
                    to: recipient.email,
                    recipientName: recipient.displayName,
                    taskTitle,
                    taskUrl,
                    dueDateLabel: ctx.dueDateLabel ?? 'soon',
                    workspaceName,
                });
                break;
            case 'task_overdue':
                await this.email.sendOverdue({
                    to: recipient.email,
                    recipientName: recipient.displayName,
                    taskTitle,
                    taskUrl,
                    workspaceName,
                });
                break;
            case 'task_status_changed':
            case 'task_updated':
            case 'chat_message':
            case 'doc_mentioned':
            case 'doc_commented':
                await this.email.sendActivity({
                    to: recipient.email,
                    recipientName: recipient.displayName,
                    actorName,
                    title: data.title,
                    body: data.body,
                    taskUrl,
                    workspaceName,
                });
                break;
            default:
                await this.email.sendActivity({
                    to: recipient.email,
                    recipientName: recipient.displayName,
                    actorName,
                    title: data.title,
                    body: data.body,
                    taskUrl,
                    workspaceName,
                });
                break;
        }
    }
    mapTypeToEventKey(type) {
        switch (type) {
            case 'task_mentioned':
                return 'mention';
            // §G11 [15:36] — being asked to act on a message is being assigned
            // something. Somebody who muted "assigned" meant both.
            //
            // G10-10 — and an assigned comment for the same reason: it is somebody
            // asking you to do something, whatever it is attached to.
            case 'task_assigned':
            case 'message_assigned':
            case 'comment_assigned':
                return 'assigned';
            // G10-10 — a resolved comment is comment traffic; muting comments must
            // mute it too, or splitting it into its own type becomes a way to
            // receive MORE than before rather than to tell two things apart.
            case 'task_commented':
            case 'comment_resolved':
                return 'comment';
            // §G11 [15:19] — a reminder you set yourself is a deadline arriving,
            // whatever it is about, so it rides the same channel as a due date.
            case 'task_due_soon':
            case 'task_overdue':
            case 'message_reminder':
                return 'due';
            // A task becoming blocked is a workflow/state change — route it with
            // status notifications so muting status also mutes blocked alerts.
            case 'task_status_changed':
            case 'task_blocked':
                return 'status';
            case 'doc_mentioned':
            case 'doc_commented':
                return 'doc';
            // §2.8 [19:25] — a call starting in a channel is chat activity, and rides
            // the chat channel deliberately: somebody who has muted a channel's
            // messages has not asked to be called from it either.
            case 'chat_message':
            case 'call_started':
                return 'chat';
            // §7.11 — the daily AI briefing rides the general activity channel so a
            // user who mutes activity also mutes their briefing.
            // §7.12 — proactive workload alerts ride the general activity channel too.
            // §A2.11 — so does the test send, which is the point: it proves the
            // channels the user has actually left on.
            case 'task_updated':
            case 'ai_briefing':
            case 'workload_alert':
            case 'test_notification':
            default:
                return 'activity';
        }
    }
    mergePreferences(base, patch) {
        if (!patch)
            return base;
        return {
            channels: {
                ...base.channels,
                ...(patch.channels ?? {}),
            },
            events: {
                mention: { ...base.events.mention, ...(patch.events?.mention ?? {}) },
                assigned: { ...base.events.assigned, ...(patch.events?.assigned ?? {}) },
                comment: { ...base.events.comment, ...(patch.events?.comment ?? {}) },
                due: { ...base.events.due, ...(patch.events?.due ?? {}) },
                status: { ...base.events.status, ...(patch.events?.status ?? {}) },
                doc: { ...base.events.doc, ...(patch.events?.doc ?? {}) },
                chat: { ...base.events.chat, ...(patch.events?.chat ?? {}) },
                activity: { ...base.events.activity, ...(patch.events?.activity ?? {}) },
            },
            digest: {
                ...base.digest,
                ...(patch.digest ?? {}),
            },
            briefing: normalizeBriefingPrefs({ ...base.briefing, ...(patch.briefing ?? {}) }),
            reminderLeadDays: normalizeReminderLeadDays(patch.reminderLeadDays ?? base.reminderLeadDays),
            primaryTypes: normalizePrimaryTypes(patch.primaryTypes ?? base.primaryTypes),
            inboxView: normalizeInboxView({ ...(base.inboxView ?? DEFAULT_INBOX_VIEW), ...(patch.inboxView ?? {}) }),
            autoFollow: patch.autoFollow ?? base.autoFollow,
            // §14.3 — carry through the onboarding-dismissed flag untouched (set out of
            // band by WorkspacesService) so editing notification prefs never resets it.
            ...(patch.onboarding
                ? { onboarding: patch.onboarding }
                : {}),
        };
    }
    async getUserPreferences(userId) {
        const [row] = await this.db
            .select({ notificationPreferences: db_1.users.notificationPreferences })
            .from(db_1.users)
            .where((0, drizzle_orm_1.eq)(db_1.users.id, userId))
            .limit(1);
        const saved = row?.notificationPreferences;
        return this.mergePreferences(DEFAULT_NOTIFICATION_PREFERENCES, saved);
    }
    async getUserNotificationContext(userId) {
        const [row] = await this.db
            .select({
            notificationPreferences: db_1.users.notificationPreferences,
            timezone: db_1.users.timezone,
            // §G06 [06:53] — "muted until 3pm" is a different fact from the
            // scheduled quiet hours in the prefs blob, and both can be true.
            dndUntil: db_1.users.dndUntil,
        })
            .from(db_1.users)
            .where((0, drizzle_orm_1.eq)(db_1.users.id, userId))
            .limit(1);
        const saved = row?.notificationPreferences;
        return {
            prefs: this.mergePreferences(DEFAULT_NOTIFICATION_PREFERENCES, saved),
            timezone: row?.timezone || 'UTC',
            dndUntil: row?.dndUntil ?? null,
        };
    }
    /**
     * §G06 [06:53] — muted until a moment, and not a minute longer.
     *
     * Read rather than swept, for the same reason a custom status expires on
     * read: a job that un-mutes people is a job that can be down, and staying
     * muted past the meeting is the exact failure this replaced.
     */
    static isTimedMuteActive(dndUntil, now = new Date()) {
        if (!dndUntil)
            return false;
        const until = dndUntil instanceof Date ? dndUntil : new Date(dndUntil);
        if (Number.isNaN(until.getTime()))
            return false;
        return until.getTime() > now.getTime();
    }
    isInQuietHours(prefs, timezone) {
        if (!prefs.channels.dndOn)
            return false;
        const start = this.toMinutes(prefs.channels.dndStart);
        const end = this.toMinutes(prefs.channels.dndEnd);
        if (start === null || end === null)
            return false;
        const current = this.currentMinutesInTimezone(timezone);
        if (start === end)
            return true;
        if (start < end)
            return current >= start && current < end;
        return current >= start || current < end;
    }
    toMinutes(hhmm) {
        const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
        if (!match)
            return null;
        const h = Number(match[1]);
        const m = Number(match[2]);
        if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59)
            return null;
        return h * 60 + m;
    }
    currentMinutesInTimezone(timezone) {
        try {
            const parts = new Intl.DateTimeFormat('en-GB', {
                timeZone: timezone,
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
            }).formatToParts(new Date());
            const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
            const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
            return hour * 60 + minute;
        }
        catch {
            const d = new Date();
            return d.getHours() * 60 + d.getMinutes();
        }
    }
    async sendWebPush(userId, payload) {
        if (!this.webPushEnabled)
            return { status: 'not_configured' };
        const rows = await this.db
            .select()
            .from(db_1.webPushSubscriptions)
            .where((0, drizzle_orm_1.eq)(db_1.webPushSubscriptions.userId, userId));
        if (rows.length === 0)
            return { status: 'no_subscriptions' };
        const message = JSON.stringify({
            title: payload.title,
            body: payload.body ?? '',
            url: payload.url ?? this.appUrl,
            icon: '/favicon.svg',
            badge: '/favicon.svg',
            tag: `rundesk-${Date.now()}`,
        });
        const results = await Promise.all(rows.map(async (row) => {
            try {
                await web_push_1.default.sendNotification({
                    endpoint: row.endpoint,
                    keys: { p256dh: row.p256dh, auth: row.auth },
                }, message);
                return true;
            }
            catch (err) {
                const status = Number(err?.statusCode ?? 0);
                if (status === 404 || status === 410) {
                    // The vendor has retired this endpoint — dropping it is the fix, not a
                    // failure worth reporting.
                    await this.db.delete(db_1.webPushSubscriptions).where((0, drizzle_orm_1.eq)(db_1.webPushSubscriptions.id, row.id));
                }
                else {
                    // §A4.7 — a rejected push used to vanish here, which is exactly why
                    // "I never get notifications" was unanswerable.
                    this.logger.warn(`Web push to ${userId} failed (${status || 'unknown'}): ${err?.message ?? err}`);
                }
                return false;
            }
        }));
        const sent = results.filter(Boolean).length;
        return { status: 'sent', sent, failed: results.length - sent };
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = NotificationsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, realtime_gateway_1.RealtimeGateway,
        email_service_1.EmailService,
        config_1.ConfigService])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map