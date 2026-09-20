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
exports.SsoAuthController = exports.SsoAdminController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_admin_guard_1 = require("../auth/guards/workspace-admin.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const permissions_guard_1 = require("../custom-roles/permissions.guard");
const sso_service_1 = require("./sso.service");
const auth_service_1 = require("../auth/auth.service");
const auth_cookies_1 = require("../auth/auth-cookies");
let SsoAdminController = class SsoAdminController {
    constructor(sso) {
        this.sso = sso;
    }
    list(workspaceId) {
        return this.sso.listConnections(workspaceId);
    }
    upsert(workspaceId, provider, body, user) {
        const normalized = provider.toLowerCase();
        if (normalized !== 'oidc' && normalized !== 'saml') {
            return { error: 'provider must be oidc or saml' };
        }
        return this.sso.upsertConnection(workspaceId, normalized, user.id, body);
    }
    remove(workspaceId, connectionId, user) {
        return this.sso.deleteConnection(workspaceId, connectionId, user.id);
    }
};
exports.SsoAdminController = SsoAdminController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Param)('workspaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SsoAdminController.prototype, "list", null);
__decorate([
    (0, common_1.Put)(':provider'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('provider')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], SsoAdminController.prototype, "upsert", null);
__decorate([
    (0, common_1.Delete)(':connectionId'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('connectionId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], SsoAdminController.prototype, "remove", null);
exports.SsoAdminController = SsoAdminController = __decorate([
    (0, swagger_1.ApiTags)('sso-admin'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('workspaces/:workspaceId/sso'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_admin_guard_1.WorkspaceAdminGuard, permissions_guard_1.PermissionsGuard),
    (0, permissions_guard_1.RequirePermissions)('sso.manage'),
    __metadata("design:paramtypes", [sso_service_1.SsoService])
], SsoAdminController);
let SsoAuthController = class SsoAuthController {
    constructor(sso, auth) {
        this.sso = sso;
        this.auth = auth;
    }
    /**
     * GET /auth/sso/lookup?email=user@example.com — does this domain have SSO?
     * Public endpoint used by the sign-in page to decide whether to surface
     * "Sign in with SSO". Returns null when no enforced connection exists.
     */
    async lookup(email) {
        if (!email)
            return { connection: null };
        const conn = await this.sso.findConnectionForEmail(email);
        if (!conn)
            return { connection: null };
        return {
            connection: {
                workspaceId: conn.workspaceId,
                provider: conn.provider,
                displayName: conn.displayName,
            },
        };
    }
    async start(provider, workspaceId, redirectTo, res) {
        const normalized = provider.toLowerCase();
        if (!workspaceId) {
            res.code(400).send({ error: 'workspaceId query parameter is required' });
            return;
        }
        if (normalized === 'oidc') {
            const { url } = await this.sso.beginOidcLogin(workspaceId, redirectTo);
            res.redirect(url, 302);
            return;
        }
        if (normalized === 'saml') {
            const { url } = await this.sso.beginSamlLogin(workspaceId, redirectTo);
            res.redirect(url, 302);
            return;
        }
        res.code(400).send({ error: 'provider must be oidc or saml' });
    }
    async oidcCallback(query, res) {
        try {
            // Reconstruct the URL with all query params so openid-client can verify
            // signatures/nonces against the exact value the IdP returned.
            const callbackUrl = new URL(res.request?.url ?? '/', 'https://placeholder.invalid');
            Object.entries(query).forEach(([k, v]) => callbackUrl.searchParams.set(k, v));
            const result = await this.sso.handleOidcCallback(callbackUrl);
            const tokenBundle = await this.auth.issueSessionForUserId(result.userId, {
                ip: res.request?.ip,
                userAgent: res.request?.headers?.['user-agent'],
            });
            return this.redirectToApp(res, tokenBundle, result.workspaceId);
        }
        catch (err) {
            return this.redirectWithError(res, err?.message ?? 'SSO sign-in failed');
        }
    }
    async samlCallback(body, res) {
        try {
            const result = await this.sso.handleSamlCallback(body);
            const tokenBundle = await this.auth.issueSessionForUserId(result.userId, {
                ip: res.request?.ip,
                userAgent: res.request?.headers?.['user-agent'],
            });
            return this.redirectToApp(res, tokenBundle, result.workspaceId);
        }
        catch (err) {
            return this.redirectWithError(res, err?.message ?? 'SAML sign-in failed');
        }
    }
    /**
     * Finish SSO by setting the session as httpOnly cookies (access + refresh)
     * plus the readable CSRF cookie, then redirecting to the SPA. Tokens are NO
     * LONGER placed in the URL hash (Plan §1.1) — the /sso-complete route hydrates
     * from the cookie session via POST /auth/refresh, so the token never becomes a
     * durable client-side store and never appears in browser history / referrers.
     */
    redirectToApp(res, bundle, workspaceId) {
        const secure = (process.env.NODE_ENV ?? 'development') === 'production';
        (0, auth_cookies_1.setAuthCookies)(res, bundle, { secure });
        const appUrl = process.env.APP_URL ?? 'http://localhost:5173';
        const target = new URL(`${appUrl}/sso-complete`);
        if (workspaceId)
            target.searchParams.set('workspaceId', workspaceId);
        res.redirect(target.toString(), 302);
    }
    redirectWithError(res, message) {
        const appUrl = process.env.APP_URL ?? 'http://localhost:5173';
        const target = new URL(`${appUrl}/login`);
        target.searchParams.set('ssoError', message);
        res.redirect(target.toString(), 302);
    }
};
exports.SsoAuthController = SsoAuthController;
__decorate([
    (0, common_1.Get)('lookup'),
    __param(0, (0, common_1.Query)('email')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SsoAuthController.prototype, "lookup", null);
__decorate([
    (0, common_1.Get)(':provider/start'),
    __param(0, (0, common_1.Param)('provider')),
    __param(1, (0, common_1.Query)('workspaceId')),
    __param(2, (0, common_1.Query)('redirectTo')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", Promise)
], SsoAuthController.prototype, "start", null);
__decorate([
    (0, common_1.Get)('oidc/callback'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SsoAuthController.prototype, "oidcCallback", null);
__decorate([
    (0, common_1.Post)('saml/callback'),
    (0, common_1.HttpCode)(302),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SsoAuthController.prototype, "samlCallback", null);
exports.SsoAuthController = SsoAuthController = __decorate([
    (0, swagger_1.ApiTags)('sso-auth'),
    (0, common_1.Controller)('auth/sso'),
    __metadata("design:paramtypes", [sso_service_1.SsoService,
        auth_service_1.AuthService])
], SsoAuthController);
//# sourceMappingURL=sso.controller.js.map