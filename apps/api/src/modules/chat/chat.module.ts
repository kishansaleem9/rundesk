import { Module } from '@nestjs/common'
import { ChatService } from './chat.service'
import { ChatController } from './chat.controller'
import { RealtimeModule } from '../realtime/realtime.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { NotificationsModule } from '../notifications/notifications.module'
import { TasksModule } from '../tasks/tasks.module'
import { RemindersModule } from '../reminders/reminders.module'
import { PresenceModule } from '../presence/presence.module'
import { AiModule } from '../ai/ai.module'
import { StorageModule } from '../../common/storage/storage.module'
import { SharesModule } from '../shares/shares.module'
import { SkillsModule } from '../skills/skills.module'

@Module({
  // SkillsModule supplies SkillsService so `/skill-name` in the composer can
  // answer AS that skill (§15). It owns the visibility, installed and enabled
  // checks, so resolving through it is what stops someone invoking a skill they
  // cannot see. Skills imports nothing from chat, so no cycle.
  imports: [RealtimeModule, NotificationsModule, TasksModule, RemindersModule, PresenceModule, AiModule, StorageModule, SharesModule, SkillsModule],
  providers: [ChatService, WorkspaceMemberGuard],
  controllers: [ChatController],
  exports: [ChatService],
})
export class ChatModule {}
