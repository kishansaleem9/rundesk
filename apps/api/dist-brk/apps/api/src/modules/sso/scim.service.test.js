"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_crypto_1 = require("node:crypto");
const node_test_1 = require("node:test");
const scim_service_1 = require("./scim.service");
function buildDb(fixture) {
    return {
        select: node_test_1.mock.fn(() => ({
            from: node_test_1.mock.fn(() => ({
                where: node_test_1.mock.fn(() => ({
                    limit: node_test_1.mock.fn(async () => (fixture.scimRow ? [fixture.scimRow] : [])),
                })),
            })),
        })),
        update: node_test_1.mock.fn(() => ({
            set: node_test_1.mock.fn(() => ({
                where: node_test_1.mock.fn(async () => undefined),
            })),
        })),
    };
}
function buildService(fixture) {
    const db = buildDb(fixture);
    const security = { logAuditEvent: node_test_1.mock.fn(async () => undefined) };
    const groups = {};
    return { svc: new scim_service_1.ScimService(db, security, groups), db, security };
}
function sha256(raw) {
    return (0, node_crypto_1.createHash)('sha256').update(raw).digest('hex');
}
(0, node_test_1.describe)('ScimService discovery endpoints', () => {
    (0, node_test_1.it)('exposes ServiceProviderConfig advertising PATCH + filter support', () => {
        const { svc } = buildService({ scimRow: null });
        const config = svc.serviceProviderConfig();
        strict_1.default.equal(config.patch.supported, true);
        strict_1.default.equal(config.bulk.supported, false);
        strict_1.default.equal(config.filter.supported, true);
        strict_1.default.ok(config.authenticationSchemes.some((s) => s.type === 'oauthbearertoken'), 'should advertise oauth bearer token auth');
    });
    (0, node_test_1.it)('schemas() includes both User and Group resources', () => {
        const { svc } = buildService({ scimRow: null });
        const result = svc.schemas();
        const ids = result.Resources.map((r) => r.id);
        strict_1.default.ok(ids.includes('urn:ietf:params:scim:schemas:core:2.0:User'));
        strict_1.default.ok(ids.includes('urn:ietf:params:scim:schemas:core:2.0:Group'));
    });
    (0, node_test_1.it)('resourceTypes() includes both Users and Groups endpoints', () => {
        const { svc } = buildService({ scimRow: null });
        const result = svc.resourceTypes();
        const endpoints = result.Resources.map((r) => r.endpoint);
        strict_1.default.deepEqual(new Set(endpoints), new Set(['/Users', '/Groups']));
    });
});
(0, node_test_1.describe)('ScimService.authenticate', () => {
    const sample = (raw, overrides = {}) => ({
        id: 'tok-1',
        workspaceId: 'ws-1',
        tokenHash: sha256(raw),
        revokedAt: null,
        expiresAt: null,
        ...overrides,
    });
    (0, node_test_1.it)('rejects missing token with 401', async () => {
        const { svc } = buildService({ scimRow: null });
        await strict_1.default.rejects(() => svc.authenticate(undefined), (e) => e instanceof common_1.UnauthorizedException);
    });
    (0, node_test_1.it)('rejects token without scim_ prefix', async () => {
        const { svc } = buildService({ scimRow: null });
        await strict_1.default.rejects(() => svc.authenticate('Bearer-style-junk'), (e) => e instanceof common_1.UnauthorizedException);
    });
    (0, node_test_1.it)('rejects unknown SCIM token', async () => {
        const { svc } = buildService({ scimRow: null });
        await strict_1.default.rejects(() => svc.authenticate('scim_unknown'), (e) => e instanceof common_1.UnauthorizedException);
    });
    (0, node_test_1.it)('rejects revoked SCIM token', async () => {
        const raw = 'scim_revoked';
        const { svc } = buildService({ scimRow: sample(raw, { revokedAt: new Date() }) });
        await strict_1.default.rejects(() => svc.authenticate(raw), (e) => e instanceof common_1.UnauthorizedException && /revoked/i.test(e.message));
    });
    (0, node_test_1.it)('rejects expired SCIM token', async () => {
        const raw = 'scim_expired';
        const past = new Date(Date.now() - 60_000);
        const { svc } = buildService({ scimRow: sample(raw, { expiresAt: past }) });
        await strict_1.default.rejects(() => svc.authenticate(raw), (e) => e instanceof common_1.UnauthorizedException && /expired/i.test(e.message));
    });
    (0, node_test_1.it)('returns workspaceId for a valid SCIM token', async () => {
        const raw = 'scim_valid';
        const { svc } = buildService({ scimRow: sample(raw) });
        const workspaceId = await svc.authenticate(raw);
        strict_1.default.equal(workspaceId, 'ws-1');
    });
});
//# sourceMappingURL=scim.service.test.js.map