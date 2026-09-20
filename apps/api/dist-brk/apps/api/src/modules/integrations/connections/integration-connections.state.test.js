"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const node_crypto_1 = require("node:crypto");
const integration_connections_service_1 = require("./integration-connections.service");
/**
 * Integration OAuth `state` signing key. The state is the CSRF/binding token
 * round-tripped through the provider, so its HMAC key must be a real secret.
 * The previous code keyed it on a never-defined `JWT_SECRET` env var and a
 * hardcoded literal (a forgeable, predictable key). It is now keyed on
 * `JWT_ACCESS_SECRET` via `getOrThrow` (mirroring social-login OAuthService),
 * with an optional dedicated override — and never on a predictable fallback.
 */
/** Deterministic ConfigService stub (independent of process.env). */
function fakeConfig(vals) {
    return {
        get(key) {
            return vals[key];
        },
        getOrThrow(key) {
            const v = vals[key];
            if (v === undefined || v === null)
                throw new Error(`Configuration key "${key}" does not exist`);
            return v;
        },
    };
}
const makeSvc = (vals) => 
// The fifth argument is CalendarAccountsService (§V2-14). These checks only
// exercise OAuth state signing, so every collaborator is a stub.
new integration_connections_service_1.IntegrationConnectionsService({}, {}, fakeConfig(vals), {}, {});
const payload = { provider: 'github', workspaceId: 'w1', userId: 'u1', ts: 1_700_000_000_000 };
(0, node_test_1.describe)('IntegrationConnectionsService OAuth state secret', () => {
    (0, node_test_1.it)('signs the state with JWT_ACCESS_SECRET when no dedicated secret is set', () => {
        const svc = makeSvc({ JWT_ACCESS_SECRET: 'jwt-access-key' });
        const state = svc.signState(payload);
        const [body, sig] = state.split('.');
        const expected = (0, node_crypto_1.createHmac)('sha256', 'jwt-access-key').update(body).digest('base64url');
        strict_1.default.equal(sig, expected, 'signature is keyed on JWT_ACCESS_SECRET');
    });
    (0, node_test_1.it)('verifies a state signed with the same key and rejects one signed with a different key', () => {
        const svc = makeSvc({ JWT_ACCESS_SECRET: 'jwt-access-key' });
        const state = svc.signState(payload);
        const verified = svc.verifyState(state);
        strict_1.default.equal(verified.workspaceId, 'w1');
        strict_1.default.equal(verified.provider, 'github');
        const other = makeSvc({ JWT_ACCESS_SECRET: 'a-completely-different-key' });
        strict_1.default.throws(() => other.verifyState(state), /Invalid OAuth signature/);
    });
    (0, node_test_1.it)('prefers INTEGRATIONS_OAUTH_STATE_SECRET over JWT_ACCESS_SECRET when present', () => {
        const svc = makeSvc({ INTEGRATIONS_OAUTH_STATE_SECRET: 'dedicated-secret', JWT_ACCESS_SECRET: 'jwt-access-key' });
        const state = svc.signState(payload);
        const [body, sig] = state.split('.');
        strict_1.default.equal(sig, (0, node_crypto_1.createHmac)('sha256', 'dedicated-secret').update(body).digest('base64url'));
    });
    (0, node_test_1.it)('never falls back to a predictable/empty key — throws when nothing is configured', () => {
        const svc = makeSvc({});
        strict_1.default.throws(() => svc.signState(payload), /JWT_ACCESS_SECRET/);
        // Regression guard: the removed hardcoded literal must not verify a state.
        const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const legacySig = (0, node_crypto_1.createHmac)('sha256', 'rundesk-oauth-state').update(body).digest('base64url');
        const legacyState = `${body}.${legacySig}`;
        const svcWithKey = makeSvc({ JWT_ACCESS_SECRET: 'jwt-access-key' });
        strict_1.default.throws(() => svcWithKey.verifyState(legacyState), /Invalid OAuth signature/);
    });
});
//# sourceMappingURL=integration-connections.state.test.js.map