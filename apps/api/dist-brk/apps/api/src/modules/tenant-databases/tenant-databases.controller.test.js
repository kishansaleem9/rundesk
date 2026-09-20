"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const common_1 = require("@nestjs/common");
const tenant_databases_controller_1 = require("./tenant-databases.controller");
const superAdmin = { id: 'root', email: 'root@rundesk.dev', role: 'super_admin' };
const member = { id: 'u', email: 'u@rundesk.dev', role: 'member' };
(0, node_test_1.describe)('TenantDatabasesController super-admin gate', () => {
    (0, node_test_1.it)('rejects a non-super-admin on every handler', async () => {
        const ctrl = new tenant_databases_controller_1.TenantDatabasesController({});
        await strict_1.default.rejects(() => ctrl.list(member), common_1.ForbiddenException);
        await strict_1.default.rejects(() => ctrl.upsert('org', { connectionUrl: 'x' }, member), common_1.ForbiddenException);
        await strict_1.default.rejects(() => ctrl.test('org', member), common_1.ForbiddenException);
        await strict_1.default.rejects(() => ctrl.disable('org', member), common_1.ForbiddenException);
        await strict_1.default.rejects(() => ctrl.remove('org', member), common_1.ForbiddenException);
        // New §14.2 provisioning / data-migration ops surface — also super-admin only.
        await strict_1.default.rejects(() => ctrl.provision('org', member), common_1.ForbiddenException);
        await strict_1.default.rejects(() => ctrl.schemaStatus('org', member), common_1.ForbiddenException);
        await strict_1.default.rejects(() => ctrl.migrateData('org', { dryRun: true }, member), common_1.ForbiddenException);
    });
    (0, node_test_1.it)('forwards provision / schema-status / migrate-data to the service for a super admin', async () => {
        const calls = [];
        let migrateOpts;
        const svc = {
            provisionSchema: (org) => {
                calls.push(`provision:${org}`);
                return Promise.resolve({ ok: true });
            },
            getSchemaStatus: (org) => {
                calls.push(`status:${org}`);
                return Promise.resolve({ ok: true });
            },
            migrateOrgData: (org, opts) => {
                calls.push(`migrate:${org}`);
                migrateOpts = opts;
                return Promise.resolve({ ok: true });
            },
        };
        const ctrl = new tenant_databases_controller_1.TenantDatabasesController(svc);
        await ctrl.provision('o1', superAdmin);
        await ctrl.schemaStatus('o2', superAdmin);
        await ctrl.migrateData('o3', { dryRun: true }, superAdmin);
        strict_1.default.deepEqual(calls, ['provision:o1', 'status:o2', 'migrate:o3']);
        strict_1.default.equal(migrateOpts.dryRun, true, 'dryRun flag forwarded to the service');
        // Missing body defaults dryRun to false (safe: a real copy is explicit).
        await ctrl.migrateData('o4', {}, superAdmin);
        strict_1.default.equal(migrateOpts.dryRun, false);
    });
    (0, node_test_1.it)('forwards to the service for a super admin (list)', async () => {
        let called = false;
        const svc = {
            listAll: () => {
                called = true;
                return Promise.resolve([]);
            },
        };
        const ctrl = new tenant_databases_controller_1.TenantDatabasesController(svc);
        const out = await ctrl.list(superAdmin);
        strict_1.default.equal(called, true);
        strict_1.default.deepEqual(out, []);
    });
    (0, node_test_1.it)('forwards the upsert body to the service for a super admin', async () => {
        let receivedOrg;
        let receivedBody;
        const svc = {
            upsertForOrg: (orgId, body) => {
                receivedOrg = orgId;
                receivedBody = body;
                return Promise.resolve({ organizationId: orgId, status: 'pending', label: null, host: 'h:5432', lastCheckedAt: null });
            },
        };
        const ctrl = new tenant_databases_controller_1.TenantDatabasesController(svc);
        await ctrl.upsert('org-9', { connectionUrl: 'postgres://u:pw@h:5432/d', label: 'x' }, superAdmin);
        strict_1.default.equal(receivedOrg, 'org-9');
        strict_1.default.equal(receivedBody.connectionUrl, 'postgres://u:pw@h:5432/d');
    });
});
//# sourceMappingURL=tenant-databases.controller.test.js.map