"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const notifications_service_1 = require("./notifications.service");
/**
 * §2.2 — which notification types the Primary chip shows.
 *
 * > "Primary pe yeh setting ka option hai; is par main click karti hoon to yeh
 * >  mujh se poochta hai ke mujhe kya cheezein show karwani hain … Phir aap ko
 * >  Primary mein sirf wohi notifications show honge jo aap chahte hain."
 *
 * Primary was a hardcoded set of six types. That is a defensible default and
 * not what she asked for — she spent a minute on the customiser and named ten
 * kinds she would turn on or off.
 *
 * This lands in a jsonb column straight from the client, so the interesting
 * cases are the malformed ones. Two are genuinely ambiguous and worth pinning
 * rather than leaving to whoever edits this next:
 *
 *   []            — a real choice. "Show me nothing in Primary" is a thing a
 *                   person can mean, and silently replacing it with the default
 *                   would override them.
 *   ['nonsense']  — not a choice. Storing it would leave Primary permanently
 *                   empty with no way to tell from the UI why.
 */
/** Walk up to the workspace root: this compiles to CJS, so no import.meta. */
function workspaceRoot(from) {
    let dir = from;
    for (;;) {
        if ((0, node_fs_1.existsSync)((0, node_path_1.join)(dir, 'pnpm-workspace.yaml')))
            return dir;
        const up = (0, node_path_1.dirname)(dir);
        if (up === dir)
            throw new Error('workspace root not found');
        dir = up;
    }
}
function fakeDb(saved) {
    const writes = [];
    const rows = [{ notificationPreferences: saved }];
    const thenable = () => ({
        from: () => thenable(),
        where: () => thenable(),
        limit: async () => rows,
        then: (res) => Promise.resolve(rows).then(res),
    });
    return {
        writes,
        db: {
            select: () => thenable(),
            update: () => ({
                set: (values) => {
                    writes.push(values.notificationPreferences);
                    return {
                        where: () => ({
                            returning: async () => [{ notificationPreferences: values.notificationPreferences }],
                        }),
                    };
                },
            }),
        },
    };
}
const service = (saved) => {
    const { db, writes } = fakeDb(saved);
    const config = { get: () => undefined };
    return {
        svc: new notifications_service_1.NotificationsService(db, {}, {}, config),
        writes,
    };
};
const primaryOf = (written) => written?.primaryTypes;
(0, node_test_1.describe)('Primary is what you chose (§2.2)', () => {
    (0, node_test_1.it)('stores the set a member picks', async () => {
        const { svc, writes } = service();
        await svc.updatePreferences('u1', { primaryTypes: ['task_mentioned', 'task_overdue'] });
        strict_1.default.deepEqual(primaryOf(writes[0]), ['task_mentioned', 'task_overdue']);
    });
    (0, node_test_1.it)('keeps an empty choice, because "nothing here" is a choice', async () => {
        const { svc, writes } = service();
        await svc.updatePreferences('u1', { primaryTypes: [] });
        strict_1.default.deepEqual(primaryOf(writes[0]), []);
    });
    (0, node_test_1.it)('drops types the customiser does not offer', async () => {
        const { svc, writes } = service();
        await svc.updatePreferences('u1', {
            primaryTypes: ['task_mentioned', 'not_a_type'],
        });
        strict_1.default.deepEqual(primaryOf(writes[0]), ['task_mentioned']);
    });
    (0, node_test_1.it)('falls back to the default when every value is junk', async () => {
        // Distinct from [] above: this is a malformed request, not a request for an
        // empty Primary, and storing it would leave the tab silently empty.
        const { svc, writes } = service();
        await svc.updatePreferences('u1', { primaryTypes: ['nonsense', 'also_nonsense'] });
        strict_1.default.deepEqual(primaryOf(writes[0]), notifications_service_1.DEFAULT_PRIMARY_TYPES);
    });
    (0, node_test_1.it)('de-duplicates', async () => {
        const { svc, writes } = service();
        await svc.updatePreferences('u1', {
            primaryTypes: ['chat_message', 'chat_message', 'chat_message'],
        });
        strict_1.default.deepEqual(primaryOf(writes[0]), ['chat_message']);
    });
    (0, node_test_1.it)('leaves an existing choice alone when the patch is about something else', async () => {
        // The profile page patches reminderLeadDays on its own; that must not reset
        // a Primary someone customised.
        const { svc, writes } = service({ primaryTypes: ['task_overdue'] });
        await svc.updatePreferences('u1', { reminderLeadDays: [1] });
        strict_1.default.deepEqual(primaryOf(writes[0]), ['task_overdue']);
    });
    (0, node_test_1.it)('defaults an account that has never opened the customiser', async () => {
        const { svc, writes } = service({});
        await svc.updatePreferences('u1', { reminderLeadDays: [1] });
        strict_1.default.deepEqual(primaryOf(writes[0]), notifications_service_1.DEFAULT_PRIMARY_TYPES);
    });
    (0, node_test_1.it)('offers every kind she named that the API can emit', () => {
        for (const type of notifications_service_1.DEFAULT_PRIMARY_TYPES) {
            strict_1.default.ok(notifications_service_1.PRIMARY_SELECTABLE_TYPES.includes(type), `${type} is a default but not selectable, so it could never be turned back on`);
        }
    });
    (0, node_test_1.describe)('the kinds she named that had no type at all', () => {
        // The customiser can only offer what the API can emit, so five of the ten
        // kinds she went through were unofferable however good the picker was.
        const named = [
            'task_unassigned',
            'task_follower_changed',
            'message_reaction',
            'shared_with_me',
            'access_requested',
        ];
        (0, node_test_1.it)('are all selectable now', () => {
            for (const type of named) {
                strict_1.default.ok(notifications_service_1.PRIMARY_SELECTABLE_TYPES.includes(type), `${type} is not offered by the customiser`);
            }
        });
        (0, node_test_1.it)('default to on for the three she asked to see', () => {
            // "kisi ne mera hi task kisi aur ko de diya aur mujhe REMOVE kar diya to
            // mujhe woh cheez show ho" / "FOLLOWER CHANGE" / "agar ACCESS REQUEST …
            // to mujhe show ho".
            for (const type of ['task_unassigned', 'task_follower_changed', 'access_requested']) {
                strict_1.default.ok(notifications_service_1.DEFAULT_PRIMARY_TYPES.includes(type), `${type} should start on`);
            }
        });
        (0, node_test_1.it)('default to off for the two she asked not to see', () => {
            // "Ab neeche se REACTIONS mujhe na show hon, [shared with] mujhe na show ho."
            for (const type of ['message_reaction', 'shared_with_me']) {
                strict_1.default.ok(!notifications_service_1.DEFAULT_PRIMARY_TYPES.includes(type), `${type} should start off`);
            }
        });
        (0, node_test_1.it)('can still be turned on, since off by default is not the same as absent', () => {
            const { svc } = service();
            return svc
                .updatePreferences('u1', { primaryTypes: ['message_reaction', 'shared_with_me'] })
                .then(() => strict_1.default.ok(true));
        });
    });
});
/**
 * §2.2 — the emitters, checked at the source.
 *
 * A type with no emitter is a checkbox that governs nothing, and an emitter
 * that cannot see who acted tells people about their own clicks. The second is
 * exactly what shipped first: `addWatcher` grew an `actorId` parameter and its
 * only caller did not pass one, so the "leave the actor out" filter never once
 * applied. Nothing failed — the notification simply went to the wrong set.
 *
 * TasksService needs ten collaborators to construct, so these read the source.
 * That is the weaker claim and is labelled as one rather than dressed up as
 * behaviour.
 */
