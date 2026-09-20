"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const jwt_strategy_1 = require("./jwt.strategy");
// The dual extractor is the heart of Plan §1.1's "cookies for browsers, Bearer
// still works" requirement, so it is unit-tested directly.
(0, node_test_1.default)('cookieOrBearerExtractor prefers the access_token cookie over the Bearer header', () => {
    const req = { cookies: { access_token: 'cookie-jwt' }, headers: { authorization: 'Bearer header-jwt' } };
    strict_1.default.equal((0, jwt_strategy_1.cookieOrBearerExtractor)(req), 'cookie-jwt');
});
(0, node_test_1.default)('cookieOrBearerExtractor falls back to the Bearer header when no cookie is present', () => {
    const req = { cookies: {}, headers: { authorization: 'Bearer header-jwt' } };
    strict_1.default.equal((0, jwt_strategy_1.cookieOrBearerExtractor)(req), 'header-jwt');
});
(0, node_test_1.default)('cookieOrBearerExtractor tolerates a missing cookies object (Bearer only)', () => {
    const req = { headers: { authorization: 'Bearer only-bearer' } };
    strict_1.default.equal((0, jwt_strategy_1.cookieOrBearerExtractor)(req), 'only-bearer');
});
(0, node_test_1.default)('cookieOrBearerExtractor returns null when neither cookie nor Bearer header is present', () => {
    const req = { cookies: {}, headers: {} };
    strict_1.default.equal((0, jwt_strategy_1.cookieOrBearerExtractor)(req), null);
});
//# sourceMappingURL=jwt.strategy.test.js.map