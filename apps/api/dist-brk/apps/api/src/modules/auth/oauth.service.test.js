"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const oauth_service_1 = require("./oauth.service");
/**
 * Security regression: the Google/Microsoft provider access & refresh tokens
 * are used only transiently during the OAuth callback (to fetch the profile)
 * and are never read back anywhere in the app. `upsertUserAndLink` must NOT
 * persist them — it writes null into oauth_accounts.access_token/refresh_token
 * so there is no plaintext-secret-at-rest liability.
 */
function buildDb(limitResults) {
    let call = 0;
    const inserts = [];
    const updates = [];
    const db = {
        select: () => ({
            from: () => ({
                where: () => ({
                    limit: async () => limitResults[call++] ?? [],
                }),
            }),
        }),
        insert: () => ({
            values: (v) => {
                inserts.push(v);
                const awaitable = Promise.resolve(undefined);
                awaitable.returning = async () => [{ id: 'user-1', email: v.email, displayName: v.displayName }];
                return awaitable;
            },
        }),
        update: () => ({
            set: (v) => {
                updates.push(v);
                return { where: async () => undefined };
            },
        }),
    };
    return { db, inserts, updates };
}
function buildService(limitResults) {
    const { db, inserts, updates } = buildDb(limitResults);
    const config = {}; // not used by upsertUserAndLink
    const security = { logAuditEvent: node_test_1.mock.fn(async () => undefined) };
    return { svc: new oauth_service_1.OAuthService(db, config, security), inserts, updates };
}
const PROFILE = { providerId: 'g-123', email: 'new@acme.test', displayName: 'New User', avatarUrl: null };
const TOKENS = { accessToken: 'ya29.SUPER_SECRET', refreshToken: 'rt.SUPER_SECRET', expiresAt: new Date() };
(0, node_test_1.describe)('OAuthService.upsertUserAndLink — provider tokens are not stored at rest', () => {
    (0, node_test_1.it)('inserts a new oauth_accounts row with null tokens (new user + new link)', async () => {
        const { svc, inserts } = buildService([[], []]); // no existing user, no existing link
        await svc.upsertUserAndLink('google', PROFILE, TOKENS);
        const oauthInsert = inserts.find((i) => 'provider' in i && 'accessToken' in i);
        strict_1.default.ok(oauthInsert, 'expected an oauth_accounts insert');
        strict_1.default.equal(oauthInsert.accessToken, null);
        strict_1.default.equal(oauthInsert.refreshToken, null);
        strict_1.default.equal(oauthInsert.expiresAt, null);
        // The real token material must never reach the database.
        strict_1.default.doesNotMatch(JSON.stringify(inserts), /SUPER_SECRET/);
    });
    (0, node_test_1.it)('nulls the tokens when refreshing an existing oauth_accounts link', async () => {
        const existingUser = {
            id: 'user-1',
            email: 'new@acme.test',
            displayName: 'New User',
            avatarUrl: null,
            emailVerified: true,
        };
        const existingLink = { id: 'link-1' };
        // 1st select → existing user; 2nd select → existing link.
        const { svc, updates } = buildService([[existingUser], [existingLink]]);
        await svc.upsertUserAndLink('google', PROFILE, TOKENS);
        const oauthUpdate = updates.find((u) => 'accessToken' in u);
        strict_1.default.ok(oauthUpdate, 'expected an oauth_accounts update');
        strict_1.default.equal(oauthUpdate.accessToken, null);
        strict_1.default.equal(oauthUpdate.refreshToken, null);
        strict_1.default.equal(oauthUpdate.expiresAt, null);
        strict_1.default.doesNotMatch(JSON.stringify(updates), /SUPER_SECRET/);
    });
});
//# sourceMappingURL=oauth.service.test.js.map