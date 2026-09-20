"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthModule = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const passport_1 = require("@nestjs/passport");
const config_1 = require("@nestjs/config");
const auth_service_1 = require("./auth.service");
const oauth_service_1 = require("./oauth.service");
const auth_controller_1 = require("./auth.controller");
const oauth_controller_1 = require("./oauth.controller");
const jwt_strategy_1 = require("./strategies/jwt.strategy");
const local_strategy_1 = require("./strategies/local.strategy");
const users_module_1 = require("../users/users.module");
const workspaces_module_1 = require("../workspaces/workspaces.module");
const email_module_1 = require("../email/email.module");
const workspace_member_guard_1 = require("./guards/workspace-member.guard");
const workspace_admin_guard_1 = require("./guards/workspace-admin.guard");
const rate_limit_guard_1 = require("../../common/guards/rate-limit.guard");
const rate_limit_cleanup_service_1 = require("../../common/guards/rate-limit-cleanup.service");
const security_module_1 = require("../security/security.module");
let AuthModule = class AuthModule {
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Module)({
        imports: [
            users_module_1.UsersModule,
            workspaces_module_1.WorkspacesModule,
            email_module_1.EmailModule,
            security_module_1.SecurityModule,
            passport_1.PassportModule,
            jwt_1.JwtModule.registerAsync({
                inject: [config_1.ConfigService],
                useFactory: (config) => ({
                    secret: config.getOrThrow('JWT_ACCESS_SECRET'),
                    signOptions: { expiresIn: config.get('JWT_ACCESS_EXPIRES_IN', '15m') },
                }),
            }),
        ],
        controllers: [auth_controller_1.AuthController, oauth_controller_1.OAuthController],
        providers: [
            auth_service_1.AuthService,
            oauth_service_1.OAuthService,
            jwt_strategy_1.JwtStrategy,
            local_strategy_1.LocalStrategy,
            workspace_member_guard_1.WorkspaceMemberGuard,
            workspace_admin_guard_1.WorkspaceAdminGuard,
            // Registered so the DI container hands out ONE shared instance (and injects
            // DB_TOKEN). Limits are enforced globally across replicas via the shared
            // `rate_limit_counters` store, with a per-instance in-memory fallback on DB
            // blips — see RateLimitGuard.
            rate_limit_guard_1.RateLimitGuard,
            // Hourly prune of expired rows in the shared rate-limit counter table so it
            // can't grow unbounded.
            rate_limit_cleanup_service_1.RateLimitCleanupService,
        ],
        exports: [auth_service_1.AuthService, oauth_service_1.OAuthService, workspace_member_guard_1.WorkspaceMemberGuard, workspace_admin_guard_1.WorkspaceAdminGuard],
    })
], AuthModule);
//# sourceMappingURL=auth.module.js.map