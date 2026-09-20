"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const users_service_1 = require("./users.service");
/**
 * §1.5 — "yeh option jo hai woh humare members ke paas hona chahiye … Lekin
 * humare paas NAV BAR ko set down karne ka option nahi hai."
 *
 * topbarHidden is a jsonb column whose value comes straight from the client,
 * so the two things worth pinning are what it accepts and what it refuses.
 * updateProfile already carries a comment about a mass-assignment bug found here
 * once — an unvalidated array on a jsonb column is a place to park arbitrary
 * data on your own user row, and the column is read back on every page load.
 */
function fakeDb(onSet) {
    return {
        update: () => ({
            set: (values) => {
                onSet(values);
                return {
                    where: () => ({
                        returning: async () => [
                            { id: 'u1', email: 'a@b.c', displayName: 'A', passwordHash: 'secret', ...values },
                        ],
                    }),
                };
            },
        }),
    };
}
const service = () => {
    const writes = [];
    const svc = new users_service_1.UsersService(fakeDb((v) => writes.push(v)), {});
    return { svc, writes };
};
(0, node_test_1.describe)('top bar preferences (§1.5)', () => {
    (0, node_test_1.it)('stores the items a member puts away', async () => {
        const { svc, writes } = service();
        await svc.updateProfile('u1', { topbarHidden: ['notifications', 'timer'] });
        strict_1.default.deepEqual(writes[0].topbarHidden, ['notifications', 'timer']);
    });
    (0, node_test_1.it)('lets a member put the bell back', async () => {
        const { svc, writes } = service();
        await svc.updateProfile('u1', { topbarHidden: [] });
        strict_1.default.deepEqual(writes[0].topbarHidden, [], 'an empty set means everything is shown');
    });
    (0, node_test_1.it)('refuses an item the top bar does not have', async () => {
        const { svc } = service();
        await strict_1.default.rejects(() => svc.updateProfile('u1', { topbarHidden: ['notifications', 'not-a-control'] }), /Unknown top bar item/);
    });
    (0, node_test_1.it)('refuses a non-array, which is what a jsonb column would otherwise swallow', async () => {
        const { svc } = service();
        await strict_1.default.rejects(() => svc.updateProfile('u1', { topbarHidden: { evil: true } }), /must be an array/);
    });
    (0, node_test_1.it)('de-duplicates, so the stored value is a set and not a log of clicks', async () => {
        const { svc, writes } = service();
        await svc.updateProfile('u1', { topbarHidden: ['theme', 'theme', 'theme'] });
        strict_1.default.deepEqual(writes[0].topbarHidden, ['theme']);
    });
    (0, node_test_1.it)('does not let this field become a way to write other columns', async () => {
        const { svc, writes } = service();
        await svc.updateProfile('u1', {
            topbarHidden: ['theme'],
            role: 'super_admin',
            passwordHash: 'x',
        });
        strict_1.default.equal(writes[0].role, undefined, 'role is not self-editable');
        strict_1.default.equal(writes[0].passwordHash, undefined);
    });
    (0, node_test_1.it)('never offers search or the user menu, whatever else it grows to hold', () => {
        // The half of this worth keeping. One is how you find anything and the
        // other is how you reach the setting that governs this row, so making
        // either hideable is a trap the member cannot get out of.
        strict_1.default.ok(!users_service_1.TOPBAR_ITEMS.includes('search'));
        strict_1.default.ok(!users_service_1.TOPBAR_ITEMS.includes('userMenu'));
    });
    /*
     * This used to assert the catalogue was exactly those five. That was right
     * under §1.5, where the list was "the controls a member may put away", and it
     * is wrong under §6, where the list is "the tools a member may pin" — and
     * where [08:29] is the objection to a short list we chose: "as compared to
     * hum limited de dein ke okay, theek hai, something ke hum ne rakha hai aur
     * woh us ko choose karna parega."
     *
     * So it is replaced rather than deleted, by the invariant that actually
     * matters now: everything she named is offerable.
     */
    (0, node_test_1.it)('offers every tool she pins at [07:55]–[08:03]', () => {
        for (const tool of [
            'create', // "yeh task creation ka option hai"
            'timer', // "yeh timing ka option"
            'docs', // "yeh document ka"
            'clips', // "yeh Loom ka"
            'recordings', // "yeh voice recordings ka"
            'whiteboards', // "yeh whiteboards ka"
            'dashboards', // "aur yeh dashboard ka option hai"
        ]) {
            strict_1.default.ok(users_service_1.TOPBAR_ITEMS.includes(tool), `${tool} is not pinnable, but she names it`);
        }
    });
    (0, node_test_1.it)('validates a pinned list the same way it validates a hidden one', async () => {
        // Same jsonb column hazard: unvalidated, it is a place to park arbitrary
        // data on a user row through a field the client controls.
        const { svc } = service();
        await strict_1.default.rejects(() => svc.updateProfile('u1', { topbarPinned: ['docs', 'not-a-control'] }), /Unknown top bar item/);
        await strict_1.default.rejects(() => svc.updateProfile('u1', { topbarPinned: { evil: true } }), /must be an array/);
    });
    (0, node_test_1.it)('de-duplicates a pinned list, so it stores a set and not a log of clicks', async () => {
        const { svc, writes } = service();
        await svc.updateProfile('u1', { topbarPinned: ['docs', 'docs', 'timer'] });
        strict_1.default.deepEqual(writes[0].topbarPinned, ['docs', 'timer']);
    });
});
//# sourceMappingURL=topbar-prefs.test.js.map