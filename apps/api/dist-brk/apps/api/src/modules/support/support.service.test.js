"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const common_1 = require("@nestjs/common");
const db_1 = require("@rundesk/db");
const support_service_1 = require("./support.service");
const support_constants_1 = require("./support.constants");
/**
 * A PlansService double. SupportService resolves the workspace plan to gate
 * ticket creation (paid-only, §14.4) and to scale SLA clocks by tier. Defaults
 * to 'pro' — whose SLA equals the legacy priority-only policy — so pre-existing
 * priority tests keep their expected values.
 */
const plansMock = (id = 'pro') => ({
    getWorkspacePlan: async () => ({ id, label: id.charAt(0).toUpperCase() + id.slice(1) }),
});
/**
 * A drizzle-shaped fake DB. `selectRows(table)` answers each `.from(table)`;
 * inserts (with `.returning()`) echo the written values plus a generated id;
 * updates capture their `set` patch for assertions. No Postgres is touched.
 */
function makeDb(selectRows = () => []) {
    const inserts = [];
    const updates = [];
    const deletes = [];
    const db = {
        select: (_cols) => {
            const chain = { _table: null };
            chain.from = (t) => { chain._table = t; return chain; };
            chain.leftJoin = () => chain;
            chain.where = () => chain;
            chain.orderBy = () => chain;
            chain.limit = () => chain;
            chain.then = (res, rej) => Promise.resolve(selectRows(chain._table)).then(res, rej);
            return chain;
        },
        insert: (table) => ({
            values: (values) => {
                const rec = { table, values };
                const row = Array.isArray(values) ? values : { id: values.id ?? 'generated-id', ...values };
                return {
                    returning: () => { inserts.push(rec); return Promise.resolve([row]); },
                    then: (res, rej) => { inserts.push(rec); return Promise.resolve().then(res, rej); },
                };
            },
        }),
        update: (table) => ({
            set: (set) => {
                updates.push({ table, set });
                return {
                    where: () => ({
                        returning: () => Promise.resolve([{ id: 'updated-id', ...set }]),
                        then: (res, rej) => Promise.resolve().then(res, rej),
                    }),
                };
            },
        }),
        delete: (table) => ({
            where: () => { deletes.push({ table }); return Promise.resolve(); },
        }),
    };
    return { db, inserts, updates, deletes };
}
// --- SLA due-date policy ------------------------------------------------------
(0, node_test_1.describe)('SupportService — ticket create sets SLA due dates by priority', () => {
    (0, node_test_1.it)('stamps first-response + resolution due dates from the priority policy', async () => {
        const { db, inserts } = makeDb((t) => (t === db_1.workspaceMembers ? [{ id: 'm1' }] : []));
        const svc = new support_service_1.SupportService(db, plansMock());
        const before = Date.now();
        const ticket = await svc.createTicket({ id: 'u1', role: 'member' }, { workspaceId: 'ws1', subject: 'Help', body: 'Broken', priority: 'urgent' });
        const after = Date.now();
        const ins = inserts.find((i) => i.table === db_1.supportTickets);
        strict_1.default.ok(ins, 'inserted a ticket row');
        const fr = new Date(ins.values.firstResponseDueAt).getTime();
        const res = new Date(ins.values.resolutionDueAt).getTime();
        // urgent → 4h first response, 24h resolution.
        strict_1.default.ok(fr >= before + support_constants_1.SLA_POLICY.urgent.firstResponseHours * 3600_000);
        strict_1.default.ok(fr <= after + support_constants_1.SLA_POLICY.urgent.firstResponseHours * 3600_000);
        strict_1.default.ok(res >= before + support_constants_1.SLA_POLICY.urgent.resolutionHours * 3600_000);
        strict_1.default.ok(res <= after + support_constants_1.SLA_POLICY.urgent.resolutionHours * 3600_000);
        strict_1.default.equal(ticket.priority, 'urgent');
        strict_1.default.equal(ticket.status, 'open');
        // The opening message is seeded into the thread.
        strict_1.default.ok(inserts.some((i) => i.table === db_1.supportTicketMessages));
    });
    (0, node_test_1.it)('computeSlaDueDates matches the policy for every priority', () => {
        const from = new Date('2026-01-01T00:00:00.000Z');
        for (const priority of ['low', 'normal', 'high', 'urgent']) {
            const { firstResponseDueAt, resolutionDueAt } = (0, support_constants_1.computeSlaDueDates)(priority, from);
            strict_1.default.equal(firstResponseDueAt.getTime(), from.getTime() + support_constants_1.SLA_POLICY[priority].firstResponseHours * 3600_000);
            strict_1.default.equal(resolutionDueAt.getTime(), from.getTime() + support_constants_1.SLA_POLICY[priority].resolutionHours * 3600_000);
        }
    });
    (0, node_test_1.it)('defaults an unknown priority to normal', async () => {
        const { db, inserts } = makeDb((t) => (t === db_1.workspaceMembers ? [{ id: 'm1' }] : []));
        const svc = new support_service_1.SupportService(db, plansMock());
        const ticket = await svc.createTicket({ id: 'u1', role: 'member' }, { workspaceId: 'ws1', subject: 'X', priority: 'nonsense' });
        strict_1.default.equal(ticket.priority, 'normal');
        strict_1.default.ok(inserts.some((i) => i.table === db_1.supportTickets));
    });
});
// --- Staff reply stamps first_response ---------------------------------------
(0, node_test_1.describe)('SupportService — staff reply stamps first_response_at', () => {
    const ticketRow = {
        id: 't1',
        workspaceId: 'ws1',
        createdById: 'requester',
        subject: 'S',
        body: 'B',
        status: 'open',
        priority: 'normal',
        assignedToId: null,
        firstResponseAt: null,
        resolvedAt: null,
        firstResponseDueAt: new Date(Date.now() + 3600_000),
        resolutionDueAt: new Date(Date.now() + 10 * 3600_000),
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    (0, node_test_1.it)('a staff reply sets first_response_at when unset and moves open→pending', async () => {
        const { db, updates } = makeDb((t) => {
            if (t === db_1.supportTickets)
                return [ticketRow];
            if (t === db_1.workspaceMembers)
                return [{ role: 'workspace_admin' }];
            return [];
        });
        const svc = new support_service_1.SupportService(db, plansMock());
        await svc.addMessage({ id: 'staff1', role: 'member' }, 't1', { body: 'Looking into it' });
        const patch = updates.find((u) => u.table === db_1.supportTickets).set;
        strict_1.default.ok(patch.firstResponseAt instanceof Date, 'first_response_at stamped');
        strict_1.default.equal(patch.status, 'pending');
    });
    (0, node_test_1.it)('a requester reply does NOT stamp first_response_at', async () => {
        const { db, updates } = makeDb((t) => {
            if (t === db_1.supportTickets)
                return [ticketRow];
            if (t === db_1.workspaceMembers)
                return []; // requester is not staff
            return [];
        });
        const svc = new support_service_1.SupportService(db, plansMock());
        // The requester is the ticket creator, so access is allowed.
        await svc.addMessage({ id: 'requester', role: 'member' }, 't1', { body: 'Still broken' });
        const patch = updates.find((u) => u.table === db_1.supportTickets).set;
        strict_1.default.equal(patch.firstResponseAt, undefined);
    });
});
// --- SLA-breach computation ---------------------------------------------------
(0, node_test_1.describe)('SupportService — SLA breach computation', () => {
    (0, node_test_1.it)('flags a first-response breach when overdue with no response', () => {
        const flags = (0, support_constants_1.computeSlaBreach)({
            status: 'open',
            firstResponseAt: null,
            resolvedAt: null,
            firstResponseDueAt: new Date(Date.now() - 3600_000), // 1h ago
            resolutionDueAt: new Date(Date.now() + 3600_000),
        });
        strict_1.default.equal(flags.firstResponseBreached, true);
        strict_1.default.equal(flags.resolutionBreached, false);
        strict_1.default.equal(flags.breached, true);
    });
    (0, node_test_1.it)('does not flag first-response breach once answered', () => {
        const flags = (0, support_constants_1.computeSlaBreach)({
            status: 'pending',
            firstResponseAt: new Date(Date.now() - 60_000),
            resolvedAt: null,
            firstResponseDueAt: new Date(Date.now() - 3600_000),
            resolutionDueAt: new Date(Date.now() + 3600_000),
        });
        strict_1.default.equal(flags.firstResponseBreached, false);
    });
    (0, node_test_1.it)('flags a resolution breach when overdue and unresolved', () => {
        const flags = (0, support_constants_1.computeSlaBreach)({
            status: 'open',
            firstResponseAt: new Date(),
            resolvedAt: null,
            firstResponseDueAt: new Date(Date.now() - 5 * 3600_000),
            resolutionDueAt: new Date(Date.now() - 3600_000),
        });
        strict_1.default.equal(flags.resolutionBreached, true);
        strict_1.default.equal(flags.breached, true);
    });
    (0, node_test_1.it)('a resolved ticket never reports a resolution breach', () => {
        const flags = (0, support_constants_1.computeSlaBreach)({
            status: 'resolved',
            firstResponseAt: new Date(Date.now() - 5 * 3600_000),
            resolvedAt: new Date(Date.now() - 60_000),
            firstResponseDueAt: new Date(Date.now() - 6 * 3600_000),
            resolutionDueAt: new Date(Date.now() - 3600_000),
        });
        strict_1.default.equal(flags.resolutionBreached, false);
        strict_1.default.equal(flags.firstResponseBreached, false);
        strict_1.default.equal(flags.breached, false);
    });
    (0, node_test_1.it)('createTicket read exposes slaBreached flags', async () => {
        const { db } = makeDb((t) => (t === db_1.workspaceMembers ? [{ id: 'm1' }] : []));
        const svc = new support_service_1.SupportService(db, plansMock());
        const ticket = await svc.createTicket({ id: 'u1', role: 'member' }, { workspaceId: 'ws1', subject: 'X', priority: 'normal' });
        strict_1.default.equal(ticket.slaBreached, false);
        strict_1.default.equal(typeof ticket.firstResponseBreached, 'boolean');
        strict_1.default.equal(typeof ticket.resolutionBreached, 'boolean');
    });
});
// --- Status page shape --------------------------------------------------------
(0, node_test_1.describe)('SupportService — status page shape', () => {
    (0, node_test_1.it)('returns { overall, components, incidents } and derives overall from worst state', async () => {
        const { db } = makeDb((t) => {
            if (t === db_1.statusComponents) {
                return [
                    { id: 'c1', name: 'API', status: 'operational', position: 0 },
                    { id: 'c2', name: 'Web', status: 'partial_outage', position: 1 },
                ];
            }
            if (t === db_1.statusIncidents) {
                return [{ id: 'i1', title: 'Latency', status: 'investigating', impact: 'minor' }];
            }
            return [];
        });
        const svc = new support_service_1.SupportService(db, plansMock());
        const page = await svc.getStatusPage();
        strict_1.default.ok(Array.isArray(page.components));
        strict_1.default.ok(Array.isArray(page.incidents));
        strict_1.default.equal(page.components.length, 2);
        strict_1.default.equal(page.incidents.length, 1);
        // Worst component is partial_outage → overall partial_outage.
        strict_1.default.equal(page.overall, 'partial_outage');
    });
    (0, node_test_1.it)('is operational when every component is operational and no open incidents', async () => {
        const { db } = makeDb((t) => {
            if (t === db_1.statusComponents)
                return [{ id: 'c1', name: 'API', status: 'operational', position: 0 }];
            if (t === db_1.statusIncidents)
                return [];
            return [];
        });
        const svc = new support_service_1.SupportService(db, plansMock());
        const page = await svc.getStatusPage();
        strict_1.default.equal(page.overall, 'operational');
    });
    (0, node_test_1.it)('is degraded when an incident is open even if components are operational', async () => {
        const { db } = makeDb((t) => {
            if (t === db_1.statusComponents)
                return [{ id: 'c1', name: 'API', status: 'operational', position: 0 }];
            if (t === db_1.statusIncidents)
                return [{ id: 'i1', title: 'Blip', status: 'monitoring', impact: 'minor' }];
            return [];
        });
        const svc = new support_service_1.SupportService(db, plansMock());
        const page = await svc.getStatusPage();
        strict_1.default.equal(page.overall, 'degraded');
    });
});
// --- Access control -----------------------------------------------------------
(0, node_test_1.describe)('SupportService — ticket access control', () => {
    const foreignTicket = {
        id: 't9',
        workspaceId: 'ws1',
        createdById: 'someone-else',
        subject: 'Private',
        body: 'B',
        status: 'open',
        priority: 'normal',
        assignedToId: null,
        firstResponseAt: null,
        resolvedAt: null,
        firstResponseDueAt: new Date(),
        resolutionDueAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    (0, node_test_1.it)("a non-creator, non-admin cannot read another user's ticket", async () => {
        const { db } = makeDb((t) => {
            if (t === db_1.supportTickets)
                return [foreignTicket];
            if (t === db_1.workspaceMembers)
                return []; // not a member/staff of the workspace
            return [];
        });
        const svc = new support_service_1.SupportService(db, plansMock());
        await strict_1.default.rejects(() => svc.getTicket({ id: 'intruder', role: 'member' }, 't9'), (err) => err instanceof common_1.ForbiddenException);
    });
    (0, node_test_1.it)('the creator can read their own ticket', async () => {
        const { db } = makeDb((t) => {
            if (t === db_1.supportTickets)
                return [foreignTicket];
            if (t === db_1.supportTicketMessages)
                return [];
            return [];
        });
        const svc = new support_service_1.SupportService(db, plansMock());
        const res = await svc.getTicket({ id: 'someone-else', role: 'member' }, 't9');
        strict_1.default.equal(res.id, 't9');
        strict_1.default.ok(Array.isArray(res.messages));
    });
    (0, node_test_1.it)('a super_admin can read any ticket', async () => {
        const { db } = makeDb((t) => {
            if (t === db_1.supportTickets)
                return [foreignTicket];
            if (t === db_1.supportTicketMessages)
                return [];
            return [];
        });
        const svc = new support_service_1.SupportService(db, plansMock());
        const res = await svc.getTicket({ id: 'admin', role: 'super_admin' }, 't9');
        strict_1.default.equal(res.id, 't9');
    });
    (0, node_test_1.it)('a plain requester cannot update ticket status', async () => {
        const { db } = makeDb((t) => {
            if (t === db_1.supportTickets)
                return [foreignTicket];
            if (t === db_1.workspaceMembers)
                return [];
            return [];
        });
        const svc = new support_service_1.SupportService(db, plansMock());
        await strict_1.default.rejects(() => svc.updateTicket({ id: 'someone-else', role: 'member' }, 't9', { status: 'resolved' }), (err) => err instanceof common_1.ForbiddenException);
    });
    (0, node_test_1.it)('super_admin-only status component management rejects non-admins', async () => {
        const { db } = makeDb();
        const svc = new support_service_1.SupportService(db, plansMock());
        await strict_1.default.rejects(() => svc.createComponent({ id: 'u1', role: 'member' }, { name: 'API' }), (err) => err instanceof common_1.ForbiddenException);
    });
});
// --- SLA commitments BY TIER × priority (§14.4) -------------------------------
(0, node_test_1.describe)('SupportService — SLA by tier × priority', () => {
    (0, node_test_1.it)('SLA_MATRIX is strictly tighter for higher tiers at every priority', () => {
        for (const priority of support_constants_1.TICKET_PRIORITIES) {
            const e = support_constants_1.SLA_MATRIX.enterprise[priority];
            const b = support_constants_1.SLA_MATRIX.business[priority];
            const p = support_constants_1.SLA_MATRIX.pro[priority];
            const f = support_constants_1.SLA_MATRIX.free[priority];
            // enterprise < business < pro < free on both clocks.
            strict_1.default.ok(e.firstResponseHours < b.firstResponseHours, `${priority} FR ent<biz`);
            strict_1.default.ok(b.firstResponseHours < p.firstResponseHours, `${priority} FR biz<pro`);
            strict_1.default.ok(p.firstResponseHours < f.firstResponseHours, `${priority} FR pro<free`);
            strict_1.default.ok(e.resolutionHours < b.resolutionHours, `${priority} RES ent<biz`);
            strict_1.default.ok(b.resolutionHours < p.resolutionHours, `${priority} RES biz<pro`);
            strict_1.default.ok(p.resolutionHours < f.resolutionHours, `${priority} RES pro<free`);
        }
    });
    (0, node_test_1.it)('computeSlaDueDates scales by tier (enterprise urgent 1h/8h vs free 8h/48h)', () => {
        const from = new Date('2026-01-01T00:00:00.000Z');
        const ent = (0, support_constants_1.computeSlaDueDates)('urgent', from, 'enterprise');
        const free = (0, support_constants_1.computeSlaDueDates)('urgent', from, 'free');
        strict_1.default.equal(ent.firstResponseDueAt.getTime(), from.getTime() + 1 * 3600_000);
        strict_1.default.equal(ent.resolutionDueAt.getTime(), from.getTime() + 8 * 3600_000);
        strict_1.default.equal(free.firstResponseDueAt.getTime(), from.getTime() + 8 * 3600_000);
        strict_1.default.equal(free.resolutionDueAt.getTime(), from.getTime() + 48 * 3600_000);
        strict_1.default.ok(ent.resolutionDueAt.getTime() < free.resolutionDueAt.getTime());
    });
    (0, node_test_1.it)('an unknown/omitted tier falls back to the legacy priority-only policy', () => {
        const from = new Date('2026-01-01T00:00:00.000Z');
        for (const priority of support_constants_1.TICKET_PRIORITIES) {
            const omitted = (0, support_constants_1.computeSlaDueDates)(priority, from);
            const unknown = (0, support_constants_1.computeSlaDueDates)(priority, from, 'platinum');
            const baseFr = from.getTime() + support_constants_1.SLA_POLICY[priority].firstResponseHours * 3600_000;
            const baseRes = from.getTime() + support_constants_1.SLA_POLICY[priority].resolutionHours * 3600_000;
            strict_1.default.equal(omitted.firstResponseDueAt.getTime(), baseFr);
            strict_1.default.equal(omitted.resolutionDueAt.getTime(), baseRes);
            strict_1.default.equal(unknown.firstResponseDueAt.getTime(), baseFr);
            strict_1.default.equal(unknown.resolutionDueAt.getTime(), baseRes);
        }
    });
    (0, node_test_1.it)('createTicket stamps the tier-scaled SLA (enterprise urgent = 1h/8h)', async () => {
        const { db, inserts } = makeDb((t) => (t === db_1.workspaceMembers ? [{ id: 'm1' }] : []));
        const svc = new support_service_1.SupportService(db, plansMock('enterprise'));
        const before = Date.now();
        await svc.createTicket({ id: 'u1', role: 'member' }, { workspaceId: 'ws1', subject: 'Outage', priority: 'urgent' });
        const after = Date.now();
        const ins = inserts.find((i) => i.table === db_1.supportTickets);
        const fr = new Date(ins.values.firstResponseDueAt).getTime();
        const res = new Date(ins.values.resolutionDueAt).getTime();
        strict_1.default.ok(fr >= before + 1 * 3600_000 && fr <= after + 1 * 3600_000, 'enterprise FR = 1h');
        strict_1.default.ok(res >= before + 8 * 3600_000 && res <= after + 8 * 3600_000, 'enterprise resolution = 8h');
    });
});
// --- Ticket system is paid-only (§14.4) --------------------------------------
(0, node_test_1.describe)('SupportService — ticket creation gated to paid tiers', () => {
    (0, node_test_1.it)('a Free workspace is turned away with a 403 upgrade prompt (nothing written)', async () => {
        const { db, inserts } = makeDb((t) => (t === db_1.workspaceMembers ? [{ id: 'm1' }] : []));
        const svc = new support_service_1.SupportService(db, plansMock('free'));
        await strict_1.default.rejects(() => svc.createTicket({ id: 'u1', role: 'member' }, { workspaceId: 'ws1', subject: 'Help' }), (err) => err instanceof common_1.ForbiddenException && /upgrade/i.test(err.message));
        strict_1.default.equal(inserts.some((i) => i.table === db_1.supportTickets), false, 'no ticket row written');
    });
    (0, node_test_1.it)('a Pro workspace can open a ticket', async () => {
        const { db, inserts } = makeDb((t) => (t === db_1.workspaceMembers ? [{ id: 'm1' }] : []));
        const svc = new support_service_1.SupportService(db, plansMock('pro'));
        const ticket = await svc.createTicket({ id: 'u1', role: 'member' }, { workspaceId: 'ws1', subject: 'Help' });
        strict_1.default.equal(ticket.status, 'open');
        strict_1.default.ok(inserts.some((i) => i.table === db_1.supportTickets));
    });
    (0, node_test_1.it)('super_admin can file into a Free workspace (platform-staff bypass)', async () => {
        const { db, inserts } = makeDb(() => []);
        const svc = new support_service_1.SupportService(db, plansMock('free'));
        const ticket = await svc.createTicket({ id: 'sa', role: 'super_admin' }, { workspaceId: 'ws1', subject: 'On behalf of the customer' });
        strict_1.default.equal(ticket.status, 'open');
        strict_1.default.ok(inserts.some((i) => i.table === db_1.supportTickets));
    });
});
//# sourceMappingURL=support.service.test.js.map