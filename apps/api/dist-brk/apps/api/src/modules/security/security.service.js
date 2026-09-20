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
exports.SecurityService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const crypto = __importStar(require("crypto"));
const OTPAuth = __importStar(require("otpauth"));
const bcrypt = __importStar(require("bcryptjs"));
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
// ─── TOTP / 2FA ───────────────────────────────────────────────────────────────
let SecurityService = class SecurityService {
    constructor(db) {
        this.db = db;
    }
    // ── TOTP setup ──────────────────────────────────────────────────────────────
    async setupTotp(userId) {
        const [user] = await this.db.select({ email: db_1.users.email, displayName: db_1.users.displayName }).from(db_1.users).where((0, drizzle_orm_1.eq)(db_1.users.id, userId));
        if (!user)
            throw new common_1.NotFoundException('User not found');
        // Delete any unverified existing secret
        await this.db.delete(db_1.userTotpSecrets).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.userTotpSecrets.userId, userId), (0, drizzle_orm_1.eq)(db_1.userTotpSecrets.verified, false)));
        const totp = new OTPAuth.TOTP({
            issuer: 'Rundesk',
            label: user.email,
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret: OTPAuth.Secret.fromUTF8(crypto.randomBytes(20).toString('hex').slice(0, 32)),
        });
        const secret = totp.secret.base32;
        await this.db.insert(db_1.userTotpSecrets).values({ userId, secret, verified: false });
        // Return the raw otpauth:// URI so the CLIENT renders the QR code locally.
        // We must never send the TOTP seed to a third party — the previous Google
        // Charts QR URL embedded the base32 secret in a request to
        // chart.googleapis.com (also a deprecated/dead API).
        const otpauthUrl = totp.toString();
        return { otpauthUrl, secret };
    }
    async verifyAndActivateTotp(userId, code) {
        const [row] = await this.db.select().from(db_1.userTotpSecrets).where((0, drizzle_orm_1.eq)(db_1.userTotpSecrets.userId, userId));
        if (!row)
            throw new common_1.BadRequestException('TOTP setup not started');
        const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(row.secret), algorithm: 'SHA1', digits: 6, period: 30 });
        const valid = totp.validate({ token: code, window: 1 });
        if (valid === null)
            throw new common_1.BadRequestException('Invalid TOTP code');
        // Generate 10 backup codes
        const rawCodes = Array.from({ length: 10 }, () => crypto.randomBytes(5).toString('hex').toUpperCase());
        const hashedCodes = await Promise.all(rawCodes.map((c) => bcrypt.hash(c, 10)));
        await this.db
            .update(db_1.userTotpSecrets)
            .set({ verified: true, verifiedAt: new Date(), backupCodes: hashedCodes })
            .where((0, drizzle_orm_1.eq)(db_1.userTotpSecrets.userId, userId));
        await this.logAuditEvent({
            actorId: userId,
            action: '2fa.enabled',
            resourceType: 'user',
            resourceId: userId,
            description: 'Two-factor authentication enabled',
        });
        return { backupCodes: rawCodes };
    }
    async validateTotp(userId, code) {
        const [row] = await this.db.select().from(db_1.userTotpSecrets).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.userTotpSecrets.userId, userId), (0, drizzle_orm_1.eq)(db_1.userTotpSecrets.verified, true)));
        if (!row)
            return true; // 2FA not set up — allow through
        const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(row.secret), algorithm: 'SHA1', digits: 6, period: 30 });
        const valid = totp.validate({ token: code, window: 1 });
        if (valid !== null)
            return true;
        // Check backup codes
        const codes = row.backupCodes ?? [];
        for (let i = 0; i < codes.length; i++) {
            if (await bcrypt.compare(code, codes[i])) {
                // Remove used backup code
                const remaining = codes.filter((_, idx) => idx !== i);
                await this.db.update(db_1.userTotpSecrets).set({ backupCodes: remaining }).where((0, drizzle_orm_1.eq)(db_1.userTotpSecrets.userId, userId));
                return true;
            }
        }
        return false;
    }
    async disableTotp(userId) {
        await this.db.delete(db_1.userTotpSecrets).where((0, drizzle_orm_1.eq)(db_1.userTotpSecrets.userId, userId));
        await this.logAuditEvent({
            actorId: userId,
            action: '2fa.disabled',
            resourceType: 'user',
            resourceId: userId,
            description: 'Two-factor authentication disabled',
        });
    }
    async getTotpStatus(userId) {
        const [row] = await this.db.select({ verified: db_1.userTotpSecrets.verified }).from(db_1.userTotpSecrets).where((0, drizzle_orm_1.eq)(db_1.userTotpSecrets.userId, userId));
        return { enabled: row?.verified ?? false };
    }
    // ─── API Keys ──────────────────────────────────────────────────────────────
    async listApiKeys(workspaceId) {
        return this.db
            .select({
            id: db_1.apiKeys.id,
            name: db_1.apiKeys.name,
            keyPrefix: db_1.apiKeys.keyPrefix,
            scope: db_1.apiKeys.scope,
            isRevoked: db_1.apiKeys.isRevoked,
            lastUsedAt: db_1.apiKeys.lastUsedAt,
            requestCount: db_1.apiKeys.requestCount,
            expiresAt: db_1.apiKeys.expiresAt,
            createdAt: db_1.apiKeys.createdAt,
        })
            .from(db_1.apiKeys)
            .where((0, drizzle_orm_1.eq)(db_1.apiKeys.workspaceId, workspaceId))
            .orderBy((0, drizzle_orm_1.desc)(db_1.apiKeys.createdAt));
    }
    async createApiKey(workspaceId, userId, name, scope = 'read_write', ipAddress) {
        // Generate a secure random key: rd_live_<32 hex chars>
        const raw = `rd_live_${crypto.randomBytes(16).toString('hex')}`;
        const keyPrefix = raw.slice(0, 12); // rd_live_xxxx
        const keyHash = crypto.createHash('sha256').update(raw).digest('hex');
        const [key] = await this.db
            .insert(db_1.apiKeys)
            .values({ workspaceId, createdById: userId, name, keyHash, keyPrefix, scope })
            .returning({
            id: db_1.apiKeys.id,
            name: db_1.apiKeys.name,
            keyPrefix: db_1.apiKeys.keyPrefix,
            scope: db_1.apiKeys.scope,
            createdAt: db_1.apiKeys.createdAt,
        });
        await this.logAuditEvent({
            workspaceId,
            actorId: userId,
            action: 'api_key.created',
            resourceType: 'api_key',
            resourceId: key.id,
            description: `Created API key "${name}"`,
            metadata: { name, scope, keyPrefix },
            ipAddress,
        });
        // Return the raw key only this once — never stored in plaintext
        return { ...key, key: raw };
    }
    async assertApiKeyOwnership(workspaceId, keyId) {
        const [row] = await this.db
            .select()
            .from(db_1.apiKeys)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.apiKeys.id, keyId), (0, drizzle_orm_1.eq)(db_1.apiKeys.workspaceId, workspaceId)))
            .limit(1);
        if (!row)
            throw new common_1.NotFoundException('API key not found');
        return row;
    }
    async revokeApiKey(workspaceId, keyId, actorId, ipAddress) {
        const row = await this.assertApiKeyOwnership(workspaceId, keyId);
        await this.db.update(db_1.apiKeys).set({ isRevoked: true }).where((0, drizzle_orm_1.eq)(db_1.apiKeys.id, keyId));
        await this.logAuditEvent({
            workspaceId,
            actorId,
            action: 'api_key.revoked',
            resourceType: 'api_key',
            resourceId: keyId,
            description: `Revoked API key "${row.name}"`,
            metadata: { name: row.name, keyPrefix: row.keyPrefix },
            ipAddress,
        });
        return { ok: true };
    }
    async deleteApiKey(workspaceId, keyId, actorId, ipAddress) {
        const row = await this.assertApiKeyOwnership(workspaceId, keyId);
        await this.db.delete(db_1.apiKeys).where((0, drizzle_orm_1.eq)(db_1.apiKeys.id, keyId));
        await this.logAuditEvent({
            workspaceId,
            actorId,
            action: 'api_key.deleted',
            resourceType: 'api_key',
            resourceId: keyId,
            description: `Deleted API key "${row.name}"`,
            metadata: { name: row.name, keyPrefix: row.keyPrefix },
            ipAddress,
        });
        return { ok: true };
    }
    // ─── Audit Logs ───────────────────────────────────────────────────────────
    async logAuditEvent(opts) {
        await this.db.insert(db_1.auditLogs).values(opts);
    }
    auditFilters(workspaceId, opts) {
        const filters = [(0, drizzle_orm_1.eq)(db_1.auditLogs.workspaceId, workspaceId)];
        if (opts.action)
            filters.push((0, drizzle_orm_1.eq)(db_1.auditLogs.action, opts.action));
        // Action-type grouping (Plan §13.3): a group like "Members" spans several
        // prefixes (member., role.), so match ANY of the supplied prefixes. Single
        // `actionPrefix` is folded in for backward compatibility.
        const prefixes = [...(opts.actionPrefix ? [opts.actionPrefix] : []), ...(opts.actionPrefixes ?? [])].filter(Boolean);
        if (prefixes.length) {
            const likes = prefixes.map((p) => (0, drizzle_orm_1.like)(db_1.auditLogs.action, `${p}%`));
            filters.push(likes.length === 1 ? likes[0] : (0, drizzle_orm_1.or)(...likes));
        }
        if (opts.actorId)
            filters.push((0, drizzle_orm_1.eq)(db_1.auditLogs.actorId, opts.actorId));
        if (opts.from)
            filters.push((0, drizzle_orm_1.gte)(db_1.auditLogs.createdAt, opts.from));
        if (opts.to)
            filters.push((0, drizzle_orm_1.lte)(db_1.auditLogs.createdAt, opts.to));
        return filters;
    }
    async getAuditLogs(workspaceId, opts = {}) {
        const limit = Math.min(opts.limit ?? 50, 200);
        const offset = ((opts.page ?? 1) - 1) * limit;
        const rows = await this.db
            .select()
            .from(db_1.auditLogs)
            .where((0, drizzle_orm_1.and)(...this.auditFilters(workspaceId, opts)))
            .orderBy((0, drizzle_orm_1.desc)(db_1.auditLogs.createdAt))
            .limit(limit)
            .offset(offset);
        return rows;
    }
    /** Export the (filtered) audit trail as a CSV string (Plan §13.3). */
    async exportAuditLogsCsv(workspaceId, opts = {}) {
        const rows = await this.db
            .select()
            .from(db_1.auditLogs)
            .where((0, drizzle_orm_1.and)(...this.auditFilters(workspaceId, opts)))
            .orderBy((0, drizzle_orm_1.desc)(db_1.auditLogs.createdAt))
            .limit(10000);
        const esc = (v) => {
            let s = String(v ?? '');
            // Neutralize spreadsheet formula/CSV injection: a cell that begins with
            // =, +, -, @, tab, or CR can be executed as a formula by Excel/Sheets.
            // Prefix such values with a single quote before quoting the field.
            if (/^[=+\-@\t\r]/.test(s))
                s = `'${s}`;
            return `"${s.replace(/"/g, '""')}"`;
        };
        const header = ['Timestamp', 'Actor', 'Action', 'Resource', 'Description', 'IP address'];
        const lines = rows.map((r) => [
            r.createdAt.toISOString(),
            r.actorEmail ?? r.actorId ?? '',
            r.action,
            [r.resourceType, r.resourceId].filter(Boolean).join(':'),
            r.description,
            r.ipAddress ?? '',
        ]
            .map(esc)
            .join(','));
        return [header.map(esc).join(','), ...lines].join('\n');
    }
};
exports.SecurityService = SecurityService;
exports.SecurityService = SecurityService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], SecurityService);
//# sourceMappingURL=security.service.js.map