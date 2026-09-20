import { PresenceService, type ManualPresenceStatus } from './presence.service';
import type { CurrentUserPayload } from '../tasks/types';
export declare class PresenceController {
    private presence;
    constructor(presence: PresenceService);
    list(workspaceId: string, user: CurrentUserPayload): Promise<{
        userId: string;
        lastSeenAt: Date | null;
        manual: "online" | "away" | "busy" | "offline" | null;
        status: import("./presence.service").PresenceStatus;
        customStatus: {
            emoji: string | null;
            text: string | null;
            expiresAt: string | null;
        } | null;
    }[]>;
}
/**
 * §A4.8 — a presence override belongs to the person, not to one workspace, so
 * it is set outside the workspace-scoped controller above.
 */
export declare class PresenceMeController {
    private presence;
    constructor(presence: PresenceService);
    setStatus(user: CurrentUserPayload, body: {
        status: ManualPresenceStatus | null;
    }): Promise<{
        presenceStatus: "online" | "away" | "busy" | "offline" | null;
        status: import("./presence.service").PresenceStatus;
    }>;
    /**
     * §G06 [06:42] — the words that go with the dot.
     *
     * Separate from the availability above because they are separate answers:
     * "busy" is whether to interrupt, "🕌 Namaz break, back in 30" is what is
     * happening. Sending both empty clears the status.
     */
    setCustomStatus(user: CurrentUserPayload, body: {
        emoji?: string | null;
        text?: string | null;
        expiresAt?: string | null;
    }): Promise<{
        status: {
            emoji: string | null;
            text: string | null;
            expiresAt: string | null;
        } | null;
    }>;
}
