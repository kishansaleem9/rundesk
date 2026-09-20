"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_crypto_1 = require("node:crypto");
const node_test_1 = require("node:test");
const sso_service_1 = require("./sso.service");
function buildService() {
    const db = {};
    const config = {
        get: node_test_1.mock.fn(() => 'http://localhost:3001'),
        getOrThrow: node_test_1.mock.fn(() => 'http://localhost:3001'),
    };
    const security = { logAuditEvent: node_test_1.mock.fn(async () => undefined) };
    return new sso_service_1.SsoService(db, config, security);
}
(0, node_test_1.describe)('SsoService SCIM helpers', () => {
    (0, node_test_1.it)('hashScimToken returns deterministic sha256 hash', () => {
        const svc = buildService();
        const out = svc.hashScimToken('scim_test-token');
        const expected = (0, node_crypto_1.createHash)('sha256').update('scim_test-token').digest('hex');
        strict_1.default.equal(out, expected);
    });
    (0, node_test_1.it)('generateScimToken returns a scim_-prefixed token with matching sha256 hash', () => {
        const svc = buildService();
        const { raw, hash, prefix } = svc.generateScimToken();
        strict_1.default.ok(raw.startsWith('scim_'), 'raw token must start with scim_');
        strict_1.default.equal(prefix.length, 12, 'prefix must be 12 chars for display');
        strict_1.default.equal(raw.slice(0, 12), prefix, 'prefix must match the raw token prefix');
        strict_1.default.equal(hash, (0, node_crypto_1.createHash)('sha256').update(raw).digest('hex'));
    });
    (0, node_test_1.it)('generates unique tokens across multiple calls', () => {
        const svc = buildService();
        const a = svc.generateScimToken();
        const b = svc.generateScimToken();
        strict_1.default.notEqual(a.raw, b.raw);
        strict_1.default.notEqual(a.hash, b.hash);
    });
});
//# sourceMappingURL=sso.service.test.js.map