import { Module } from '@nestjs/common'
import { AiService } from './ai.service'
import { BriefingService } from './briefing.service'
import { WorkloadAlertService } from './workload-alert.service'
import { AiController } from './ai.controller'
import { TasksModule } from '../tasks/tasks.module'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  // NotificationsModule supplies NotificationsService for briefing + workload
  // alert delivery (§7.11/§7.12). AiModule already depends on it transitively via
  // TasksModule and Notifications imports neither Ai nor Tasks, so no cycle.
  imports: [TasksModule, NotificationsModule],
  controllers: [AiController],
  // BriefingService owns the hourly @Cron that delivers daily briefings;
  // WorkloadAlertService owns the daily @Cron that alerts managers about
  // overloaded teammates (§7.12) — both must be provided here or their crons
  // never register.
  providers: [AiService, BriefingService, WorkloadAlertService],
  exports: [AiService],
})
export class AiModule {}
