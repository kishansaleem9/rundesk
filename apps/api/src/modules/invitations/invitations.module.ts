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

@Module({
  imports: [
    AuthModule,
    EmailModule,
    SecurityModule,
    WebhooksModule,
    PlansModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: config.get('JWT_ACCESS_EXPIRES_IN', '15m') },
      }),
    }),
  ],
  controllers: [InvitationsController],
  providers: [InvitationsService],
  exports: [InvitationsService],
})
export class InvitationsModule {}
