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
var PresenceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PresenceService = exports.AWAY_WINDOW_MS = exports.ONLINE_WINDOW_MS = exports.MANUAL_PRESENCE_STATUSES = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
/**
 * §A4.8 — the statuses a user may set for themselves. Derived presence reports
 * activity; an override reports intent, which is the only thing a teammate can
 * act on ("don't interrupt" cannot be inferred from a heartbeat).
 */
exports.MANUAL_PRESENCE_STATUSES = ['online', 'away', 'busy', 'offline'];
// Online while a socket pings (every ~60s) plus slack; away for a while after;
// offline once cold. Tuned so a briefly-flaky connection doesn't flip to away.
exports.ONLINE_WINDOW_MS = 150_000; // 2.5 min
exports.AWAY_WINDOW_MS = 15 * 60_000; // 15 min
let PresenceService = PresenceService_1 = class PresenceService {
    constructor(db) {
        this.db = db;
    }
    /** Derive a presence status from a last-seen timestamp. */
    static deriveStatus(lastSeenAt, now = new Date()) {
        if (!lastSeenAt)
            return 'offline';
        const seen = lastSeenAt instanceof Date ? lastSeenAt : new Date(lastSeenAt);
        const ageMs = now.getTime() - seen.getTime();
        if (ageMs < 0)
            return 'online'; // clock skew — treat a future stamp as fresh
        if (ageMs <= exports.ONLINE_WINDOW_MS)
            return 'online';
        if (ageMs <= exports.AWAY_WINDOW_MS)
            return 'away';
        return 'offline';
    }
    /**
     * The status a teammate should see: the user's own override when they set
     * one, otherwise the heartbeat-derived value.
     */
    static resolveStatus(presenceStatus, lastSeenAt, now = new Date()) {
        if (presenceStatus && exports.MANUAL_PRESENCE_STATUSES.includes(presenceStatus)) {
            return presenceStatus;
        }
        return PresenceService_1.deriveStatus(lastSeenAt, now);
    }
    /**
     * Set or clear the caller's own presence override. `null` hands presence back
     * to the heartbeat.
     */
    async setManualStatus(userId, status) {
        if (status !== null && !exports.MANUAL_PRESENCE_STATUSES.includes(status)) {
            throw new common_1.BadRequestException(`status must be one of ${exports.MANUAL_PRESENCE_STATUSES.join(', ')} or null`);
        }
        const [row] = await this.db
            .update(db_1.users)
            .set({ presenceStatus: status })
            .where((0, drizzle_orm_1.eq)(db_1.users.id, userId))
            .returning({ presenceStatus: db_1.users.presenceStatus, lastSeenAt: db_1.users.lastSeenAt });
        return {
            presenceStatus: row?.presenceStatus ?? null,
            status: PresenceService_1.resolveStatus(row?.presenceStatus, row?.lastSeenAt),
        };
    }
    /** Refresh a user's presence heartbeat. Called on socket connect + ping. */
    async recordHeartbeat(userId, now = new Date()) {
        if (!userId)
            return;
        await this.db.update(db_1.users).set({ lastSeenAt: now }).where((0, drizzle_orm_1.eq)(db_1.users.id, userId));
    }
    /**
     * §G06 [06:42] — a status that has expired is not a status.
     *
     * Enforced on read, everywhere, rather than by a sweeper. A job that clears
     * statuses is a job that can be down, and a status outliving its reason —
     * "Busy" three days after the meeting — is exactly what this feature exists
     * to prevent. Past the moment, every reader sees nothing.
     */
    static liveStatus(row, now = new Date()) {
        if (!row?.statusEmoji && !row?.statusText)
            return null;
        if (row.statusExpiresAt) {
            const until = row.statusExpiresAt instanceof Date ? row.statusExpiresAt : new Date(row.statusExpiresAt);
            if (!Number.isNaN(until.getTime()) && until.getTime() <= now.getTime())
                return null;
        }
        return {
            emoji: row.statusEmoji ?? null,
            text: row.statusText ?? null,
            expiresAt: row.statusExpiresAt
                ? (row.statusExpiresAt instanceof Date ? row.statusExpiresAt : new Date(row.statusExpiresAt)).toISOString()
                : null,
        };
    }
    /**
     * §G06 [06:42] — set the caller's custom status.
     *
     * "main yahan se apna status set kar sakti hoon ke main is time kya kar rahi
     * hoon." Emoji and text are both optional; clearing both clears the status,
     * which is what the Clear button does rather than needing a second endpoint.
     */
    async setCustomStatus(userId, input) {
        const emoji = input.emoji?.trim() || null;
        const text = input.text?.trim() || null;
        // Long enough for "In a meeting until 3, ping me if urgent", short enough
        // that a status cannot be used as a paragraph in somebody's sidebar.
        if (text && text.length > 120)
            throw new common_1.BadRequestException('A status is at most 120 characters');
        // One grapheme. Anything longer is a sentence in the emoji slot, which
        // breaks every place this renders in a 16px square.
        if (emoji && [...emoji].length > 2)
            throw new common_1.BadRequestException('Pick a single emoji');
        let expiresAt = null;
        if (input.expiresAt) {
            expiresAt = input.expiresAt instanceof Date ? input.expiresAt : new Date(input.expiresAt);
            if (Number.isNaN(expiresAt.getTime()))
                throw new common_1.BadRequestException('expiresAt must be a valid date/time');
            if (expiresAt.getTime() <= Date.now()) {
                throw new common_1.BadRequestException('A status that has already expired is not a status');
            }
        }
        // Clearing the words clears the clock with them, so a later status does not
        // inherit the expiry of the one before it.
        if (!emoji && !text)
            expiresAt = null;
        const [row] = await this.db
            .update(db_1.users)
            .set({ statusEmoji: emoji, statusText: text, statusExpiresAt: expiresAt })
            .where((0, drizzle_orm_1.eq)(db_1.users.id, userId))
            .returning({
            statusEmoji: db_1.users.statusEmoji,
            statusText: db_1.users.statusText,
            statusExpiresAt: db_1.users.statusExpiresAt,
        });
        return { status: PresenceService_1.liveStatus(row ?? {}) };
    }
    /**
     * Presence for every member of a workspace (requires the caller to be a
     * member). Returns each member's raw lastSeenAt plus the derived status.
     */
    async getWorkspacePresence(workspaceId, requesterId, now = new Date()) {
        const [membership] = await this.db
            .select({ userId: db_1.workspaceMembers.userId })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, requesterId)))
            .limit(1);
        if (!membership)
            throw new common_1.ForbiddenException('Workspace membership required');
        const rows = await this.db
            .select({
            userId: db_1.users.id,
            lastSeenAt: db_1.users.lastSeenAt,
            presenceStatus: db_1.users.presenceStatus,
            // §G06 [06:42] — the words, alongside the dot. Read here rather than
            // fetched separately: "away" and "on a 30-minute break" are the same
            // glance, and two round trips guarantees they disagree for a moment.
            statusEmoji: db_1.users.statusEmoji,
            statusText: db_1.users.statusText,
            statusExpiresAt: db_1.users.statusExpiresAt,
        })
            .from(db_1.workspaceMembers)
            .innerJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.workspaceMembers.userId))
            .where((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId));
        return rows.map((r) => ({
            userId: r.userId,
            lastSeenAt: r.lastSeenAt,
            manual: r.presenceStatus ?? null,
            status: PresenceService_1.resolveStatus(r.presenceStatus, r.lastSeenAt, now),
            customStatus: PresenceService_1.liveStatus(r, now),
        }));
    }
    /** Presence for a specific set of users (any workspace) — keyed by userId. */
    async statusFor(userIds, now = new Date()) {
        const ids = [...new Set(userIds.filter(Boolean))];
        if (ids.length === 0)
            return {};
        const rows = await this.db
            .select({ userId: db_1.users.id, lastSeenAt: db_1.users.lastSeenAt, presenceStatus: db_1.users.presenceStatus })
            .from(db_1.users)
            .where((0, drizzle_orm_1.inArray)(db_1.users.id, ids));
        const out = {};
        for (const r of rows)
            out[r.userId] = PresenceService_1.resolveStatus(r.presenceStatus, r.lastSeenAt, now);
        return out;
    }
};
exports.PresenceService = PresenceService;
exports.PresenceService = PresenceService = PresenceService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], PresenceService);
//# sourceMappingURL=presence.service.js.map