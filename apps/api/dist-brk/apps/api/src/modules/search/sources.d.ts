/**
 * §G02-9 [01:12] — the tab strip under the query: "All | ClickUp | Google Drive
 * | Gmail | SharePoint | Apps".
 *
 * On screen in every search frame of the section, and we had no concept of a
 * SOURCE at all: search meant our own index and nothing else, so there was
 * nothing to scope to and nothing to say when a source was not connected.
 *
 * The important half is that last one. Drive federation already existed and
 * returned `[]` when the workspace had no connection — which reads to a person
 * as "you have no matching files in Drive", and that is false. A source you
 * have not connected must SAY so, with the way to connect it; silence is a
 * wrong answer wearing the clothes of a right one.
 */
/** The sources search can be scoped to. `rundesk` is everything we hold. */
export declare const SEARCH_SOURCES: readonly ["rundesk", "google-drive", "gmail", "sharepoint"];
export type SearchSource = (typeof SEARCH_SOURCES)[number];
/**
 * Which OAuth connection backs each federated source.
 *
 * `rundesk` has none — it is our own data and always available. The other three
 * map onto providers the connections service already knows how to hold tokens
 * for, so this is a naming table rather than a new integration surface:
 * SharePoint is reached through the same Microsoft Graph credential as
 * OneDrive, which is why it borrows that provider rather than inventing one.
 */
export declare const SOURCE_PROVIDER: Record<SearchSource, string | null>;
/** Whether a value names a source, for whitelisting a query parameter. */
export declare function isSearchSource(value: unknown): value is SearchSource;
/**
 * The entity types each source produces.
 *
 * Scoping to a source is expressed as a type filter, so one mechanism decides
 * what comes back rather than two that can disagree. `rundesk` is "everything
 * except the federated ones" — written as an exclusion so a new internal type
 * joins it automatically and cannot be forgotten here.
 */
export declare const FEDERATED_ENTITY_TYPES: Record<Exclude<SearchSource, 'rundesk'>, string>;
