"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZapierCtx = exports.ZapierApiKeyGuard = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const crypto = __importStar(require("crypto"));
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
/**
 * Authenticates Zapier (and any programmatic) requests with a workspace API key
 * — the SAME `api_keys` records issued from Settings → Security (`rd_live_…`),
 * created/revoked by {@link ../security/security.service SecurityService}. We
 * reuse that existing key store: no new table, no migration.
 *
 * The Zapier REST-Hook routes have no `:workspaceId` path param, so the caller's
 * workspace has to come from the credential itself — and an API key is bound to
 * exactly one workspace, which is why it is the right mechanism here (a raw JWT
 * session token is not scoped to a single workspace).
 *
 * The key may be presented either as `Authorization: Bearer <key>` (Zapier's
 * default for API-key auth) or `X-API-Key: <key>`. On success we attach:
 *   req.apiKey       – the full api_keys row
 *   req.workspaceId  – the key's workspace
 *   req.user         – { id: <createdById>, … } so `@CurrentUser()` keeps working
 */
let ZapierApiKeyGuard = class ZapierApiKeyGuard {
    constructor(db) {
        this.db = db;
    }
    async canActivate(ctx) {
        const req = ctx.switchToHttp().getRequest();
        const raw = extractApiKey(req);
        if (!raw)
            throw new common_1.UnauthorizedException('Missing API key');
        const keyHash = crypto.createHash('sha256').update(raw).digest('hex');
        const [row] = await this.db
            .select()
            .from(db_1.apiKeys)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.apiKeys.keyHash, keyHash), (0, drizzle_orm_1.eq)(db_1.apiKeys.isRevoked, false)))
            .limit(1);
        if (!row)
            throw new common_1.UnauthorizedException('Invalid API key');
        if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) {
            throw new common_1.UnauthorizedException('API key has expired');
        }
        req.apiKey = row;
        req.workspaceId = row.workspaceId;
        req.user = { id: row.createdById, apiKeyId: row.id, scope: row.scope };
        // Best-effort usage bookkeeping — must never block or fail the request.
        void (async () => {
            try {
                await this.db
                    .update(db_1.apiKeys)
                    .set({ lastUsedAt: new Date(), requestCount: (0, drizzle_orm_1.sql) `${db_1.apiKeys.requestCount} + 1` })
                    .where((0, drizzle_orm_1.eq)(db_1.apiKeys.id, row.id));
            }
            catch {
                /* usage stats are best-effort */
            }
        })();
        return true;
    }
};
exports.ZapierApiKeyGuard = ZapierApiKeyGuard;
exports.ZapierApiKeyGuard = ZapierApiKeyGuard = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], ZapierApiKeyGuard);
function extractApiKey(req) {
    const headers = req.headers ?? {};
    const auth = headers['authorization'];
    if (typeof auth === 'string') {
        const match = /^bearer\s+(.+)$/i.exec(auth.trim());
        if (match)
            return match[1].trim();
    }
    const apiKeyHeader = headers['x-api-key'];
    if (typeof apiKeyHeader === 'string' && apiKeyHeader.trim())
        return apiKeyHeader.trim();
    return null;
}
/**
 * Pulls the workspace + user resolved by {@link ZapierApiKeyGuard} off the
 * request, so controllers stay free of raw request handling.
 */
exports.ZapierCtx = (0, common_1.createParamDecorator)((_data, ctx) => {
    const req = ctx.switchToHttp().getRequest();
    return {
        workspaceId: req.workspaceId,
        userId: req.user?.id,
        apiKey: req.apiKey,
    };
});
//# sourceMappingURL=zapier-api-key.guard.js.map