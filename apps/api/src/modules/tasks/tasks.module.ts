import { Module } from '@nestjs/common'
import { TasksService } from './tasks.service'
import { TasksController } from './tasks.controller'
import { TaskCommentsController, SavedCommentsController } from './comments.controller'
import { CommentEmailService } from './comment-email.service'
import { TaskListsService } from './task-lists.service'
import { TaskListsController } from './task-lists.controller'
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
import { EmailToTaskModule } from '../email-to-task/email-to-task.module'
import { EmailModule } from '../email/email.module'
import { PlansModule } from '../plans/plans.module'
import { CustomFieldsModule } from '../custom-fields/custom-fields.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'

@Module({
  imports: [
    RealtimeModule,
    CustomFieldsModule,
    AutomationsModule,
    WebhooksModule,
    SlackModule,
    NotificationsModule,
    CalendarSyncModule,
    SecurityModule,
    // §V2-08 — the task menu's "Send email to task" needs the address this
    // module already routes on.
    EmailToTaskModule,
    // A comment sent as email (`resume-defects/s4-composer-email`) goes through the server's mail.
    EmailModule,
    // §V2-13 frames `09:26` / `10:42` — Team View and the board download are
    // refused by the SERVER for a workspace whose plan does not include them.
    PlansModule,
  ],
  providers: [TasksService, CommentEmailService, TaskListsService, ChecklistTemplatesService, TaskTypesService, WorkspaceMemberGuard],
  controllers: [
    TasksController,
    TaskCommentsController,
    SavedCommentsController,
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
    TaskListsController,
  ],
  exports: [TasksService],
})
export class TasksModule {}
