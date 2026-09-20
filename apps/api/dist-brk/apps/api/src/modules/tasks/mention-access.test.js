"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const mention_access_1 = require("./mention-access");
/**
 * §V2-05 frame `04:00` — "Does not have access to task".
 *
 * These checks are written from the guard's four steps, in the guard's order:
 * workspace role, container privacy, list privacy, task privacy. A flag that
 * disagrees with the guard is worse than no flag — it either warns about people
 * who are fine (and gets ignored) or stays quiet about people who are not (and
 * the mention becomes an alert leading to a refusal).
 */
const OPEN = {
    spaceVisibility: 'public',
    projectId: 'p1',
    projectVisibility: 'public',
    listVisibility: 'public',
    listCreatedById: 'creator',
    taskVisibility: 'public',
    taskCreatedById: 'creator',
    spaceMemberIds: new Set(),
    spaceAdminIds: new Set(),
    projectMemberIds: new Set(),
    assigneeIds: new Set(),
};
const ctx = (over) => ({ ...OPEN, ...over });
const member = (userId) => ({ userId, workspaceRole: 'member' });
(0, node_test_1.test)('an ordinary member reaches an ordinary task', () => {
    strict_1.default.equal((0, mention_access_1.canReachTask)(OPEN, member('anyone')), true);
});
(0, node_test_1.test)('a manager reaches everything, private containers included', () => {
    // The guard's first line. A manager who was greyed out in the picker would be
    // a warning that is wrong about the people most likely to be mentioned.
    const locked = ctx({ spaceVisibility: 'private', taskVisibility: 'private' });
    for (const role of ['workspace_admin', 'manager', 'super_admin']) {
        strict_1.default.equal((0, mention_access_1.canReachTask)(locked, { userId: 'boss', workspaceRole: role }), true, role);
    }
});
(0, node_test_1.test)('a private space is a wall', () => {
    const locked = ctx({ spaceVisibility: 'private', spaceMemberIds: new Set(['inside']) });
    strict_1.default.equal((0, mention_access_1.canReachTask)(locked, member('inside')), true);
    strict_1.default.equal((0, mention_access_1.canReachTask)(locked, member('outside')), false);
});
(0, node_test_1.test)('a private project admits its members, and the owning space’s admins', () => {
    const locked = ctx({
        projectVisibility: 'private',
        projectMemberIds: new Set(['onproject']),
        spaceAdminIds: new Set(['spaceadmin']),
    });
    strict_1.default.equal((0, mention_access_1.canReachTask)(locked, member('onproject')), true);
    strict_1.default.equal((0, mention_access_1.canReachTask)(locked, member('spaceadmin')), true);
    strict_1.default.equal((0, mention_access_1.canReachTask)(locked, member('neither')), false);
});
(0, node_test_1.test)('a private project with no project id is not a wall', () => {
    // A list can sit directly under a space. Treating a null projectId as a
    // locked project would grey out everybody on a task nobody is locked out of.
    const odd = ctx({ projectId: null, projectVisibility: 'private' });
    strict_1.default.equal((0, mention_access_1.canReachTask)(odd, member('anyone')), true);
});
(0, node_test_1.test)('a private list is only for its creator', () => {
    const locked = ctx({ listVisibility: 'private', listCreatedById: 'owner' });
    strict_1.default.equal((0, mention_access_1.canReachTask)(locked, member('owner')), true);
    strict_1.default.equal((0, mention_access_1.canReachTask)(locked, member('somebody')), false);
});
(0, node_test_1.test)('a private task is for its creator and its assignees', () => {
    const locked = ctx({
        taskVisibility: 'private',
        taskCreatedById: 'author',
        assigneeIds: new Set(['doer']),
    });
    strict_1.default.equal((0, mention_access_1.canReachTask)(locked, member('author')), true);
    strict_1.default.equal((0, mention_access_1.canReachTask)(locked, member('doer')), true);
    strict_1.default.equal((0, mention_access_1.canReachTask)(locked, member('bystander')), false);
});
(0, node_test_1.test)('being assigned does not unlock a private container', () => {
    // The steps are ANDed, not ORed. An assignee outside a private space still
    // cannot open the task, so the picker must still warn about them — this is
    // the case where a cheap "is she an assignee?" shortcut would be wrong.
    const locked = ctx({
        spaceVisibility: 'private',
        spaceMemberIds: new Set(),
        assigneeIds: new Set(['doer']),
    });
    strict_1.default.equal((0, mention_access_1.canReachTask)(locked, member('doer')), false);
});
(0, node_test_1.test)('a member with no role recorded is treated as an ordinary member', () => {
    // Never as a manager. Guessing upward here would silence the warning for
    // exactly the people whose standing is unclear.
    const locked = ctx({ taskVisibility: 'private', taskCreatedById: 'author' });
    strict_1.default.equal((0, mention_access_1.canReachTask)(locked, { userId: 'unknown', workspaceRole: null }), false);
});
(0, node_test_1.test)('every restriction has to be lifted, not just the last one', () => {
    // Private space AND private task: being in the space is not enough, and
    // being the task's author is not enough.
    const both = ctx({
        spaceVisibility: 'private',
        spaceMemberIds: new Set(['inside']),
        taskVisibility: 'private',
        taskCreatedById: 'inside',
    });
    strict_1.default.equal((0, mention_access_1.canReachTask)(both, member('inside')), true);
    const authorOutside = ctx({
        spaceVisibility: 'private',
        spaceMemberIds: new Set(),
        taskVisibility: 'private',
        taskCreatedById: 'author',
    });
    strict_1.default.equal((0, mention_access_1.canReachTask)(authorOutside, member('author')), false);
});
//# sourceMappingURL=mention-access.test.js.map