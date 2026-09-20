/**
 * Zoom cloud-recording response parsing for the "auto-attach meeting recording
 * link after the meeting ends" gap (Plan §12.9).
 *
 * Pure + side-effect free so the extraction logic is unit-testable without a
 * live Zoom API. The service calls `GET /meetings/{meetingId}/recordings` (or
 * receives the equivalent `recording.completed` webhook `payload.object`) and
 * feeds the JSON here to pull out the share URL to persist.
 */
/** Shape of the pieces we read from a Zoom recordings response / webhook object. */
export interface ZoomRecordingsResponse {
    id?: number | string;
    uuid?: string;
    topic?: string;
    share_url?: string;
    password?: string;
    total_size?: number;
    recording_count?: number;
    recording_files?: Array<{
        id?: string;
        file_type?: string;
        file_extension?: string;
        recording_type?: string;
        play_url?: string;
        download_url?: string;
        status?: string;
    }>;
}
export interface ExtractedRecording {
    /** The best "share" URL to store on the task link. */
    shareUrl: string;
    /** The video file's play URL, when present (a nicer in-browser view). */
    playUrl: string | null;
    downloadUrl: string | null;
    topic: string | null;
    recordingCount: number | null;
    totalSize: number | null;
}
/**
 * Pull the recording share URL (and useful metadata) out of a Zoom recordings
 * response. Preference order for the primary URL:
 *   1. top-level `share_url` (the shareable landing page for all files),
 *   2. the first completed video file's `play_url`,
 *   3. any file's `play_url` / `download_url`.
 * Returns null when there is nothing usable to attach (degrade cleanly — the
 * caller then simply skips, leaving the meeting link untouched for a retry).
 */
export declare function extractZoomRecordingUrl(body: ZoomRecordingsResponse | null | undefined): ExtractedRecording | null;
/**
 * Resolve the Zoom meeting id from a `recording.completed` webhook payload.
 * Zoom nests the meeting object under `payload.object`; `id` is the numeric
 * meeting id that matches the `external_id` we stored when creating the meeting.
 */
export declare function extractMeetingIdFromWebhook(payload: unknown): string | null;
