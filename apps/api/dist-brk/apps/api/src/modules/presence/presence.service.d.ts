import type { Db } from '@rundesk/db';
export type PresenceStatus = 'online' | 'away' | 'busy' | 'offline';
/**
 * §A4.8 — the statuses a user may set for themselves. Derived presence reports
 * activity; an override reports intent, which is the only thing a teammate can
 * act on ("don't interrupt" cannot be inferred from a heartbeat).
 */
export declare const MANUAL_PRESENCE_STATUSES: readonly ["online", "away", "busy", "offline"];
export type ManualPresenceStatus = (typeof MANUAL_PRESENCE_STATUSES)[number];
export declare const ONLINE_WINDOW_MS = 150000;
export declare const AWAY_WINDOW_MS: number;
export declare class PresenceService {
    private db;
    constructor(db: Db);
    /** Derive a presence status from a last-seen timestamp. */
    static deriveStatus(lastSeenAt: Date | string | null | undefined, now?: Date): PresenceStatus;
    /**
     * The status a teammate should see: the user's own override when they set
     * one, otherwise the heartbeat-derived value.
     */
    static resolveStatus(presenceStatus: string | null | undefined, lastSeenAt: Date | string | null | undefined, now?: Date): PresenceStatus;
    /**
     * Set or clear the caller's own presence override. `null` hands presence back
     * to the heartbeat.
     */
    setManualStatus(userId: string, status: ManualPresenceStatus | null): Promise<{
        presenceStatus: "online" | "away" | "busy" | "offline" | null;
        status: PresenceStatus;
    }>;
    /** Refresh a user's presence heartbeat. Called on socket connect + ping. */
    recordHeartbeat(userId: string, now?: Date): Promise<void>;
    /**
     * §G06 [06:42] — a status that has expired is not a status.
     *
     * Enforced on read, everywhere, rather than by a sweeper. A job that clears
     * statuses is a job that can be down, and a status outliving its reason —
     * "Busy" three days after the meeting — is exactly what this feature exists
     * to prevent. Past the moment, every reader sees nothing.
     */
    static liveStatus(row: {
        statusEmoji?: string | null;
        statusText?: string | null;
        statusExpiresAt?: Date | string | null;
    }, now?: Date): {
        emoji: string | null;
        text: string | null;
        expiresAt: string | null;
    } | null;
    /**
     * §G06 [06:42] — set the caller's custom status.
     *
     * "main yahan se apna status set kar sakti hoon ke main is time kya kar rahi
     * hoon." Emoji and text are both optional; clearing both clears the status,
     * which is what the Clear button does rather than needing a second endpoint.
     */
    setCustomStatus(userId: string, input: {
        emoji?: string | null;
        text?: string | null;
        expiresAt?: string | Date | null;
    }): Promise<{
        status: {
            emoji: string | null;
            text: string | null;
            expiresAt: string | null;
        } | null;
    }>;
    /**
     * Presence for every member of a workspace (requires the caller to be a
     * member). Returns each member's raw lastSeenAt plus the derived status.
     */
    getWorkspacePresence(workspaceId: string, requesterId: string, now?: Date): Promise<{
        userId: string;
        lastSeenAt: Date | null;
        manual: "online" | "away" | "busy" | "offline" | null;
        status: PresenceStatus;
        customStatus: {
            emoji: string | null;
            text: string | null;
            expiresAt: string | null;
        } | null;
    }[]>;
    /** Presence for a specific set of users (any workspace) — keyed by userId. */
    statusFor(userIds: string[], now?: Date): Promise<Record<string, PresenceStatus>>;
}
