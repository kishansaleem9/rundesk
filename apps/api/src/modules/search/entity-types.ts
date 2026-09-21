import type { SearchEntityType } from './search.service'
import { FEDERATED_ENTITY_TYPES } from './sources'

/**
 * Every entity type the `types` query parameter will accept.
 *
 * Lives apart from the controller so a test can hold it against
 * `SearchEntityType` without constructing a Nest controller. The two drifting
 * is a silent failure, not a loud one: a name the service can return but this
 * list rejects gets dropped from the filter, and the search then runs
 * *unfiltered* — indistinguishable from "the filter did nothing", which is
 * exactly how the §1.1 task-type filter went missing in transit.
 */
export const ENTITY_TYPES: SearchEntityType[] = [
  'task',
  'doc',
  'file',
  'user',
  'comment',
  'channel',
  'message',
  // §2 [02:03] — "let's suppose ke mujhe FOLDERS mein search karna hai, to
  // folders yahan pe appear ho jayega."
  'folder',
  'list',
  'space',
  /*
   * §G14-15 — meeting notes.
   *
   * A meeting you can read on its own page could not be found from anywhere
   * else: the notes are often the only written record of a decision, and they
   * were the one kind of workspace content search could not see.
   */
  'meeting',
  /*
   * §V2-11 `19:07` — the federated types, DERIVED rather than listed.
   *
   * `drive` used to be written out here by hand and `gmail` / `sharepoint`
   * were simply absent, which is the drift this file's own header warns
   * about. It did not read as a missing filter: the whitelist discards an
   * unrecognised name, `filters.types` is only assigned when something
   * survives the filter, and an assignment that never happens is an
   * UNFILTERED search. So picking the Gmail tab returned your Rundesk tasks
   * and labelled them Gmail — a wrong answer, not an empty one.
   *
   * Spread from `FEDERATED_ENTITY_TYPES` so a source added there is accepted
   * here in the same commit or not at all.
   */
  ...(Object.values(FEDERATED_ENTITY_TYPES) as SearchEntityType[]),
]
