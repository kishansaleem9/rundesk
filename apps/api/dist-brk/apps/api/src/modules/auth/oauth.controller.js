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
exports.OAuthController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const config_1 = require("@nestjs/config");
const auth_service_1 = require("./auth.service");
const oauth_service_1 = require("./oauth.service");
const auth_cookies_1 = require("./auth-cookies");
const oauth_util_1 = require("./oauth.util");
// Short-lived httpOnly cookie holding the signed OAuth `state`. SameSite=Lax so
// it survives the top-level GET redirect back from the provider.
const STATE_COOKIE = 'rd_oauth_state';
const STATE_COOKIE_MAX_AGE = 10 * 60; // seconds
/**
 * Google / Microsoft social login (Plan §1.1). All three routes use @Res()
 * directly (no passthrough): the two flow routes issue 302 redirects and the
 * providers route returns a plain object the global interceptor envelopes.
 */
let OAuthController = class OAuthController {
    constructor(oauth, auth, config) {
        this.oauth = oauth;
        this.auth = auth;
        this.config = config;
    }
    // Cookies are only marked Secure in production so they still work over
    // http://localhost in development (mirrors AuthController).
    get secure() {
        return (this.config.get('NODE_ENV') ?? 'development') === 'production';
    }
    get webBase() {
        return (this.config.get('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '');
    }
    stateCookieOptions() {
        return { path: '/', httpOnly: true, secure: this.secure, sameSite: 'lax' };
    }
    providers() {
        return this.oauth.configuredProviders();
    }
    start(provider, res) {
        if (!(0, oauth_util_1.isOAuthProvider)(provider)) {
            res.redirect(`${this.webBase}/login?error=oauth_unsupported_provider`, 302);
            return;
        }
        if (!this.oauth.isConfigured(provider)) {
            res.redirect(`${this.webBase}/login?error=oauth_unconfigured`, 302);
            return;
        }
        const { url, state } = this.oauth.beginLogin(provider);
        res.setCookie(STATE_COOKIE, state, { ...this.stateCookieOptions(), maxAge: STATE_COOKIE_MAX_AGE });
        res.redirect(url, 302);
    }
    async callback(provider, code, state, providerError, req, res) {
        try {
            if (!(0, oauth_util_1.isOAuthProvider)(provider))
                throw new common_1.BadRequestException('Unsupported provider');
            if (providerError)
                throw new common_1.BadRequestException(`Provider returned an error: ${providerError}`);
            if (!code)
                throw new common_1.BadRequestException('Missing authorization code');
            // Validate + consume the state cookie before doing any network work.
            this.oauth.validateState(provider, state, req.cookies?.[STATE_COOKIE]);
            res.clearCookie(STATE_COOKIE, this.stateCookieOptions());
            const meta = {
                ip: req.ip,
                userAgent: req.headers['user-agent'],
            };
            const { profile, tokens } = await this.oauth.exchangeCodeForProfile(provider, code);
            const { userId } = await this.oauth.upsertUserAndLink(provider, profile, tokens, meta);
            // Reuse the exact session-minting path used by password + SSO logins:
            // mints access+refresh, inserts the sessions row, enforces the session
            // cap, and audit-logs auth.login.
            const bundle = await this.auth.issueSessionForUserId(userId, meta);
            (0, auth_cookies_1.setAuthCookies)(res, bundle, { secure: this.secure });
            // Land the browser on the SPA's SSO-complete route, which hydrates the
            // session from the cookies (POST /auth/refresh) — no token in the URL.
            const target = new URL(`${this.webBase}/sso-complete`);
            const primaryWorkspaceId = bundle.workspaces?.[0]?.id;
            if (primaryWorkspaceId)
                target.searchParams.set('workspaceId', primaryWorkspaceId);
            res.redirect(target.toString(), 302);
        }
        catch (err) {
            res.clearCookie(STATE_COOKIE, this.stateCookieOptions());
            const message = err instanceof Error ? err.message : 'OAuth sign-in failed';
            const target = new URL(`${this.webBase}/login`);
            target.searchParams.set('ssoError', message);
            res.redirect(target.toString(), 302);
        }
    }
};
exports.OAuthController = OAuthController;
__decorate([
    (0, common_1.Get)('providers'),
    (0, swagger_1.ApiOperation)({ summary: 'Which social login providers are configured (env creds present)' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], OAuthController.prototype, "providers", null);
__decorate([
    (0, common_1.Get)(':provider'),
    (0, swagger_1.ApiOperation)({ summary: 'Start Google/Microsoft OAuth login — 302 to the provider authorize endpoint' }),
    __param(0, (0, common_1.Param)('provider')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], OAuthController.prototype, "start", null);
__decorate([
    (0, common_1.Get)(':provider/callback'),
    (0, swagger_1.ApiOperation)({ summary: 'OAuth provider redirect target — mints a session and bounces to /sso-complete' }),
    __param(0, (0, common_1.Param)('provider')),
    __param(1, (0, common_1.Query)('code')),
    __param(2, (0, common_1.Query)('state')),
    __param(3, (0, common_1.Query)('error')),
    __param(4, (0, common_1.Req)()),
    __param(5, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], OAuthController.prototype, "callback", null);
exports.OAuthController = OAuthController = __decorate([
    (0, swagger_1.ApiTags)('auth-oauth'),
    (0, common_1.Controller)('auth/oauth'),
    __metadata("design:paramtypes", [oauth_service_1.OAuthService,
        auth_service_1.AuthService,
        config_1.ConfigService])
], OAuthController);
//# sourceMappingURL=oauth.controller.js.map