(0, node_test_1.describe)('the emitters exist and know who acted (source-level, §2.2)', () => {
    const read = (rel) => (0, node_fs_1.readFileSync)((0, node_path_1.join)(workspaceRoot(process.cwd()), rel), 'utf8');
    const tasksService = read('apps/api/src/modules/tasks/tasks.service.ts');
    const tasksController = read('apps/api/src/modules/tasks/tasks.controller.ts');
    const chatService = read('apps/api/src/modules/chat/chat.service.ts');
    const sharesService = read('apps/api/src/modules/shares/shares.service.ts');
    const integrations = read('apps/api/src/modules/integrations/connections/integration-connections.service.ts');
    (0, node_test_1.it)('being taken off a task tells the person it happened to', () => {
        strict_1.default.match(tasksService, /type: 'task_unassigned'/);
        // …and not when you took yourself off.
        strict_1.default.match(tasksService, /userId !== actorId/);
    });
    (0, node_test_1.it)('a follower change tells the task, and the endpoint says who did it', () => {
        strict_1.default.match(tasksService, /type: 'task_follower_changed'/);
        strict_1.default.match(tasksController, /addWatcher\(taskId, body\.userId, user\.id\)/, 'without the actor the exclusion below can never fire');
        strict_1.default.match(tasksController, /removeWatcher\(taskId, userId, user\.id\)/);
        strict_1.default.match(tasksService, /recipients\.delete\(actorId\)/);
    });
    (0, node_test_1.it)('a reaction tells the author, and never for your own message', () => {
        strict_1.default.match(chatService, /type: 'message_reaction'/);
        strict_1.default.match(chatService, /message\.authorId !== userId/);
    });
    (0, node_test_1.it)('a share tells an existing member, not an invited address', () => {
        strict_1.default.match(sharesService, /type: 'shared_with_me'/);
        strict_1.default.match(sharesService, /userId && userId !== actor\.id/);
    });
    (0, node_test_1.it)('an access request tells the admins who can grant it', () => {
        strict_1.default.match(integrations, /type: 'access_requested'/);
        strict_1.default.match(integrations, /'workspace_admin', 'super_admin'/);
    });
    /**
     * §11 [13:33] — "Follower ke liye main is par click karoongi to abhi main aap
     * ko add karoongi, aur even to maine aap ko task assign bhi nahi kiya."
     *
     * The endpoint and its notification are covered above. What this adds is the
     * other half of her sentence: the panel must add the person you *picked*, and
     * adding a follower must not assign them. Both are one identifier apart from
     * being wrong — posting `currentUser.id` instead of the selection would look
     * identical on screen until someone else failed to get the notification.
     *
     * Source-level, and weaker for it: the list route this panel lives on needs a
     * large amount of stubbing to render, so a browser test here would have been
     * testing that scaffolding rather than this behaviour.
     */
    (0, node_test_1.it)('the follower panel adds the person picked, and assigns nobody (§11)', () => {
        const sheet = read('apps/web/src/components/task-detail-sheet.tsx');
        // Bounded by the next top-level declaration, not by the first line-start
        // brace: an earlier version stopped short of the Add button and failed on a
        // string that was there all along.
        const start = sheet.indexOf('function WatchersPanel(');
        const rest = start === -1 ? '' : sheet.slice(start + 1);
        const next = rest.search(/\n(function|export|const [A-Z])/);
        const panel = start === -1 ? '' : rest.slice(0, next === -1 ? undefined : next);
        strict_1.default.ok(panel, 'could not find WatchersPanel');
        // Adding posts the selected id, not the caller's.
        strict_1.default.match(panel, /addWatcher\.mutate\(selectedUserId\)/, 'the Add button does not send the selection');
        // The chain, in two links: the button hands `selectedUserId` to the
        // mutation, and the mutation forwards its parameter as `userId`. Written
        // against the shorthand the code actually uses — an earlier version of this
        // assertion guessed `userId: selectedUserId` and failed on correct code.
        strict_1.default.match(panel, /mutationFn: \(userId: string\)[\s\S]{0,200}?JSON\.stringify\(\{ userId \}\)/, 'the add request does not forward the id it was given');
        // Only people who are not already following are offered — otherwise the
        // list quietly grows duplicates that read as a bug.
        strict_1.default.match(panel, /!watcherIds\.has\(m\.userId\)/, 'already-following members are still offered');
        /*
         * And it never *writes* an assignment — that is the whole point of a
         * follower. Stated as "every request this panel makes goes to /watchers"
         * rather than "the word assignee never appears": the panel legitimately
         * reads assigneeIds to explain why you are already following a task you
         * were assigned, and an earlier version of this check condemned that.
         */
        const requests = [...panel.matchAll(/api\(`([^`]+)`/g)].map((m) => m[1]);
        strict_1.default.ok(requests.length > 0, 'no requests found in the panel');
        for (const url of requests) {
            strict_1.default.match(url, /\/watchers/, `the follower panel calls ${url} — adding a follower must not assign anyone`);
        }
    });
    (0, node_test_1.it)('the bell she described is the way in (§11)', () => {
        const sheet = read('apps/web/src/components/task-detail-sheet.tsx');
        // "let's suppose yeh dekh rahe hain aap — BELL ICON yeh hai" [13:29].
        strict_1.default.match(sheet, /data-testid="task-followers-open"[\s\S]{0,400}?<Bell/, 'the followers control is not a bell');
    });
});
//# sourceMappingURL=primary-types.test.js.map