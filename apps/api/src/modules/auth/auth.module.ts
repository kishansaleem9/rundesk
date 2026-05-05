import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { ConfigService } from '@nestjs/config'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'
import { JwtStrategy } from './strategies/jwt.strategy'
import { LocalStrategy } from './strategies/local.strategy'
import { UsersModule } from '../users/users.module'
import { WorkspacesModule } from '../workspaces/workspaces.module'
import { EmailModule } from '../email/email.module'
import { WorkspaceMemberGuard } from './guards/workspace-member.guard'
import { WorkspaceAdminGuard } from './guards/workspace-admin.guard'

@Module({
  imports: [
    UsersModule,
    WorkspacesModule,
    EmailModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: config.get('JWT_ACCESS_EXPIRES_IN', '15m') },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    LocalStrategy,
    WorkspaceMemberGuard,
    WorkspaceAdminGuard,
  ],
  exports: [AuthService, WorkspaceMemberGuard, WorkspaceAdminGuard],
})
export class AuthModule {}
