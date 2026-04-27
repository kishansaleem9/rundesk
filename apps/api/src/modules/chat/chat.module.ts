import { Module } from '@nestjs/common'
import { ChatService } from './chat.service'
import { ChatController } from './chat.controller'
import { RealtimeModule } from '../realtime/realtime.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'

@Module({
  imports: [RealtimeModule],
  providers: [ChatService, WorkspaceMemberGuard],
  controllers: [ChatController],
  exports: [ChatService],
})
export class ChatModule {}
