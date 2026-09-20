"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENTITY_TYPES = void 0;
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
exports.ENTITY_TYPES = [
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
    // §4 [04:20] — files from the workspace's linked Google Drive.
    'drive',
    /*
     * §G14-15 — meeting notes.
     *
     * A meeting you can read on its own page could not be found from anywhere
     * else: the notes are often the only written record of a decision, and they
     * were the one kind of workspace content search could not see.
     */
    'meeting',
];
//# sourceMappingURL=entity-types.js.map