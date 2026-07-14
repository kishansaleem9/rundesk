import { Module } from '@nestjs/common'
import { ChatService } from './chat.service'
import { ChatController } from './chat.controller'
import { RealtimeModule } from '../realtime/realtime.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { NotificationsModule } from '../notifications/notifications.module'
import { TasksModule } from '../tasks/tasks.module'

@Module({
  imports: [RealtimeModule, NotificationsModule, TasksModule],
  providers: [ChatService, WorkspaceMemberGuard],
  controllers: [ChatController],
  exports: [ChatService],
})
export class ChatModule {}
