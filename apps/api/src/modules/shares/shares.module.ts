import { Module } from '@nestjs/common'
import { SharesService } from './shares.service'
import { SharesController } from './shares.controller'
import { SharedWithMeController } from './shared-with-me.controller'
import { SecurityModule } from '../security/security.module'
import { EmailModule } from '../email/email.module'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [SecurityModule, EmailModule, NotificationsModule],
  controllers: [SharesController, SharedWithMeController],
  providers: [SharesService],
  exports: [SharesService],
})
export class SharesModule {}
