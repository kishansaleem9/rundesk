"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const common_1 = require("@nestjs/common");
const db_1 = require("@rundesk/db");
const client_invoicing_service_1 = require("./client-invoicing.service");
/**
 * A drizzle-shaped fake DB. `selectRows(table)` answers the current `.from()`
 * table; inserts/updates are captured for assertions and `.returning()` echoes
 * the written values (with a synthetic id) so the service can keep working. No
 * real Postgres or Stripe is touched.
 */
function makeDb(selectRows = () => []) {
    const inserts = [];
    const updates = [];
    const insertReturning = (table, values) => {
        if (table === db_1.clientInvoices)
            return [{ id: 'inv-1', ...values }];
        if (table === db_1.clientInvoiceLineItems && Array.isArray(values)) {
            return values.map((v, i) => ({ id: `li-${i}`, ...v }));
        }
        return Array.isArray(values) ? values : [values];
    };
    const db = {
        select: (_cols) => {
            const chain = { _table: null };
            chain.from = (t) => { chain._table = t; return chain; };
            chain.innerJoin = () => chain;
            chain.leftJoin = () => chain;
            chain.where = () => chain;
            chain.orderBy = () => chain;
            chain.groupBy = () => chain;
            chain.limit = () => chain;
            chain.then = (res, rej) => Promise.resolve(selectRows(chain._table)).then(res, rej);
            return chain;
        },
        insert: (table) => ({
            values: (values) => {
                const rec = { table, values };
                return {
                    returning: () => { inserts.push(rec); return Promise.resolve(insertReturning(table, values)); },
                    then: (res, rej) => { inserts.push(rec); return Promise.resolve().then(res, rej); },
                };
            },
        }),
        update: (table) => ({
            set: (set) => {
                const rec = { table, set };
                const whereObj = {
                    returning: () => { updates.push(rec); return Promise.resolve([{ id: 'inv-1', ...set }]); },
                    then: (res, rej) => { updates.push(rec); return Promise.resolve().then(res, rej); },
                };
                return { where: () => whereObj };
            },
        }),
    };
    return { db, inserts, updates };
}
// A project in the workspace, billing a client with no email (→ Stripe skipped).
const projectRow = { id: 'p1', name: 'Launch', clientId: 'c1' };
const clientRow = { id: 'c1', name: 'Acme Co', contactEmail: null };
// Mixed entries: two billable+uninvoiced on t1, one on t2, plus a non-billable
// entry and an already-invoiced entry that must NOT roll up.
const entryRows = () => [
    { entryId: 'e1', durationSec: 3600, isBillable: true, clientInvoiceId: null, taskId: 't1', taskTitle: 'Design' },
    { entryId: 'e2', durationSec: 1800, isBillable: true, clientInvoiceId: null, taskId: 't1', taskTitle: 'Design' },
    { entryId: 'e3', durationSec: 7200, isBillable: false, clientInvoiceId: null, taskId: 't1', taskTitle: 'Design' },
    { entryId: 'e4', durationSec: 3600, isBillable: true, clientInvoiceId: 'old-inv', taskId: 't2', taskTitle: 'Build' },
    { entryId: 'e5', durationSec: 3600, isBillable: true, clientInvoiceId: null, taskId: 't2', taskTitle: 'Build' },
];
function selectFor(entries = entryRows()) {
    return (table) => {
        if (table === db_1.projects)
            return [projectRow];
        if (table === db_1.clients)
            return [clientRow];
        if (table === db_1.timeEntries)
            return entries;
        return [];
    };
}
(0, node_test_1.describe)('ClientInvoicingService.generateFromProject', () => {
    (0, node_test_1.it)('rolls up only billable + uninvoiced entries, groups by task, and totals correctly', async () => {
        const { db, inserts } = makeDb(selectFor());
        const svc = new client_invoicing_service_1.ClientInvoicingService(db, null);
        const result = await svc.generateFromProject('ws-1', 'p1', { ratePerHourCents: 10_000 });
        // t1: 90 billed minutes → $150; t2: 60 minutes → $100; non-billable +
        // already-invoiced entries excluded.
        strict_1.default.equal(result.status, 'draft');
        strict_1.default.equal(result.subtotalCents, 25_000);
        strict_1.default.equal(result.totalCents, 25_000);
        strict_1.default.equal(result.lineItems.length, 2);
        const design = result.lineItems.find((l) => l.description === 'Design');
        const build = result.lineItems.find((l) => l.description === 'Build');
        strict_1.default.equal(design.quantityMinutes, 90);
        strict_1.default.equal(design.amountCents, 15_000);
        strict_1.default.equal(design.unitAmountCents, 10_000);
        strict_1.default.deepEqual(design.timeEntryIds, ['e1', 'e2']);
        strict_1.default.equal(build.quantityMinutes, 60);
        strict_1.default.equal(build.amountCents, 10_000);
        strict_1.default.deepEqual(build.timeEntryIds, ['e5']);
        // The persisted invoice carries the computed totals + draft status.
        const invInsert = inserts.find((i) => i.table === db_1.clientInvoices);
        strict_1.default.equal(invInsert.values.status, 'draft');
        strict_1.default.equal(invInsert.values.subtotalCents, 25_000);
        strict_1.default.equal(invInsert.values.clientId, 'c1');
    });
    (0, node_test_1.it)('stamps every included time entry with the new invoice id (no double-invoicing)', async () => {
        const { db, updates } = makeDb(selectFor());
        const svc = new client_invoicing_service_1.ClientInvoicingService(db, null);
        await svc.generateFromProject('ws-1', 'p1', {});
        const stamp = updates.find((u) => u.table === db_1.timeEntries);
        strict_1.default.ok(stamp, 'time_entries should be stamped');
        strict_1.default.equal(stamp.set.clientInvoiceId, 'inv-1');
    });
    (0, node_test_1.it)('defaults the rate to $100/h when none is supplied', async () => {
        const { db } = makeDb(selectFor());
        const svc = new client_invoicing_service_1.ClientInvoicingService(db, null);
        const result = await svc.generateFromProject('ws-1', 'p1', {});
        // 90 min + 60 min = 150 min = 2.5 h → $250 at the default rate.
        strict_1.default.equal(result.totalCents, 25_000);
    });
    (0, node_test_1.it)('rejects a project with no unbilled billable time', async () => {
        const onlyExcluded = [
            { entryId: 'e3', durationSec: 7200, isBillable: false, clientInvoiceId: null, taskId: 't1', taskTitle: 'Design' },
            { entryId: 'e4', durationSec: 3600, isBillable: true, clientInvoiceId: 'old-inv', taskId: 't2', taskTitle: 'Build' },
        ];
        const { db } = makeDb(selectFor(onlyExcluded));
        const svc = new client_invoicing_service_1.ClientInvoicingService(db, null);
        await strict_1.default.rejects(() => svc.generateFromProject('ws-1', 'p1', {}), common_1.BadRequestException);
    });
    (0, node_test_1.it)('rejects a project with no client to bill', async () => {
        const { db } = makeDb((table) => (table === db_1.projects ? [{ id: 'p1', name: 'Launch', clientId: null }] : []));
        const svc = new client_invoicing_service_1.ClientInvoicingService(db, null);
        await strict_1.default.rejects(() => svc.generateFromProject('ws-1', 'p1', {}), common_1.BadRequestException);
    });
});
(0, node_test_1.describe)('ClientInvoicingService — Stripe unconfigured', () => {
    (0, node_test_1.it)('stays a clean local draft (no Stripe fields, no Stripe mirror write)', async () => {
        const { db, updates } = makeDb(selectFor());
        const svc = new client_invoicing_service_1.ClientInvoicingService(db, null); // null == STRIPE_SECRET_KEY unset
        const result = await svc.generateFromProject('ws-1', 'p1', {});
        strict_1.default.equal(result.status, 'draft');
        strict_1.default.ok(!result.stripeInvoiceId, 'no Stripe invoice id on the local draft');
        strict_1.default.ok(!result.hostedUrl, 'no hosted url on the local draft');
        // The only write to client_invoices is the initial insert — no Stripe mirror UPDATE.
        strict_1.default.equal(updates.filter((u) => u.table === db_1.clientInvoices).length, 0);
    });
});
(0, node_test_1.describe)('ClientInvoicingService.void', () => {
    (0, node_test_1.it)('voids the invoice and releases its time entries', async () => {
        const { db, updates } = makeDb((table) => table === db_1.clientInvoices ? [{ id: 'inv-1', workspaceId: 'ws-1', status: 'draft' }] : []);
        const svc = new client_invoicing_service_1.ClientInvoicingService(db, null);
        const result = await svc.void('ws-1', 'inv-1');
        strict_1.default.equal(result.status, 'void');
        // Invoice moved to void…
        strict_1.default.ok(updates.some((u) => u.table === db_1.clientInvoices && u.set.status === 'void'));
        // …and its entries released (client_invoice_id cleared).
        const release = updates.find((u) => u.table === db_1.timeEntries);
        strict_1.default.ok(release, 'time_entries should be released');
        strict_1.default.equal(release.set.clientInvoiceId, null);
    });
});
(0, node_test_1.describe)('ClientInvoicingService state transitions', () => {
    (0, node_test_1.it)('markSent flips status to sent and stamps issued_at', async () => {
        const { db, updates } = makeDb((table) => table === db_1.clientInvoices ? [{ id: 'inv-1', workspaceId: 'ws-1', status: 'draft', issuedAt: null }] : []);
        const svc = new client_invoicing_service_1.ClientInvoicingService(db, null);
        const result = await svc.markSent('ws-1', 'inv-1');
        strict_1.default.equal(result.status, 'sent');
        const upd = updates.find((u) => u.table === db_1.clientInvoices);
        strict_1.default.equal(upd.set.status, 'sent');
        strict_1.default.ok(upd.set.issuedAt instanceof Date);
    });
    (0, node_test_1.it)('get returns the invoice with its line items', async () => {
        const { db } = makeDb((table) => {
            if (table === db_1.clientInvoices)
                return [{ id: 'inv-1', workspaceId: 'ws-1', status: 'sent' }];
            if (table === db_1.clientInvoiceLineItems)
                return [{ id: 'li-0', invoiceId: 'inv-1', description: 'Design' }];
            return [];
        });
        const svc = new client_invoicing_service_1.ClientInvoicingService(db, null);
        const result = await svc.get('ws-1', 'inv-1');
        strict_1.default.equal(result.id, 'inv-1');
        strict_1.default.equal(result.lineItems.length, 1);
        strict_1.default.equal(result.lineItems[0].description, 'Design');
    });
});
//# sourceMappingURL=client-invoicing.service.test.js.map