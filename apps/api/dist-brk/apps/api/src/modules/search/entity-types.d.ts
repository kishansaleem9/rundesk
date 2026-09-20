import type { SearchEntityType } from './search.service';
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
export declare const ENTITY_TYPES: SearchEntityType[];
