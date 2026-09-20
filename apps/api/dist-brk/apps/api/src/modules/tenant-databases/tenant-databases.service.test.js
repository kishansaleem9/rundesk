"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = require("node:fs");
const common_1 = require("@nestjs/common");
const db_1 = require("@rundesk/db");
const tenant_databases_service_1 = require("./tenant-databases.service");
// Minimal thenable query-builder stub (mirrors the organizations.service test idiom):
// select().from().where().limit() eventually resolves to `rows`.
const selectChain = (rows) => ({
    from: () => selectChain(rows),
    where: () => selectChain(rows),
    limit: () => selectChain(rows),
    then: (res, rej) => Promise.resolve(rows).then(res, rej),
});
(0, node_test_1.describe)('TenantDatabasesService.getDbForOrganization (resolver)', () => {
    (0, node_test_1.it)('returns the SHARED db when no active row exists', async () => {
        const db = { select: () => selectChain([]) };
        const svc = new tenant_databases_service_1.TenantDatabasesService(db);
        const resolved = await svc.getDbForOrganization('org-1');
        strict_1.default.equal(resolved, db, 'must fall back to the injected shared db handle');
    });
});
(0, node_test_1.describe)('TenantDatabasesService masked projection', () => {
    const secret = 'postgres://admin:sup3r-s3cret-pw@db.internal.example.com:5432/tenant_acme';
    (0, node_test_1.it)('getForOrg never returns the raw connectionUrl', async () => {
        const row = {
            organizationId: 'org-1',
            connectionUrl: secret,
            status: 'active',
            label: 'Acme dedicated',
            lastCheckedAt: null,
        };
        const db = { select: () => selectChain([row]) };
        const svc = new tenant_databases_service_1.TenantDatabasesService(db);
        const view = await svc.getForOrg('org-1');
        if (!view)
            throw new Error('expected a masked view');
        const serialized = JSON.stringify(view);
        strict_1.default.ok(!serialized.includes('sup3r-s3cret-pw'), 'must not leak the password');
        strict_1.default.ok(!serialized.includes(secret), 'must not leak the raw DSN');
        strict_1.default.equal(view.connectionUrl, undefined, 'view must not carry connectionUrl');
        strict_1.default.equal(view.status, 'active');
        strict_1.default.equal(view.host, 'db.internal.example.com:5432', 'host is masked to host:port only');
    });
    (0, node_test_1.it)('listAll masks every row', async () => {
        const rows = [
            { organizationId: 'o1', connectionUrl: 'postgres://u:pw-one@h1:5432/d', status: 'active', label: null, lastCheckedAt: null },
            { organizationId: 'o2', connectionUrl: 'postgres://u:pw-two@h2:6543/d', status: 'disabled', label: null, lastCheckedAt: null },
        ];
        const db = { select: () => selectChain(rows) };
        const svc = new tenant_databases_service_1.TenantDatabasesService(db);
        const views = await svc.listAll();
        const serialized = JSON.stringify(views);
        strict_1.default.ok(!serialized.includes('pw-one') && !serialized.includes('pw-two'), 'must not leak any password');
        strict_1.default.equal(views[0].host, 'h1:5432');
        strict_1.default.equal(views[1].host, 'h2:6543');
    });
    (0, node_test_1.it)('maskConnectionHost collapses unparseable DSNs to ***', () => {
        strict_1.default.equal((0, tenant_databases_service_1.maskConnectionHost)('not a dsn'), '***');
        strict_1.default.equal((0, tenant_databases_service_1.maskConnectionHost)('postgres://u:p@only-host/db'), 'only-host');
    });
});
(0, node_test_1.describe)('TenantDatabasesService.upsertForOrg', () => {
    (0, node_test_1.it)('upserts and returns a masked view carrying the given status', async () => {
        let capturedValues;
        let capturedSet;
        const db = {
            insert: () => ({
                values: (values) => {
                    capturedValues = values;
                    return {
                        onConflictDoUpdate: (cfg) => {
                            capturedSet = cfg.set;
                            return {
                                returning: () => Promise.resolve([
                                    {
                                        organizationId: values.organizationId,
                                        connectionUrl: values.connectionUrl,
                                        status: values.status,
                                        label: values.label,
                                        lastCheckedAt: null,
                                    },
                                ]),
                            };
                        },
                    };
                },
            }),
        };
        const svc = new tenant_databases_service_1.TenantDatabasesService(db);
        const view = await svc.upsertForOrg('org-1', {
            connectionUrl: 'postgres://u:pw@dedicated-host:5432/acme',
            label: 'Primary',
            status: 'active',
        });
        strict_1.default.equal(capturedValues.status, 'active', 'insert values carry the status');
        strict_1.default.equal(capturedSet.status, 'active', 'onConflict set updates the status');
        strict_1.default.equal(view.status, 'active');
        strict_1.default.equal(view.host, 'dedicated-host:5432');
        strict_1.default.equal(view.connectionUrl, undefined, 'view must not carry connectionUrl');
    });
    (0, node_test_1.it)('defaults status to pending when omitted', async () => {
        let capturedValues;
        const db = {
            insert: () => ({
                values: (values) => {
                    capturedValues = values;
                    return {
                        onConflictDoUpdate: () => ({
                            returning: () => Promise.resolve([{ ...values, lastCheckedAt: null }]),
                        }),
                    };
                },
            }),
        };
        const svc = new tenant_databases_service_1.TenantDatabasesService(db);
        const view = await svc.upsertForOrg('org-1', { connectionUrl: 'postgres://u:pw@h:5432/d' });
        strict_1.default.equal(capturedValues.status, 'pending');
        strict_1.default.equal(view.status, 'pending');
    });
});
(0, node_test_1.describe)('TenantDatabasesService.disable', () => {
    (0, node_test_1.it)('updates status to disabled and returns the masked view', async () => {
        let capturedSet;
        const db = {
            update: () => ({
                set: (patch) => {
                    capturedSet = patch;
                    return {
                        where: () => ({
                            returning: () => Promise.resolve([
                                {
                                    organizationId: 'org-1',
                                    connectionUrl: 'postgres://u:pw@h:5432/d',
                                    status: 'disabled',
                                    label: null,
                                    lastCheckedAt: null,
                                },
                            ]),
                        }),
                    };
                },
            }),
        };
        const svc = new tenant_databases_service_1.TenantDatabasesService(db);
        const view = await svc.disable('org-1');
        strict_1.default.equal(capturedSet.status, 'disabled', 'update sets status to disabled');
        if (!view)
            throw new Error('expected a masked view');
        strict_1.default.equal(view.status, 'disabled');
        strict_1.default.equal(view.connectionUrl, undefined, 'view must not carry connectionUrl');
    });
});
// ---------------------------------------------------------------------------
// Provisioning + data-migration (§14.2 caveat closure)
// ---------------------------------------------------------------------------
/**
 * Table-aware fake of the SHARED drizzle handle: `select().from(t).where()[.limit()]`
 * resolves to whatever rows are registered for table `t`. Mirrors the real
 * builder closely enough for both the registry guard (`.where().limit()`) and the
 * data-migration reads (`.where()`), keyed by the actual imported table objects.
 */
