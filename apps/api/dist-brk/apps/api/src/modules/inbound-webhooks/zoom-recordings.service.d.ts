import type { Db } from '@rundesk/db';
export interface RecordingAttachSummary {
    ok: boolean;
    meetingId: string | null;
    meetingLinks: number;
    attached: number;
    skippedExisting: number;
    skippedNoConnection: number;
    skippedNoRecording: number;
}
/**
 * §12.9 — after a Zoom meeting ends, fetch its cloud recording and attach the
 * share URL to the task(s) the meeting was created for, as a
 * `task_external_links` row (kind:'recording').
 *
 * Triggered by the `recording.completed` inbound webhook (see the controller).
 * Env-gated on the *Zoom connection*: recordings are only fetched when the
 * meeting link's workspace has Zoom connected. Idempotent: a recording already
 * attached for a meeting is never attached twice.
 */
export declare class ZoomRecordingsService {
    private readonly db;
    private readonly logger;
    constructor(db: Db);
    /** Entry point for the `recording.completed` webhook payload. */
    handleRecordingCompleted(payload: unknown): Promise<RecordingAttachSummary>;
    /**
     * Given a Zoom meeting id, find every task meeting-link created for it, fetch
     * the recording via the Zoom API, and attach a kind:'recording' link. Handles
     * the (rare) case where the same meeting is linked from multiple tasks.
     */
    attachRecordingForMeeting(meetingId: string): Promise<RecordingAttachSummary>;
    /**
     * Fetch + parse the recording for a meeting using the workspace's Zoom
     * connection. Returns null when Zoom isn't connected, the API call fails, or
     * there's no usable recording yet.
     */
    private fetchRecording;
    private loadZoomConnection;
    /**
     * Return a usable Zoom access token, refreshing via the refresh_token grant
     * (HTTP Basic client auth, per Zoom) when the stored token is expired/near
     * expiry. A refresh failure falls back to the stored token so a flaky refresh
     * doesn't block the attach — mirrors TasksService.ensureMeetingToken.
     */
    private ensureZoomToken;
}
