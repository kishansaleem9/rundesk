import { Module } from '@nestjs/common'
import { AiService } from './ai.service'
import { BriefingService } from './briefing.service'
import { AiController } from './ai.controller'
import { TasksModule } from '../tasks/tasks.module'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  // NotificationsModule supplies NotificationsService for briefing delivery
  // (§7.11). AiModule already depends on it transitively via TasksModule and
  // Notifications imports neither Ai nor Tasks, so this edge adds no cycle.
  imports: [TasksModule, NotificationsModule],
  controllers: [AiController],
  // BriefingService owns the hourly @Cron that delivers daily briefings — it
  // must be provided here or the cron never registers.
  providers: [AiService, BriefingService],
  exports: [AiService],
})
export class AiModule {}
