/**
 * Create a meeting from a task (Plan §12.9 Zoom / Google Meet). The provider
 * is required — the server creates a real meeting through the workspace's
 * connected Zoom (own OAuth connection) or Google Meet (reuses the Google
 * Calendar connection) and stores the join URL as a task↔external link.
 */
declare const MEETING_PROVIDERS: readonly ["zoom", "google_meet"];
export declare class CreateMeetingDto {
    provider: (typeof MEETING_PROVIDERS)[number];
}
/** Attach a post-meeting recording link to an existing meeting link. */
export declare class AttachRecordingDto {
    url: string;
}
export {};
