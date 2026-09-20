"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.FEDERATED_ENTITY_TYPES = exports.SOURCE_PROVIDER = exports.SEARCH_SOURCES = void 0;
exports.isSearchSource = isSearchSource;
/** The sources search can be scoped to. `rundesk` is everything we hold. */
exports.SEARCH_SOURCES = ['rundesk', 'google-drive', 'gmail', 'sharepoint'];
/**
 * Which OAuth connection backs each federated source.
 *
 * `rundesk` has none — it is our own data and always available. The other three
 * map onto providers the connections service already knows how to hold tokens
 * for, so this is a naming table rather than a new integration surface:
 * SharePoint is reached through the same Microsoft Graph credential as
 * OneDrive, which is why it borrows that provider rather than inventing one.
 */
exports.SOURCE_PROVIDER = {
    rundesk: null,
    'google-drive': 'google-drive',
    gmail: 'gmail',
    sharepoint: 'onedrive',
};
/** Whether a value names a source, for whitelisting a query parameter. */
function isSearchSource(value) {
    return typeof value === 'string' && exports.SEARCH_SOURCES.includes(value);
}
/**
 * The entity types each source produces.
 *
 * Scoping to a source is expressed as a type filter, so one mechanism decides
 * what comes back rather than two that can disagree. `rundesk` is "everything
 * except the federated ones" — written as an exclusion so a new internal type
 * joins it automatically and cannot be forgotten here.
 */
exports.FEDERATED_ENTITY_TYPES = {
    'google-drive': 'drive',
    gmail: 'gmail',
    sharepoint: 'sharepoint',
};
//# sourceMappingURL=sources.js.map