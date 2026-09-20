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
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const config_1 = require("@nestjs/config");
const auth_service_1 = require("./auth.service");
const local_auth_guard_1 = require("./guards/local-auth.guard");
const jwt_auth_guard_1 = require("./guards/jwt-auth.guard");
const rate_limit_guard_1 = require("../../common/guards/rate-limit.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const register_dto_1 = require("./dto/register.dto");
const signup_dto_1 = require("./dto/signup.dto");
const login_dto_1 = require("./dto/login.dto");
const auth_cookies_1 = require("./auth-cookies");
function sessionMeta(req) {
    return {
        userAgent: req.headers['user-agent'] ?? undefined,
        ip: req.ip,
    };
}
let AuthController = class AuthController {
    constructor(authService, config) {
        this.authService = authService;
        this.config = config;
    }
    // Secure only in production so cookies still work over http://localhost in dev.
    get cookiesSecure() {
        return (this.config.get('NODE_ENV') ?? 'development') === 'production';
    }
    /** Attach the httpOnly access/refresh + readable CSRF cookies to a response. */
    issueCookies(reply, bundle) {
        (0, auth_cookies_1.setAuthCookies)(reply, bundle, { secure: this.cookiesSecure });
    }
    async signup(dto, req, res) {
        const bundle = await this.authService.signUp(dto, sessionMeta(req));
        this.issueCookies(res, bundle);
        return bundle;
    }
    async register(dto, req, res) {
        const bundle = await this.authService.register(dto, sessionMeta(req));
        this.issueCookies(res, bundle);
        return bundle;
    }
    async login(user, dto, req, res) {
        // Password already validated by LocalAuthGuard. Enforce the second factor
        // for accounts with a verified TOTP secret BEFORE issuing any token; this is
        // a no-op (and the flow is unchanged) for password-only accounts.
        await this.authService.assertTotpSatisfied(user.id, dto.totpCode);
        const bundle = await this.authService.login(user, sessionMeta(req));
        this.issueCookies(res, bundle);
        return bundle;
    }
    async refresh(body, req, res) {
        // Accept the refresh token from the JSON body (Bearer/API clients) or, for
        // browser sessions, from the httpOnly refresh_token cookie.
        const token = body?.refreshToken ?? req.cookies?.[auth_cookies_1.REFRESH_TOKEN_COOKIE];
        const bundle = await this.authService.refresh(token, sessionMeta(req));
        this.issueCookies(res, bundle);
        return bundle;
    }
    async forgotPassword(body) {
        return this.authService.requestPasswordReset(body.email);
    }
    async resetPassword(body) {
        return this.authService.resetPassword(body.token, body.password);
    }
    async verifyEmail(body) {
        return this.authService.verifyEmail(body.token);
    }
    async resendVerification(body) {
        return this.authService.resendVerification(body.email);
    }
    async logout(body, req, res) {
        // Revoke the session identified by the presented refresh token (body for
        // Bearer clients, cookie for browsers). Always clear the cookies so the
        // browser session ends even if no refresh token is present.
        const token = body?.refreshToken ?? req.cookies?.[auth_cookies_1.REFRESH_TOKEN_COOKIE];
        if (token)
            await this.authService.logout(token);
        (0, auth_cookies_1.clearAuthCookies)(res, { secure: this.cookiesSecure });
    }
    async me(user) {
        return user;
    }
    sessions(user, currentRefreshToken) {
        return this.authService.listSessions(user.id, currentRefreshToken);
    }
    revokeOthers(user, body) {
        return this.authService.revokeOtherSessions(user.id, body.currentRefreshToken);
    }
    revokeSession(user, sessionId) {
        return this.authService.revokeSession(user.id, sessionId);
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)('signup'),
    (0, rate_limit_guard_1.RateLimit)({ limit: 10, windowMs: 60_000 }),
    (0, swagger_1.ApiOperation)({ summary: 'Atomic organization signup with initial workspace and optional invites' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [signup_dto_1.SignupDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "signup", null);
__decorate([
    (0, common_1.Post)('register'),
    (0, swagger_1.ApiOperation)({ summary: 'Register a new user (creates a personal workspace) - DEPRECATED: use /signup' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [register_dto_1.RegisterDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "register", null);
__decorate([
    (0, common_1.Post)('login'),
    (0, rate_limit_guard_1.RateLimit)({ limit: 10, windowMs: 60_000 }),
    (0, common_1.UseGuards)(local_auth_guard_1.LocalAuthGuard),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Login with email and password' }),
    (0, swagger_1.ApiBody)({ type: login_dto_1.LoginDto }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __param(3, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, login_dto_1.LoginDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('refresh'),
    (0, rate_limit_guard_1.RateLimit)({ limit: 30, windowMs: 60_000 }),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Refresh access token (rotates the refresh token)' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "refresh", null);
__decorate([
    (0, common_1.Post)('forgot-password'),
    (0, rate_limit_guard_1.RateLimit)({ limit: 5, windowMs: 60_000 }),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Request a password reset link' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "forgotPassword", null);
__decorate([
    (0, common_1.Post)('reset-password'),
    (0, rate_limit_guard_1.RateLimit)({ limit: 10, windowMs: 60_000 }),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Reset password with a valid reset token' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "resetPassword", null);
__decorate([
    (0, common_1.Post)('verify-email'),
    (0, rate_limit_guard_1.RateLimit)({ limit: 10, windowMs: 60_000 }),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Verify a user email address with a token' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verifyEmail", null);
__decorate([
    (0, common_1.Post)('resend-verification'),
    (0, rate_limit_guard_1.RateLimit)({ limit: 5, windowMs: 60_000 }),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Resend the email-verification link' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "resendVerification", null);
__decorate([
    (0, common_1.Post)('logout'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    (0, swagger_1.ApiOperation)({ summary: 'Logout: clear auth cookies and revoke the refresh session' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    (0, common_1.Get)('me'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get the current authenticated user payload' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "me", null);
__decorate([
    (0, common_1.Get)('sessions'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'List current user sessions' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('currentRefreshToken')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "sessions", null);
__decorate([
    (0, common_1.Post)('sessions/revoke-others'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Revoke all sessions except current one' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "revokeOthers", null);
__decorate([
    (0, common_1.Delete)('sessions/:sessionId'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Revoke a single user session' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('sessionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "revokeSession", null);
exports.AuthController = AuthController = __decorate([
    (0, swagger_1.ApiTags)('auth'),
    (0, common_1.Controller)('auth')
    // Controller-level so it runs BEFORE route guards (e.g. LocalAuthGuard): brute
    // -force attempts with wrong passwords must still count toward the limit. Only
    // routes carrying @RateLimit are actually throttled; everything else is a no-op.
    ,
    (0, common_1.UseGuards)(rate_limit_guard_1.RateLimitGuard),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        config_1.ConfigService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map