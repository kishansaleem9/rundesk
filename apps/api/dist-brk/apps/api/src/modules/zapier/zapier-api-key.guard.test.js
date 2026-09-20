"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const common_1 = require("@nestjs/common");
const zapier_api_key_guard_1 = require("./zapier-api-key.guard");
// select().from().where().limit() resolves to `rows`. No `update` is provided —
// the guard's best-effort usage write must swallow that failure.
function makeDb(rows) {
    const chain = {};
    chain.from = () => chain;
    chain.where = () => chain;
    chain.limit = () => Promise.resolve(rows);
    return { select: () => chain };
}
function ctxFor(headers) {
    const req = { headers };
    const ctx = { switchToHttp: () => ({ getRequest: () => req }) };
    return { ctx, req };
}
const KEY_ROW = {
    id: 'key-1',
    workspaceId: 'ws-1',
    createdById: 'user-1',
    scope: 'read_write',
    isRevoked: false,
    expiresAt: null,
    requestCount: 0,
};
(0, node_test_1.describe)('ZapierApiKeyGuard', () => {
    (0, node_test_1.it)('rejects a request with no API key', async () => {
        const guard = new zapier_api_key_guard_1.ZapierApiKeyGuard(makeDb([]));
        const { ctx } = ctxFor({});
        await strict_1.default.rejects(() => guard.canActivate(ctx), common_1.UnauthorizedException);
    });
    (0, node_test_1.it)('rejects an unknown / revoked key', async () => {
        const guard = new zapier_api_key_guard_1.ZapierApiKeyGuard(makeDb([]));
        const { ctx } = ctxFor({ authorization: 'Bearer rd_live_deadbeef' });
        await strict_1.default.rejects(() => guard.canActivate(ctx), common_1.UnauthorizedException);
    });
    (0, node_test_1.it)('authenticates a valid Bearer key and attaches workspace + user context', async () => {
        const guard = new zapier_api_key_guard_1.ZapierApiKeyGuard(makeDb([KEY_ROW]));
        const { ctx, req } = ctxFor({ authorization: 'Bearer rd_live_whatever' });
        strict_1.default.equal(await guard.canActivate(ctx), true);
        strict_1.default.equal(req.workspaceId, 'ws-1');
        strict_1.default.equal(req.user.id, 'user-1');
    });
    (0, node_test_1.it)('accepts the key via the X-API-Key header too', async () => {
        const guard = new zapier_api_key_guard_1.ZapierApiKeyGuard(makeDb([KEY_ROW]));
        const { ctx, req } = ctxFor({ 'x-api-key': 'rd_live_whatever' });
        strict_1.default.equal(await guard.canActivate(ctx), true);
        strict_1.default.equal(req.workspaceId, 'ws-1');
    });
    (0, node_test_1.it)('rejects an expired key', async () => {
        const guard = new zapier_api_key_guard_1.ZapierApiKeyGuard(makeDb([{ ...KEY_ROW, expiresAt: new Date(Date.now() - 1000) }]));
        const { ctx } = ctxFor({ authorization: 'Bearer rd_live_expired' });
        await strict_1.default.rejects(() => guard.canActivate(ctx), common_1.UnauthorizedException);
    });
});
//# sourceMappingURL=zapier-api-key.guard.test.js.map