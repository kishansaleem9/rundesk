import { Module } from '@nestjs/common'
import { CalendarSyncModule } from '../calendar-sync/calendar-sync.module'
import { MeetingsModule } from '../meetings/meetings.module'
import { AiModule } from '../ai/ai.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { NotetakerService } from './notetaker.service'
import { NotetakerController } from './notetaker.controller'

/** The AI Notetaker (`commit-log/log-39863ff-1`): a meeting bot sent to Zoom, Meet and Teams meetings, its notes kept as a meeting record. */
@Module({
  imports: [CalendarSyncModule, MeetingsModule, AiModule, NotificationsModule],
  providers: [NotetakerService],
  controllers: [NotetakerController],
})
export class NotetakerModule {}
