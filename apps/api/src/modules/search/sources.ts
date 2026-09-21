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

import { DRIVE_SEARCH_SCOPE } from './drive-scope'

/** The sources search can be scoped to. `rundesk` is everything we hold. */
export const SEARCH_SOURCES = ['rundesk', 'google-drive', 'gmail', 'sharepoint'] as const
export type SearchSource = (typeof SEARCH_SOURCES)[number]

/**
 * Which OAuth connection backs each federated source.
 *
 * `rundesk` has none — it is our own data and always available. Each of the
 * other three names a provider `IntegrationConnectionsService` can actually
 * hold a token for, and **that is now a requirement of this table rather than
 * an aspiration**, which is the defect this row was opened over:
 *
 *   - `gmail` named a provider that existed nowhere. `listSupportedProviders()`
 *     had never heard of it, so the tab could never report itself connected,
 *     the "Connect" link beside it led to a page with no Gmail tile, and the
 *     tab was a promise nothing in the product could keep.
 *   - `sharepoint` BORROWED the OneDrive credential, which was worse. OneDrive
 *     *is* connectable, so a workspace with OneDrive linked saw the SharePoint
 *     tab report **connected** — over a credential no code path could query,
 *     and with no "not connected" notice to explain the empty list. A confident
 *     zero with nothing on screen to contradict it.
 *
 * Both now have their own provider and their own query path. SharePoint keeps
 * the Microsoft *client* (one app registration) but not OneDrive's *grant*:
 * `Files.ReadWrite` cannot answer a site-wide search, so sharing the row would
 * have meant sharing a consent that does not cover the question.
 */
export const SOURCE_PROVIDER: Record<SearchSource, string | null> = {
  rundesk: null,
  'google-drive': 'google-drive',
  gmail: 'gmail',
  sharepoint: 'sharepoint',
}

/** Read every email in the account — what "search all your emails" requires. */
export const GMAIL_SEARCH_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
/**
 * Microsoft Graph's site-wide read. `Files.ReadWrite` — what the OneDrive grant
 * carries — reaches the signed-in user's own drive and no SharePoint site, so a
 * SharePoint search issued against it returns nothing and says nothing.
 */
export const SHAREPOINT_SEARCH_SCOPE = 'Sites.Read.All'

/**
 * The one OAuth scope each source's query needs, and the reason this table
 * exists at all.
 *
 * A credential can be live and still be unable to answer: `drive.file` grants
 * see only files this app created, `Files.ReadWrite` sees no SharePoint site.
 * Drive already knew this and skipped the round trip — but `listSources` did
 * not, so the tab reported **connected** and the search returned `[]`. Stating
 * the requirement once, here, is what lets one predicate serve both.
 */
export const SOURCE_SCOPE: Record<SearchSource, string | null> = {
  rundesk: null,
  'google-drive': DRIVE_SEARCH_SCOPE,
  gmail: GMAIL_SEARCH_SCOPE,
  sharepoint: SHAREPOINT_SEARCH_SCOPE,
}

/**
 * Can this stored grant answer this source's query?
 *
 * `rundesk` needs no grant. Everything else needs the exact scope above — a
 * connection that lacks it is reported as NOT connected, because "connected but
 * permanently empty" is the confident zero this whole row is about.
 */
export function grantCoversSource(
  source: SearchSource,
  scopes: readonly string[] | null | undefined,
): boolean {
  const required = SOURCE_SCOPE[source]
  if (required === null) return true
  return (scopes ?? []).includes(required)
}

/** Whether a value names a source, for whitelisting a query parameter. */
export function isSearchSource(value: unknown): value is SearchSource {
  return typeof value === 'string' && (SEARCH_SOURCES as readonly string[]).includes(value)
}

/**
 * The entity types each source produces.
 *
 * Scoping to a source is expressed as a type filter, so one mechanism decides
 * what comes back rather than two that can disagree. `rundesk` is "everything
 * except the federated ones" — written as an exclusion so a new internal type
 * joins it automatically and cannot be forgotten here.
 *
 * **This table was written and then read by nothing**, and that cost a wrong
 * answer rather than a missing one. `ENTITY_TYPES` — the controller's
 * whitelist for `?types=` — listed `drive` by hand and had never been told
 * about `gmail` or `sharepoint`. A whitelist drops what it does not recognise,
 * and `filters.types` is only set when something survives, so choosing the
 * Gmail tab sent `types=gmail`, had it discarded, and ran an **unfiltered
 * Rundesk search** whose tasks and docs were then presented as the contents of
 * your inbox. `entity-types.ts` now derives the federated names from here, so
 * a source cannot exist without the controller accepting its type.
 */
export const FEDERATED_ENTITY_TYPES: Record<Exclude<SearchSource, 'rundesk'>, string> = {
  'google-drive': 'drive',
  gmail: 'gmail',
  sharepoint: 'sharepoint',
}
