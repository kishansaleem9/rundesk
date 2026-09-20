"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLogsController = exports.ApiKeysController = exports.TotpController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const security_service_1 = require("./security.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const workspace_admin_guard_1 = require("../auth/guards/workspace-admin.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
// ─── 2FA / TOTP (per-user, no workspace) ──────────────────────────────────────
let TotpController = class TotpController {
    constructor(svc) {
        this.svc = svc;
    }
    status(user) {
        return this.svc.getTotpStatus(user.id);
    }
    setup(user) {
        return this.svc.setupTotp(user.id);
    }
    verify(user, body) {
        return this.svc.verifyAndActivateTotp(user.id, body.code);
    }
    async disable(user) {
        await this.svc.disableTotp(user.id);
        return { ok: true };
    }
};
exports.TotpController = TotpController;
__decorate([
    (0, common_1.Get)('status'),
    (0, swagger_1.ApiOperation)({ summary: 'Get 2FA status for current user' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], TotpController.prototype, "status", null);
__decorate([
    (0, common_1.Post)('setup'),
    (0, swagger_1.ApiOperation)({ summary: 'Begin 2FA setup — returns the otpauth:// URI and secret for client-side QR rendering' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], TotpController.prototype, "setup", null);
__decorate([
    (0, common_1.Post)('verify'),
    (0, swagger_1.ApiOperation)({ summary: 'Verify TOTP code to activate 2FA' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], TotpController.prototype, "verify", null);
__decorate([
    (0, common_1.Delete)('disable'),
    (0, swagger_1.ApiOperation)({ summary: 'Disable 2FA for current user' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TotpController.prototype, "disable", null);
exports.TotpController = TotpController = __decorate([
    (0, swagger_1.ApiTags)('security'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('security/totp'),
    __metadata("design:paramtypes", [security_service_1.SecurityService])
], TotpController);
// ─── API Keys ─────────────────────────────────────────────────────────────────
let ApiKeysController = class ApiKeysController {
    constructor(svc) {
        this.svc = svc;
    }
    list(workspaceId) {
        return this.svc.listApiKeys(workspaceId);
    }
    create(workspaceId, user, body, ip) {
        return this.svc.createApiKey(workspaceId, user.id, body.name, body.scope, ip);
    }
    revoke(workspaceId, keyId, user, ip) {
        return this.svc.revokeApiKey(workspaceId, keyId, user.id, ip);
    }
    delete(workspaceId, keyId, user, ip) {
        return this.svc.deleteApiKey(workspaceId, keyId, user.id, ip);
    }
};
exports.ApiKeysController = ApiKeysController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List API keys for workspace' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ApiKeysController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new API key (admin only)' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Ip)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, String]),
    __metadata("design:returntype", void 0)
], ApiKeysController.prototype, "create", null);
__decorate([
    (0, common_1.Post)(':keyId/revoke'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Revoke an API key (admin only)' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('keyId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Ip)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, String]),
    __metadata("design:returntype", void 0)
], ApiKeysController.prototype, "revoke", null);
__decorate([
    (0, common_1.Delete)(':keyId'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Delete an API key (admin only)' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('keyId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Ip)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, String]),
    __metadata("design:returntype", void 0)
], ApiKeysController.prototype, "delete", null);
exports.ApiKeysController = ApiKeysController = __decorate([
    (0, swagger_1.ApiTags)('security'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard),
    (0, common_1.Controller)('workspaces/:workspaceId/api-keys'),
    __metadata("design:paramtypes", [security_service_1.SecurityService])
], ApiKeysController);
// ─── Audit Logs ───────────────────────────────────────────────────────────────
let AuditLogsController = class AuditLogsController {
    constructor(svc) {
        this.svc = svc;
    }
    list(workspaceId, page, limit, action, actionPrefix, actionPrefixes, actorId, from, to) {
        return this.svc.getAuditLogs(workspaceId, {
            page: page ? parseInt(page, 10) : 1,
            limit: limit ? parseInt(limit, 10) : 50,
            action,
            actionPrefix,
            actionPrefixes: parsePrefixes(actionPrefixes),
            actorId,
            from: parseAuditDate(from),
            to: parseAuditDate(to),
        });
    }
    export(workspaceId, action, actionPrefix, actionPrefixes, actorId, from, to) {
        return this.svc.exportAuditLogsCsv(workspaceId, {
            action,
            actionPrefix,
            actionPrefixes: parsePrefixes(actionPrefixes),
            actorId,
            from: parseAuditDate(from),
            to: parseAuditDate(to),
        });
    }
};
exports.AuditLogsController = AuditLogsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get audit trail for workspace (admin only)' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('limit')),
    __param(3, (0, common_1.Query)('action')),
    __param(4, (0, common_1.Query)('actionPrefix')),
    __param(5, (0, common_1.Query)('actionPrefixes')),
    __param(6, (0, common_1.Query)('actorId')),
    __param(7, (0, common_1.Query)('from')),
    __param(8, (0, common_1.Query)('to')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String, String, String, String]),
    __metadata("design:returntype", void 0)
], AuditLogsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('export'),
    (0, common_1.Header)('Content-Type', 'text/csv; charset=utf-8'),
    (0, common_1.Header)('Content-Disposition', 'attachment; filename="audit-log.csv"'),
    (0, swagger_1.ApiOperation)({ summary: 'Export the audit trail as CSV (admin only)' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Query)('action')),
    __param(2, (0, common_1.Query)('actionPrefix')),
    __param(3, (0, common_1.Query)('actionPrefixes')),
    __param(4, (0, common_1.Query)('actorId')),
    __param(5, (0, common_1.Query)('from')),
    __param(6, (0, common_1.Query)('to')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String, String]),
    __metadata("design:returntype", void 0)
], AuditLogsController.prototype, "export", null);
exports.AuditLogsController = AuditLogsController = __decorate([
    (0, swagger_1.ApiTags)('security'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_admin_guard_1.WorkspaceAdminGuard),
    (0, common_1.Controller)('workspaces/:workspaceId/audit-logs'),
    __metadata("design:paramtypes", [security_service_1.SecurityService])
], AuditLogsController);
function parseAuditDate(s) {
    if (!s)
        return undefined;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? undefined : d;
}
/** Split a comma-separated `actionPrefixes` query param into a clean list. */
function parsePrefixes(s) {
    if (!s)
        return undefined;
    const list = s.split(',').map((p) => p.trim()).filter(Boolean);
    return list.length ? list : undefined;
}
//# sourceMappingURL=security.controller.js.map