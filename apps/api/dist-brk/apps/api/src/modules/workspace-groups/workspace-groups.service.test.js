"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const workspace_groups_service_1 = require("./workspace-groups.service");
function buildDb(opts = {}) {
    // We return a chainable .from().where()[.orderBy()] that resolves to the
    // appropriate fixture based on which call mode is exercised by the test.
    return {
        select: node_test_1.mock.fn(() => ({
            from: node_test_1.mock.fn(() => {
                if (opts.selectValidMembers !== undefined) {
                    return {
                        where: node_test_1.mock.fn(async () => opts.selectValidMembers.map((userId) => ({ userId }))),
                    };
                }
                return {
                    where: node_test_1.mock.fn(() => ({
                        orderBy: node_test_1.mock.fn(async () => opts.selectGroups ?? []),
                    })),
                };
            }),
        })),
        insert: node_test_1.mock.fn(() => ({
            values: node_test_1.mock.fn(() => ({
                returning: node_test_1.mock.fn(async () => [{ id: 'g-1', name: 'Engineering' }]),
                onConflictDoNothing: node_test_1.mock.fn(async () => undefined),
            })),
        })),
    };
}
function buildSvc(dbOpts) {
    const db = buildDb(dbOpts);
    const security = { logAuditEvent: node_test_1.mock.fn(async () => undefined) };
    return { svc: new workspace_groups_service_1.WorkspaceGroupsService(db, security), db, security };
}
(0, node_test_1.describe)('WorkspaceGroupsService', () => {
    (0, node_test_1.it)('list() returns empty array when no groups exist (skips member lookup)', async () => {
        const { svc } = buildSvc({ selectGroups: [] });
        const result = await svc.list('ws-1');
        strict_1.default.deepEqual(result, []);
    });
    (0, node_test_1.it)('create() rejects empty / whitespace name', async () => {
        const { svc } = buildSvc();
        await strict_1.default.rejects(() => svc.create('ws-1', 'actor-1', { name: '   ' }), (e) => e instanceof common_1.BadRequestException);
    });
    (0, node_test_1.it)('create() rejects when supplied memberIds are not workspace members', async () => {
        // First select() is for assertMembersOfWorkspace -> returns only u-known
        // We want the workspace validation to flag u-unknown as missing
        const { svc } = buildSvc({ selectValidMembers: ['u-known'] });
        await strict_1.default.rejects(() => svc.create('ws-1', 'actor-1', { name: 'Engineering', memberIds: ['u-known', 'u-unknown'] }), (e) => e instanceof common_1.BadRequestException && /not workspace members/i.test(e.message));
    });
});
(0, node_test_1.describe)('normalizeGroupAlias (§A4.3)', () => {
    (0, node_test_1.it)('strips a leading @ and lowercases, so @Design and design are one handle', () => {
        strict_1.default.equal((0, workspace_groups_service_1.normalizeGroupAlias)('@Design'), 'design');
        strict_1.default.equal((0, workspace_groups_service_1.normalizeGroupAlias)('design'), 'design');
    });
    (0, node_test_1.it)('folds accents and spaces into a typeable handle', () => {
        strict_1.default.equal((0, workspace_groups_service_1.normalizeGroupAlias)('Diseño Gráfico'), 'diseno-grafico');
    });
    (0, node_test_1.it)('returns null when nothing usable survives, leaving the team un-mentionable', () => {
        strict_1.default.equal((0, workspace_groups_service_1.normalizeGroupAlias)('!!!'), null);
        strict_1.default.equal((0, workspace_groups_service_1.normalizeGroupAlias)('a'), null);
        strict_1.default.equal((0, workspace_groups_service_1.normalizeGroupAlias)(null), null);
    });
    (0, node_test_1.it)('caps the handle so a pathological name cannot mint a 500-character mention', () => {
        strict_1.default.equal((0, workspace_groups_service_1.normalizeGroupAlias)('x'.repeat(200)), 'x'.repeat(32));
    });
});
//# sourceMappingURL=workspace-groups.service.test.js.map