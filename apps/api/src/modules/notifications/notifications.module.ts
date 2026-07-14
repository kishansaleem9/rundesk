import { Module } from '@nestjs/common'
import { NotificationsService } from './notifications.service'
import { NotificationsController } from './notifications.controller'
import { RemindersService } from './reminders.service'
import { NotificationDigestService } from './notification-digest.service'
import { RealtimeModule } from '../realtime/realtime.module'
import { EmailModule } from '../email/email.module'

@Module({
  imports: [RealtimeModule, EmailModule],
  providers: [NotificationsService, RemindersService, NotificationDigestService],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
