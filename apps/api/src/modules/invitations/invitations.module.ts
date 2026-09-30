import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { InvitationsService } from './invitations.service'
import { InvitationsController } from './invitations.controller'
import { AuthModule } from '../auth/auth.module'
import { EmailModule } from '../email/email.module'
import { SecurityModule } from '../security/security.module'
import { WebhooksModule } from '../webhooks/webhooks.module'
import { PlansModule } from '../plans/plans.module'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'
import { RateLimitGuard } from '../../common/guards/rate-limit.guard'

@Module({
  imports: [
    AuthModule,
    EmailModule,
    SecurityModule,
    WebhooksModule,
    PlansModule,
    // Custom roles: inviting and handling an invitation ask `members.invite`.
    CustomRolesModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: config.get('JWT_ACCESS_EXPIRES_IN', '15m') },
      }),
    }),
  ],
  controllers: [InvitationsController],
  // RateLimitGuard for the invitee's routes (`found-30-sep/register-unthrottled`).
  providers: [InvitationsService, RateLimitGuard],
  exports: [InvitationsService],
})
export class InvitationsModule {}