const tableAwareDb = (dataByTable) => {
    const chain = (table) => ({
        from: (t) => chain(t),
        where: () => chain(table),
        limit: () => chain(table),
        then: (res, rej) => Promise.resolve(dataByTable.get(table) ?? []).then(res, rej),
    });
    return { select: () => chain(undefined) };
};
const DEDICATED_ROW = {
    organizationId: 'org-1',
    connectionUrl: 'postgres://u:pw@dedicated-host:5432/acme',
    status: 'pending',
    label: null,
    lastCheckedAt: null,
};
/** Subclass exposing the dedicated-connection + schema-sync seams for assertions. */
class FakeTenantDbService extends tenant_databases_service_1.TenantDatabasesService {
    constructor(sharedDb, _handle, _trackers, _openError) {
        super(sharedDb);
        this._handle = _handle;
        this._trackers = _trackers;
        this._openError = _openError;
    }
    openDedicatedConnection() {
        if (this._openError)
            throw this._openError;
        return this._handle;
    }
    async runSchemaSync(connectionUrl) {
        this._trackers.syncCalls.push({ connectionUrl });
        this._trackers.onSync?.();
    }
}
(0, node_test_1.describe)('TenantDatabasesService.provisionSchema', () => {
    (0, node_test_1.it)('syncs the schema against the DEDICATED connection URL and verifies core tables', async () => {
        // Verification probe: `to_regclass(...) is not null` for the core tables → present.
        const handle = { execute: () => Promise.resolve([{ present: true }]) };
        const trackers = { syncCalls: [] };
        const shared = tableAwareDb(new Map([[db_1.tenantDatabases, [DEDICATED_ROW]]]));
        const svc = new FakeTenantDbService(shared, handle, trackers);
        const res = await svc.provisionSchema('org-1');
        if (!res.ok)
            throw new Error(`expected ok, got: ${res.error}`);
        strict_1.default.equal(res.provisioned, true, 'core tables verified present after the push');
        strict_1.default.equal(res.method, 'drizzle-kit push --force', 'reports the declarative-sync mechanism');
        strict_1.default.equal(res.organizationId, 'org-1');
        strict_1.default.equal(trackers.syncCalls.length, 1, 'schema sync ran exactly once');
        strict_1.default.equal(trackers.syncCalls[0].connectionUrl, DEDICATED_ROW.connectionUrl, 'push targeted the dedicated connection URL, not the shared db');
    });
    (0, node_test_1.it)('fails (ok:false) when the sync ran but the core tables are still absent', async () => {
        const handle = { execute: () => Promise.resolve([{ present: false }]) };
        const trackers = { syncCalls: [] };
        const shared = tableAwareDb(new Map([[db_1.tenantDatabases, [DEDICATED_ROW]]]));
        const svc = new FakeTenantDbService(shared, handle, trackers);
        const res = await svc.provisionSchema('org-1');
        strict_1.default.equal(res.ok, false);
        if (res.ok)
            throw new Error('expected failure');
        strict_1.default.equal(trackers.syncCalls.length, 1, 'the sync still ran');
        strict_1.default.match(res.error, /core tables/);
    });
    (0, node_test_1.it)('throws NotFoundException when the org has no dedicated database row', async () => {
        const shared = tableAwareDb(new Map()); // no registry row
        const svc = new FakeTenantDbService(shared, {}, { syncCalls: [] });
        await strict_1.default.rejects(() => svc.provisionSchema('org-x'), common_1.NotFoundException);
    });
    (0, node_test_1.it)('never crashes on a schema-sync failure — returns { ok: false, error }', async () => {
        const handle = { execute: () => Promise.resolve([{ present: true }]) };
        const trackers = {
            syncCalls: [],
            onSync: () => {
                throw new Error('boom');
            },
        };
        const shared = tableAwareDb(new Map([[db_1.tenantDatabases, [DEDICATED_ROW]]]));
        const svc = new FakeTenantDbService(shared, handle, trackers);
        const res = await svc.provisionSchema('org-1');
        strict_1.default.equal(res.ok, false);
        if (res.ok)
            throw new Error('expected failure');
        strict_1.default.match(res.error, /Provisioning failed/);
    });
    (0, node_test_1.it)('never crashes when the dedicated connection cannot be opened for verification', async () => {
        const shared = tableAwareDb(new Map([[db_1.tenantDatabases, [DEDICATED_ROW]]]));
        const svc = new FakeTenantDbService(shared, {}, { syncCalls: [] }, new Error('ECONNREFUSED'));
        const res = await svc.provisionSchema('org-1');
        strict_1.default.equal(res.ok, false);
        if (res.ok)
            throw new Error('expected failure');
        strict_1.default.match(res.error, /Failed to open dedicated connection/);
    });
});
(0, node_test_1.describe)('TenantDatabasesService.getSchemaStatus', () => {
    (0, node_test_1.it)('reports provisioned when the sentinel table exists', async () => {
        const handle = { execute: () => Promise.resolve([{ present: true, count: 81 }]) };
        const shared = tableAwareDb(new Map([[db_1.tenantDatabases, [DEDICATED_ROW]]]));
        const svc = new FakeTenantDbService(shared, handle, { syncCalls: [] });
        const res = await svc.getSchemaStatus('org-1');
        if (!res.ok)
            throw new Error('expected ok');
        strict_1.default.equal(res.reachable, true);
        strict_1.default.equal(res.provisioned, true);
        strict_1.default.equal(res.appliedMigrations, 81);
        strict_1.default.equal(res.state, 'provisioned');
    });
    (0, node_test_1.it)('reports needs-provisioning when the sentinel table is absent', async () => {
        const handle = { execute: () => Promise.resolve([{ present: false, count: 0 }]) };
        const shared = tableAwareDb(new Map([[db_1.tenantDatabases, [DEDICATED_ROW]]]));
        const svc = new FakeTenantDbService(shared, handle, { syncCalls: [] });
        const res = await svc.getSchemaStatus('org-1');
        if (!res.ok)
            throw new Error('expected ok');
        strict_1.default.equal(res.provisioned, false);
        strict_1.default.equal(res.state, 'needs-provisioning');
    });
    (0, node_test_1.it)('reports reachable:false (never throws) when the dedicated DB is down', async () => {
        const handle = { execute: () => Promise.reject(new Error('ECONNREFUSED')) };
        const shared = tableAwareDb(new Map([[db_1.tenantDatabases, [DEDICATED_ROW]]]));
        const svc = new FakeTenantDbService(shared, handle, { syncCalls: [] });
        const res = await svc.getSchemaStatus('org-1');
        strict_1.default.equal(res.ok, false);
        if (res.ok)
            throw new Error('expected failure');
        strict_1.default.equal(res.reachable, false);
        strict_1.default.match(res.error, /ECONNREFUSED/);
    });
    (0, node_test_1.it)('throws NotFoundException when the org has no dedicated database row', async () => {
        const shared = tableAwareDb(new Map());
        const svc = new FakeTenantDbService(shared, {}, { syncCalls: [] });
        await strict_1.default.rejects(() => svc.getSchemaStatus('org-x'), common_1.NotFoundException);
    });
});
(0, node_test_1.describe)('TenantDatabasesService.migrateOrgData', () => {
    // A minimal but complete core tree for org-1.
    const buildSharedTree = () => new Map([
        [db_1.tenantDatabases, [DEDICATED_ROW]],
        [db_1.organizations, [{ id: 'org-1', name: 'Acme' }]],
        [db_1.organizationMembers, [{ id: 'om1', organizationId: 'org-1', userId: 'u1' }]],
        [db_1.workspaces, [{ id: 'w1', organizationId: 'org-1' }]],
        [db_1.workspaceMembers, [{ id: 'wm1', workspaceId: 'w1', userId: 'u1' }]],
        [db_1.spaces, [{ id: 's1', workspaceId: 'w1', createdById: 'u1' }]],
        [db_1.projects, [{ id: 'p1', spaceId: 's1', createdById: 'u1' }]],
        [db_1.lists, [{ id: 'l1', projectId: 'p1' }]],
        [
            db_1.tasks,
            [
                { id: 't2', listId: 'l1', parentTaskId: 't1', createdById: 'u1' },
                { id: 't1', listId: 'l1', parentTaskId: null, createdById: 'u1' },
            ],
        ],
        [db_1.taskAssignees, [{ id: 'ta1', taskId: 't1', userId: 'u1' }]],
        [db_1.users, [{ id: 'u1', email: 'u1@x.dev' }]],
    ]);
    (0, node_test_1.it)('dry-run returns per-table counts in FK order WITHOUT writing', async () => {
        const target = {
            insert: () => {
                throw new Error('dry run must not write to the dedicated db');
            },
        };
        const svc = new FakeTenantDbService(tableAwareDb(buildSharedTree()), target, { syncCalls: [] });
        const res = await svc.migrateOrgData('org-1', { dryRun: true });
        strict_1.default.equal(res.ok, true);
        strict_1.default.equal(res.dryRun, true);
        strict_1.default.equal(res.totalInserted, 0, 'dry run inserts nothing');
        const found = Object.fromEntries(res.tables.map((t) => [t.table, t.found]));
        strict_1.default.equal(found['users'], 1);
        strict_1.default.equal(found['organizations'], 1);
        strict_1.default.equal(found['organization_members'], 1);
        strict_1.default.equal(found['workspaces'], 1);
        strict_1.default.equal(found['workspace_members'], 1);
        strict_1.default.equal(found['spaces'], 1);
        strict_1.default.equal(found['projects'], 1);
        strict_1.default.equal(found['lists'], 1);
        strict_1.default.equal(found['tasks'], 2);
        strict_1.default.equal(found['task_assignees'], 1);
        strict_1.default.equal(res.totalFound, 11); // 9 singleton tables + tasks(2) = 11
        const order = res.tables.map((t) => t.table);
        strict_1.default.ok(order.indexOf('users') < order.indexOf('organizations'), 'users seeded first');
        strict_1.default.ok(order.indexOf('organizations') < order.indexOf('workspaces'));
        strict_1.default.ok(order.indexOf('workspaces') < order.indexOf('spaces'));
        strict_1.default.ok(order.indexOf('spaces') < order.indexOf('projects'));
        strict_1.default.ok(order.indexOf('projects') < order.indexOf('lists'));
        strict_1.default.ok(order.indexOf('lists') < order.indexOf('tasks'));
        strict_1.default.ok(order.indexOf('tasks') < order.indexOf('task_assignees'));
    });
    (0, node_test_1.it)('real run inserts into the DEDICATED db idempotently, parents before children', async () => {
        const writes = [];
        const target = {
            insert: (table) => ({
                values: (rows) => ({
                    onConflictDoNothing: () => ({
                        returning: () => {
                            writes.push({ table, rows });
                            return Promise.resolve(rows.map((r) => ({ id: r.id })));
                        },
                    }),
                }),
            }),
        };
        const svc = new FakeTenantDbService(tableAwareDb(buildSharedTree()), target, { syncCalls: [] });
        const res = await svc.migrateOrgData('org-1', { dryRun: false });
        strict_1.default.equal(res.ok, true);
        strict_1.default.equal(res.totalInserted, res.totalFound, 'every source row inserted (no conflicts)');
        strict_1.default.equal(writes[0].table, db_1.users, 'first write is users');
        strict_1.default.equal(writes[writes.length - 1].table, db_1.taskAssignees, 'last write is task_assignees');
        const taskWrite = writes.find((w) => w.table === db_1.tasks);
        if (!taskWrite)
            throw new Error('expected a tasks write');
        strict_1.default.deepEqual(taskWrite.rows.map((r) => r.id), ['t1', 't2'], 'tasks topologically ordered: parent t1 before child t2');
    });
    (0, node_test_1.it)('throws NotFoundException when the org has no dedicated database row', async () => {
        const svc = new FakeTenantDbService(tableAwareDb(new Map()), {}, { syncCalls: [] });
        await strict_1.default.rejects(() => svc.migrateOrgData('org-x', { dryRun: true }), common_1.NotFoundException);
    });
    (0, node_test_1.it)('never crashes when the dedicated connection cannot be opened', async () => {
        const svc = new FakeTenantDbService(tableAwareDb(new Map([[db_1.tenantDatabases, [DEDICATED_ROW]]])), {}, { syncCalls: [] }, new Error('ECONNREFUSED'));
        const res = await svc.migrateOrgData('org-1', { dryRun: false });
        strict_1.default.equal(res.ok, false);
        strict_1.default.match(res.error ?? '', /Failed to open dedicated connection/);
    });
});
(0, node_test_1.describe)('tenant-databases helpers', () => {
    (0, node_test_1.it)('orderTasksByParent emits every parent before its children', () => {
        const ordered = (0, tenant_databases_service_1.orderTasksByParent)([
            { id: 'c', parentTaskId: 'b' },
            { id: 'b', parentTaskId: 'a' },
            { id: 'a', parentTaskId: null },
        ]);
        strict_1.default.deepEqual(ordered.map((t) => t.id), ['a', 'b', 'c']);
    });
    (0, node_test_1.it)('orderTasksByParent tolerates a cycle without infinite recursion', () => {
        const ordered = (0, tenant_databases_service_1.orderTasksByParent)([
            { id: 'a', parentTaskId: 'b' },
            { id: 'b', parentTaskId: 'a' },
        ]);
        strict_1.default.equal(ordered.length, 2, 'both rows still emitted exactly once');
    });
    (0, node_test_1.it)('resolveMigrationsDir points at a real folder containing meta/_journal.json', () => {
        const dir = (0, tenant_databases_service_1.resolveMigrationsDir)();
        strict_1.default.ok((0, node_fs_1.existsSync)(node_path_1.default.join(dir, 'meta', '_journal.json')), 'resolved dir has the drizzle journal');
        strict_1.default.ok(dir.endsWith(node_path_1.default.join('migrations')), 'resolves to a migrations directory');
    });
});
//# sourceMappingURL=tenant-databases.service.test.js.map