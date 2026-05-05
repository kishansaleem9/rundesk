import { Module } from '@nestjs/common'
import { InvitationsService } from './invitations.service'
import { InvitationsController } from './invitations.controller'
import { AuthModule } from '../auth/auth.module'
import { EmailModule } from '../email/email.module'

@Module({
  imports: [AuthModule, EmailModule],
  controllers: [InvitationsController],
  providers: [InvitationsService],
  exports: [InvitationsService],
})
export class InvitationsModule {}
