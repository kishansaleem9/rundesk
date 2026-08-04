import { Module } from '@nestjs/common'
import { TasksService } from './tasks.service'
import { TasksController } from './tasks.controller'
import { TaskCommentsController } from './comments.controller'
import { TaskChecklistsController } from './checklists.controller'
import { ChecklistTemplatesController } from './checklist-templates.controller'
import { ChecklistTemplatesService } from './checklist-templates.service'
import { TaskTypesController } from './task-types.controller'
import { TaskTypesService } from './task-types.service'
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
import { SecurityModule } from '../security/security.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'

@Module({
  imports: [
    RealtimeModule,
    AutomationsModule,
    WebhooksModule,
    SlackModule,
    NotificationsModule,
    CalendarSyncModule,
    SecurityModule,
  ],
  providers: [TasksService, ChecklistTemplatesService, TaskTypesService, WorkspaceMemberGuard],
  controllers: [
    TasksController,
    TaskCommentsController,
    TaskChecklistsController,
    ChecklistTemplatesController,
    TaskTypesController,
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
