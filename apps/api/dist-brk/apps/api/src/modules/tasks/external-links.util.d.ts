/**
 * URL parsing / kind-detection for task ↔ external-service links
 * (Plan §12.8 GitHub/GitLab, §12.2 Google Drive).
 *
 * Pure + side-effect free so it is unit-testable in isolation from the DB and
 * from any live provider API. The service persists the result; the (env-gated)
 * provider fetch reads the structured `ref` back out of `metadata` to call the
 * right endpoint.
 */
export type ExternalLinkProvider = 'github' | 'gitlab' | 'google_drive' | 'dropbox' | 'zoom' | 'google_meet' | 'link';
export type ExternalLinkKind = 'commit' | 'pull_request' | 'issue' | 'file' | 'meeting' | 'link';
export declare const EXTERNAL_LINK_PROVIDERS: readonly ExternalLinkProvider[];
/** Structured refs the live provider fetch needs to build API URLs. */
export interface ExternalLinkRef {
    owner?: string;
    repo?: string;
    number?: string;
    sha?: string;
    projectPath?: string;
    host?: string;
    fileId?: string;
    /** Full share URL for a Dropbox link — needed for the metadata lookup. */
    sharedUrl?: string;
}
export interface ParsedExternalLink {
    provider: ExternalLinkProvider;
    kind: ExternalLinkKind;
    externalId: string | null;
    title: string | null;
    ref: ExternalLinkRef;
}
/** True for a syntactically valid http(s) URL. */
export declare function isHttpUrl(raw: string): boolean;
/**
 * Detect provider/kind/externalId from a pasted URL. `providerHint` (the
 * request's optional `provider`) only disambiguates the generic-`link` case —
 * a recognised URL is always authoritative.
 */
export declare function parseExternalLinkUrl(rawUrl: string, providerHint?: string): ParsedExternalLink;
