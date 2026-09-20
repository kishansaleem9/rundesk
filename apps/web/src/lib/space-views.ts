import type { TranslationKey } from './i18n'

/**
 * §V2-06 — the space's view vocabulary, in ONE place.
 *
 * Frame `07:12` is "Default settings for views → Required views", and it draws
 * eleven rows: List *(Required, Default)*, Board, Calendar, Map, Activity,
 * Team, Gantt, Mind Map, Table, Timeline, Workload. Rundesk renders six of
 * them. Which six is not the interesting part of this file; that the six are
 * written down ONCE is.
 *
 * WHY THIS MODULE EXISTS: the duplicated-list defect, fifth instance.
 *
 * The set of view keys was written out in four places, and two had drifted:
 *
 *   1. `apps/api/.../space-presets.ts` `SPACE_VIEW_KEYS` — the server's, and
 *      the one the wizard is SERVED (`GET /space-presets`).
 *   2. `routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx` `ALL_VIEWS` —
 *      the list route's own copy, which filters the view tabs. Its own comment
 *      already names it as a duplicated list.
 *   3. `components/create-space-wizard.tsx` `VIEW_LABEL` — **missing `team`**,
 *      so the Team row fell through `?? 'list.viewList'` and rendered the word
 *      "List". The wizard showed two rows both labelled List, and every check
 *      of the form "the row has a label" passed on it.
 *   4. `components/space-views-dialog.tsx` `VIEWS` — **also missing `team`**,
 *      so a space whose views are saved from its own settings dialog silently
 *      loses Team View.
 *
 * The fix is not "add team to the maps". It is to make the map EXHAUSTIVE BY
 * TYPE: `Record<SpaceViewKey, TranslationKey>` does not compile with a key
 * missing, and does not compile with a key that is not a view either. The bug
 * class cannot come back through this module without a compiler error.
 *
 * (2) and (4) still hold their own copies — they are owned elsewhere and are
 * being changed by other work in flight. They should import `SPACE_VIEW_KEYS`
 * and `viewLabelKey` from here; until they do, (4) in particular is a live
 * defect and is reported as one.
 */

/**
 * The views a Rundesk list can actually RENDER. Mirrors the server's
 * `SPACE_VIEW_KEYS`, which is what the wizard is served and what
 * `normalizeViewConfig` will accept into `spaces.view_config`.
 *
 * Deliberately NOT the frame's eleven. A view that can be ticked in the wizard
 * and that no surface draws is the mirror defect — a stored value no reader
 * honours — and it is worse than an absent tick-box, because the database then
 * holds evidence for a view that does not exist. The five Rundesk does not
 * have (Map, Activity, Mind Map, Timeline, Workload) are not offered.
 */
export const SPACE_VIEW_KEYS = ['list', 'board', 'table', 'calendar', 'gantt', 'team'] as const
export type SpaceViewKey = (typeof SPACE_VIEW_KEYS)[number]

/**
 * One label per view, and the type is the point: omit `team` and this file does
 * not compile.
 *
 * The strings are the ones the list route's own view tabs use, so the name in
 * the wizard and the name on the tab a person lands on are the same word.
 */
export const SPACE_VIEW_LABEL: Record<SpaceViewKey, TranslationKey> = {
  list: 'list.viewList',
  board: 'list.viewBoard',
  table: 'list.viewTable',
  calendar: 'list.viewCalendar',
  gantt: 'list.viewGantt',
  team: 'list.viewTeam',
}

export function isSpaceViewKey(value: string): value is SpaceViewKey {
  return (SPACE_VIEW_KEYS as readonly string[]).includes(value)
}

/**
 * The translation key for a view, or `null` for one this build does not know.
 *
 * `null` rather than a fallback key, and that is the whole lesson of the `team`
 * defect: falling back to a SIBLING's string ("list.viewList") produced a row
 * that looked labelled and was labelled wrongly. A caller getting `null` should
 * render the raw key, which is ugly, visible, and impossible to mistake for a
 * working row — a new server-side view arrives untranslated instead of arriving
 * disguised as another one.
 */
export function viewLabelKey(view: string): TranslationKey | null {
  return isSpaceViewKey(view) ? SPACE_VIEW_LABEL[view] : null
}
