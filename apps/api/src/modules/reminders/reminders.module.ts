import { Module } from '@nestjs/common'
import { TaskRemindersService } from './task-reminders.service'
import { RemindersController } from './reminders.controller'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [NotificationsModule],
  providers: [TaskRemindersService, WorkspaceMemberGuard],
  controllers: [RemindersController],
  exports: [TaskRemindersService],
})
export class RemindersModule {}
