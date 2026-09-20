"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const db_1 = require("@rundesk/db");
const users_service_1 = require("./users.service");
// §13.1 — the theme preference persists cross-device via PATCH /users/me, so the
// service validates it against the allowed set and writes it through.
(0, node_test_1.describe)('UsersService.updateProfile — theme persistence (§13.1)', () => {
    (0, node_test_1.it)('rejects an unsupported theme', async () => {
        const svc = new users_service_1.UsersService({}, {});
        await strict_1.default.rejects(() => svc.updateProfile('u', { theme: 'neon' }), /Unsupported theme/);
    });
    (0, node_test_1.it)('accepts a valid theme, persists it, and strips the password hash', async () => {
        let captured = null;
        const db = {
            update: () => ({
                set: (vals) => {
                    captured = vals;
                    return {
                        where: () => ({
                            returning: async () => [
                                { id: 'u', email: 'a@b.c', displayName: 'A', theme: vals.theme, passwordHash: 'secret' },
                            ],
                        }),
                    };
                },
            }),
        };
        const svc = new users_service_1.UsersService(db, {});
        const res = (await svc.updateProfile('u', { theme: 'dark' }));
        strict_1.default.equal(captured.theme, 'dark');
        strict_1.default.equal(res.theme, 'dark');
        strict_1.default.ok(!('passwordHash' in res));
    });
});
const SAMPLE_USER = {
    id: 'u1',
    email: 'ada@rundesk.dev',
    displayName: 'Ada',
    bio: 'hi',
    avatarUrl: 'https://x/a.png',
    role: 'member',
    passwordHash: 'secret-hash',
    isActive: true,
};
// A select() mock that resolves by the table passed to .from() — order-independent.
function identityDb(byTable) {
    return {
        select: () => {
            const chain = { _table: null };
            chain.from = (t) => {
                chain._table = t;
                return chain;
            };
            chain.innerJoin = () => chain;
            chain.where = () => chain;
            chain.orderBy = () => chain;
            chain.limit = () => chain;
            chain.then = (resolve) => resolve(byTable.get(chain._table) ?? []);
            return chain;
        },
    };
}
// §14.6 — data portability: the export bundles the caller's own data only.
(0, node_test_1.describe)('UsersService.exportUserData (GDPR export §14.6)', () => {
    (0, node_test_1.it)('returns a shaped bundle: profile (no hash), memberships, tasks, comments, time', async () => {
        const byTable = new Map([
            [db_1.users, [SAMPLE_USER]],
            [db_1.workspaceMembers, [{ workspaceId: 'w1', name: 'Acme', slug: 'acme', role: 'member', joinedAt: new Date() }]],
            [db_1.organizationMembers, [{ organizationId: 'o1', name: 'Acme Inc', slug: 'acme', role: 'member', joinedAt: new Date() }]],
            [db_1.tasks, [{ id: 't1', title: 'Task', status: 'todo', createdAt: new Date() }]],
            [db_1.taskAssignees, [{ taskId: 't2', title: 'Assigned', assignedAt: new Date() }]],
            [db_1.taskComments, [{ id: 'c1', taskId: 't1', body: 'hello', createdAt: new Date() }]],
            [db_1.timeEntries, [{ id: 'te1', taskId: 't1', startedAt: new Date(), endedAt: null, durationSec: 60, description: null, isBillable: false }]],
            [db_1.oauthAccounts, [{ provider: 'google', connectedAt: new Date() }]],
        ]);
        const svc = new users_service_1.UsersService(identityDb(byTable), {});
        const bundle = await svc.exportUserData('u1');
        strict_1.default.equal(bundle.format, 'rundesk.gdpr.export.v1');
        strict_1.default.ok(bundle.exportedAt);
        // Profile present, secret stripped.
        strict_1.default.equal(bundle.profile.email, 'ada@rundesk.dev');
        strict_1.default.ok(!('passwordHash' in bundle.profile));
        // Sections present.
        strict_1.default.equal(bundle.memberships.workspaces.length, 1);
        strict_1.default.equal(bundle.memberships.organizations.length, 1);
        strict_1.default.equal(bundle.tasks.created.length, 1);
        strict_1.default.equal(bundle.tasks.assigned.length, 1);
        strict_1.default.equal(bundle.comments.length, 1);
        strict_1.default.equal(bundle.timeEntries.length, 1);
        strict_1.default.equal(bundle.connectedAccounts[0].provider, 'google');
        // Counts mirror section lengths.
        strict_1.default.equal(bundle.counts.comments, 1);
        strict_1.default.equal(bundle.counts.tasksAssigned, 1);
    });
});
// A FIFO select() mock for the deletion path (ordered queries) + tx capture.
function deletionDb(queue) {
    let i = 0;
    const captured = { updateSet: null, deletes: [] };
    const chain = () => {
        const c = {};
        c.from = () => c;
        c.innerJoin = () => c;
        c.where = () => c;
        c.limit = () => c;
        c.orderBy = () => c;
        c.then = (resolve) => resolve(queue[i++] ?? []);
        return c;
    };
    const tx = {
        delete: (t) => ({ where: async () => { captured.deletes.push(t); } }),
        update: () => ({ set: (vals) => { captured.updateSet = vals; return { where: async () => undefined }; } }),
    };
    const db = {
        select: () => chain(),
        transaction: async (fn) => fn(tx),
    };
    return { db, captured };
}
// §14.6 — right to erasure: confirmation, anonymization, and orphan guards.
(0, node_test_1.describe)('UsersService.deleteAccount (GDPR erasure §14.6)', () => {
    (0, node_test_1.it)('rejects when the confirmation email does not match', async () => {
        const { db } = deletionDb([[SAMPLE_USER]]);
        const svc = new users_service_1.UsersService(db, {});
        await strict_1.default.rejects(() => svc.deleteAccount('u1', { confirmEmail: 'wrong@x.com' }), /Type your account email/);
    });
    (0, node_test_1.it)('anonymizes PII, revokes sessions, and removes memberships', async () => {
        // findById -> user; role member so super-admin guard skipped; adminOf -> [].
        const { db, captured } = deletionDb([[SAMPLE_USER], []]);
        const svc = new users_service_1.UsersService(db, {});
        const res = await svc.deleteAccount('u1', { confirmEmail: 'ADA@rundesk.dev' }); // case-insensitive
        strict_1.default.deepEqual(res, { ok: true, anonymized: true, userId: 'u1' });
        // PII scrubbed on the users row.
        strict_1.default.match(captured.updateSet.email, /^deleted\+u1@/);
        strict_1.default.equal(captured.updateSet.displayName, 'Deleted User');
        strict_1.default.equal(captured.updateSet.passwordHash, null);
        strict_1.default.equal(captured.updateSet.avatarUrl, null);
        strict_1.default.equal(captured.updateSet.isActive, false);
        // Sessions, oauth, assignees, workspace + org memberships all deleted (5 tables).
        strict_1.default.equal(captured.deletes.length, 5);
    });
    (0, node_test_1.it)('blocks deleting the last admin of a workspace (no orphaning)', async () => {
        // findById -> user; adminOf -> one workspace; that workspace has a single admin.
        const { db } = deletionDb([[SAMPLE_USER], [{ workspaceId: 'w1', name: 'Acme' }], [{ c: 1 }]]);
        const svc = new users_service_1.UsersService(db, {});
        await strict_1.default.rejects(() => svc.deleteAccount('u1', { confirmEmail: 'ada@rundesk.dev' }), /last admin of "Acme"/);
    });
    (0, node_test_1.it)('blocks deleting the last active super admin', async () => {
        const superUser = { ...SAMPLE_USER, role: 'super_admin' };
        // findById -> super user; super-admin count -> 1.
        const { db } = deletionDb([[superUser], [{ c: 1 }]]);
        const svc = new users_service_1.UsersService(db, {});
        await strict_1.default.rejects(() => svc.deleteAccount('u1', { confirmEmail: 'ada@rundesk.dev' }), /last active super admin/);
    });
});
//# sourceMappingURL=users.service.test.js.map