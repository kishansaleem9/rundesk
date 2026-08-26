import { Module } from '@nestjs/common'
import { CallsService } from './calls.service'
import { CallsController } from './calls.controller'
import { RealtimeModule } from '../realtime/realtime.module'
import { MeetingsModule } from '../meetings/meetings.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { AiModule } from '../ai/ai.module'
import { StorageModule } from '../../common/storage/storage.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'

@Module({
  // MeetingsModule so a call that ends leaves a meeting record behind rather
  // than a second, parallel history of its own. NotificationsModule so §2.8
  // gap 9's "a call started, here is the way in" reaches people who are not
  // looking at the channel.
  // §2.8 gap 10 — AiModule writes the notes from the transcript; StorageModule
  // hands the browser a pre-signed URL so the recording never passes through
  // the API on its way to storage.
  imports: [RealtimeModule, MeetingsModule, NotificationsModule, AiModule, StorageModule],
  providers: [CallsService, WorkspaceMemberGuard],
  controllers: [CallsController],
  exports: [CallsService],
})
export class CallsModule {}
