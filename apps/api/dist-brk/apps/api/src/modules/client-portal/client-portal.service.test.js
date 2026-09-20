"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const client_portal_service_1 = require("./client-portal.service");
const db_1 = require("@rundesk/db");
function makeDb(handler) {
    function chain(op, table) {
        const state = { op, table };
        const c = {
            from: (t) => { state.table = t; return c; },
            innerJoin: () => c,
            leftJoin: () => c,
            where: () => c,
            limit: () => c,
            orderBy: () => c,
            set: () => c,
            values: (v) => { state.values = v; return c; },
            onConflictDoNothing: () => c,
            returning: () => c,
            then: (resolve, reject) => Promise.resolve().then(() => handler(state)).then(resolve, reject),
        };
        return c;
    }
    return {
        select: () => chain('select'),
        insert: (t) => chain('insert', t),
        update: (t) => chain('update', t),
        delete: (t) => chain('delete', t),
    };
}
const PROJECT_ROW = {
    projectId: 'proj-1',
    projectName: 'Website Redesign',
    projectVisibility: null,
    spaceId: 'space-1',
    spaceVisibility: 'public',
    workspaceId: 'ws-1',
};
const META_ROW = {
    projectName: 'Website Redesign',
    workspaceName: 'Aura Agency',
    workspaceLogoUrl: 'https://cdn/logo.png',
    workspacePrimaryColor: '#354fb0',
    workspaceAccentColor: '#ff8800',
    clientName: 'Acme Co',
};
// Task rows deliberately carry INTERNAL fields to prove the projection strips
// them. Only the client-safe columns must survive into the response.
const OPEN_TASK = {
    id: 'task-open',
    title: 'Design homepage',
    status: 'in_progress',
    statusCategory: 'in_progress',
    statusLabel: 'In progress',
    statusColor: '#3b82f6',
    dueDate: new Date('2026-08-01T00:00:00Z'),
    completedAt: null,
    isMilestone: true,
    // internal — must never leak:
    assigneeEmail: 'internal@aura.agency',
    description: 'INTERNAL private notes',
    priority: 'urgent',
    createdById: 'user-internal',
    listId: 'list-secret',
};
const DONE_TASK = {
    id: 'task-done',
    title: 'Kickoff call',
    status: 'done',
    statusCategory: 'closed',
    statusLabel: 'Done',
    statusColor: '#22c55e',
    dueDate: null,
    completedAt: new Date('2026-07-01T00:00:00Z'),
    isMilestone: false,
    assigneeEmail: 'internal@aura.agency',
    description: 'INTERNAL',
    priority: 'high',
    createdById: 'user-internal',
    listId: 'list-secret',
};
const SAFE_TASK_KEYS = ['id', 'title', 'status', 'statusCategory', 'statusColor', 'dueDate', 'isMilestone'].sort();
(0, node_test_1.describe)('ClientPortalService — safe projection (pure)', () => {
    (0, node_test_1.it)('toClientTask emits ONLY client-safe keys, dropping internal fields', () => {
        const out = (0, client_portal_service_1.toClientTask)(OPEN_TASK);
        strict_1.default.deepEqual(Object.keys(out).sort(), SAFE_TASK_KEYS);
        // Positively assert none of the internal fields survived.
        for (const leak of ['assigneeEmail', 'description', 'priority', 'createdById', 'listId', 'completedAt']) {
            strict_1.default.equal(out[leak], undefined, `internal field "${leak}" must not leak`);
        }
        strict_1.default.equal(out.status, 'In progress');
        strict_1.default.equal(out.dueDate, '2026-08-01T00:00:00.000Z');
    });
    (0, node_test_1.it)('toClientTask falls back to a humanised status key when no label resolves', () => {
        const out = (0, client_portal_service_1.toClientTask)({ ...OPEN_TASK, statusLabel: null });
        strict_1.default.equal(out.status, 'In progress');
    });
    (0, node_test_1.it)('humanizeStatusKey normalises snake/kebab keys', () => {
        strict_1.default.equal((0, client_portal_service_1.humanizeStatusKey)('in_progress'), 'In progress');
        strict_1.default.equal((0, client_portal_service_1.humanizeStatusKey)('to-do'), 'To do');
        strict_1.default.equal((0, client_portal_service_1.humanizeStatusKey)(''), 'Status');
    });
});
(0, node_test_1.describe)('ClientPortalService.create', () => {
    (0, node_test_1.it)('returns a fresh ~24-char token and its public url', async () => {
        const db = makeDb((s) => {
            if (s.op === 'select' && s.table === db_1.projects)
                return [PROJECT_ROW];
            if (s.op === 'select' && s.table === db_1.workspaceMembers)
                return [{ role: 'workspace_admin' }];
            if (s.op === 'insert' && s.table === db_1.clientPortals) {
                // Echo the inserted row, filling the DB-side default for is_enabled.
                return [{ id: 'portal-1', createdAt: new Date(), lastViewedAt: null, isEnabled: true, ...s.values }];
            }
            return [];
        });
        const svc = new client_portal_service_1.ClientPortalService(db);
        const out = await svc.create('proj-1', 'user-1', { name: 'Client view' });
        strict_1.default.match(out.token, /^[A-Za-z0-9_-]{24}$/, 'token is 24-char base64url');
        strict_1.default.equal(out.url, `/portal/${out.token}`);
        strict_1.default.equal(out.name, 'Client view');
        strict_1.default.equal(out.projectId, 'proj-1');
        strict_1.default.equal(out.isEnabled, true);
    });
});
(0, node_test_1.describe)('ClientPortalService.getPublicView', () => {
    function dbFor(portal, taskRows) {
        return makeDb((s) => {
            if (s.op === 'select' && s.table === db_1.clientPortals)
                return [portal];
            if (s.op === 'select' && s.table === db_1.projects)
                return [META_ROW];
            if (s.op === 'select' && s.table === db_1.clients)
                return [{ name: META_ROW.clientName }];
            if (s.op === 'select' && s.table === db_1.tasks)
                return taskRows;
            return [];
        });
    }
    const basePortal = {
        id: 'portal-1',
        token: 'tok',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        clientId: 'client-1',
        name: null,
        isEnabled: true,
        showCompleted: true,
        createdById: 'user-1',
        createdAt: new Date(),
        lastViewedAt: null,
    };
    (0, node_test_1.it)('returns branding + the project tasks with ONLY safe fields', async () => {
        const svc = new client_portal_service_1.ClientPortalService(dbFor(basePortal, [OPEN_TASK, DONE_TASK]));
        const view = await svc.getPublicView('tok');
        strict_1.default.equal(view.workspace.name, 'Aura Agency');
        strict_1.default.equal(view.workspace.logoUrl, 'https://cdn/logo.png');
        strict_1.default.equal(view.workspace.primaryColor, '#354fb0');
        strict_1.default.equal(view.project.name, 'Website Redesign');
        strict_1.default.equal(view.client?.name, 'Acme Co');
        strict_1.default.equal(view.progress.total, 2);
        strict_1.default.equal(view.progress.completed, 1);
        strict_1.default.equal(view.progress.percent, 50);
        // Every task exposes exactly the safe key-set — no internal fields.
        for (const task of view.tasks) {
            strict_1.default.deepEqual(Object.keys(task).sort(), SAFE_TASK_KEYS);
        }
        const serialized = JSON.stringify(view);
        strict_1.default.equal(serialized.includes('internal@aura.agency'), false, 'no assignee email leaks');
        strict_1.default.equal(serialized.includes('INTERNAL'), false, 'no internal notes leak');
        strict_1.default.equal(serialized.includes('urgent'), false, 'no priority leaks');
    });
    (0, node_test_1.it)('hides completed tasks when show_completed is false (progress stays accurate)', async () => {
        const portal = { ...basePortal, showCompleted: false };
        const svc = new client_portal_service_1.ClientPortalService(dbFor(portal, [OPEN_TASK, DONE_TASK]));
        const view = await svc.getPublicView('tok');
        strict_1.default.equal(view.tasks.length, 1);
        strict_1.default.equal(view.tasks[0].id, 'task-open');
        // Progress still counts the hidden completed task.
        strict_1.default.equal(view.progress.total, 2);
        strict_1.default.equal(view.progress.completed, 1);
        strict_1.default.equal(view.showCompleted, false);
    });
    (0, node_test_1.it)('includes completed tasks when show_completed is true', async () => {
        const svc = new client_portal_service_1.ClientPortalService(dbFor(basePortal, [OPEN_TASK, DONE_TASK]));
        const view = await svc.getPublicView('tok');
        strict_1.default.equal(view.tasks.length, 2);
    });
    (0, node_test_1.it)('404s a disabled portal (opaque — same as missing)', async () => {
        const portal = { ...basePortal, isEnabled: false };
        const svc = new client_portal_service_1.ClientPortalService(dbFor(portal, []));
        await strict_1.default.rejects(() => svc.getPublicView('tok'), /Portal not found/);
    });
    (0, node_test_1.it)('404s an unknown token without touching project/task data', async () => {
        const svc = new client_portal_service_1.ClientPortalService(makeDb(() => []));
        await strict_1.default.rejects(() => svc.getPublicView('nope'), /Portal not found/);
    });
    (0, node_test_1.it)('uses the portal display name over the project name when set', async () => {
        const portal = { ...basePortal, name: 'Acme Project Hub' };
        const svc = new client_portal_service_1.ClientPortalService(dbFor(portal, []));
        const view = await svc.getPublicView('tok');
        strict_1.default.equal(view.portal.name, 'Acme Project Hub');
        strict_1.default.equal(view.project.name, 'Website Redesign');
    });
});
//# sourceMappingURL=client-portal.service.test.js.map