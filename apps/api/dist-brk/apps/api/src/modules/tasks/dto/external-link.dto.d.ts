declare const PROVIDERS: readonly ["github", "gitlab", "google_drive", "dropbox", "link"];
/**
 * Create a task ↔ external-service link (Plan §12.8 / §12.2). Only `url` is
 * required — the server parses it to detect provider + kind. `provider` is an
 * optional hint that disambiguates a generic link (e.g. an explicit
 * `google_drive` attach). `commentId` (§12.6) optionally scopes the link to a
 * specific comment on the task (e.g. a Dropbox file shared in a comment);
 * omitted → a task-level link, exactly as before.
 */
export declare class CreateExternalLinkDto {
    url: string;
    provider?: (typeof PROVIDERS)[number];
    commentId?: string;
}
export {};
