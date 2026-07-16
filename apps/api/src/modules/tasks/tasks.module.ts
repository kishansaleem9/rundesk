import { Module } from '@nestjs/common'
import { TasksService } from './tasks.service'
import { TasksController } from './tasks.controller'
import { TaskCommentsController } from './comments.controller'
import { TaskChecklistsController } from './checklists.controller'
import { TaskActivityController, ProjectActivityController } from './activity.controller'
import { TaskDependenciesController } from './dependencies.controller'
import { TaskExternalLinksController } from './external-links.controller'
import { TaskMeetingsController } from './meetings.controller'
import { TaskTimeEntriesController, TimeEntriesController } from './time-entries.controller'
import { RealtimeModule } from '../realtime/realtime.module'
import { AutomationsModule } from '../automations/automations.module'
import { WebhooksModule } from '../webhooks/webhooks.module'
import { SlackModule } from '../integrations/slack/slack.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { CalendarSyncModule } from '../calendar-sync/calendar-sync.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'

@Module({
  imports: [
    RealtimeModule,
    AutomationsModule,
    WebhooksModule,
    SlackModule,
    NotificationsModule,
    CalendarSyncModule,
  ],
  providers: [TasksService, WorkspaceMemberGuard],
  controllers: [
    TasksController,
    TaskCommentsController,
    TaskChecklistsController,
    TaskActivityController,
    ProjectActivityController,
    TaskDependenciesController,
    TaskExternalLinksController,
    TaskMeetingsController,
    TaskTimeEntriesController,
    TimeEntriesController,
  ],
  exports: [TasksService],
})
export class TasksModule {}
