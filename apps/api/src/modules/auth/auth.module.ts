import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { ConfigService } from '@nestjs/config'
import { AuthService } from './auth.service'
import { OAuthService } from './oauth.service'
import { AuthController } from './auth.controller'
import { OAuthController } from './oauth.controller'
import { JwtStrategy } from './strategies/jwt.strategy'
import { LocalStrategy } from './strategies/local.strategy'
import { UsersModule } from '../users/users.module'
import { WorkspacesModule } from '../workspaces/workspaces.module'
import { EmailModule } from '../email/email.module'
import { WorkspaceMemberGuard } from './guards/workspace-member.guard'
import { WorkspaceAdminGuard } from './guards/workspace-admin.guard'
import { RateLimitGuard } from '../../common/guards/rate-limit.guard'
import { RateLimitCleanupService } from '../../common/guards/rate-limit-cleanup.service'
import { SecurityModule } from '../security/security.module'

@Module({
  imports: [
    UsersModule,
    WorkspacesModule,
    EmailModule,
    SecurityModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: config.get('JWT_ACCESS_EXPIRES_IN', '15m') },
      }),
    }),
  ],
  controllers: [AuthController, OAuthController],
  providers: [
    AuthService,
    OAuthService,
    JwtStrategy,
    LocalStrategy,
    WorkspaceMemberGuard,
    WorkspaceAdminGuard,
    // Registered so the DI container hands out ONE shared instance (and injects
    // DB_TOKEN). Limits are enforced globally across replicas via the shared
    // `rate_limit_counters` store, with a per-instance in-memory fallback on DB
    // blips — see RateLimitGuard.
    RateLimitGuard,
    // Hourly prune of expired rows in the shared rate-limit counter table so it
    // can't grow unbounded.
    RateLimitCleanupService,
  ],
  exports: [AuthService, OAuthService, WorkspaceMemberGuard, WorkspaceAdminGuard],
})
export class AuthModule {}
