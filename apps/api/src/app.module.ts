import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { AuthModule } from './modules/auth/auth.module'
import { UsersModule } from './modules/users/users.module'
import { WorkspacesModule } from './modules/workspaces/workspaces.module'
import { OrganizationsModule } from './modules/organizations/organizations.module'
import { InvitationsModule } from './modules/invitations/invitations.module'
import { FeatureFlagsModule } from './modules/feature-flags/feature-flags.module'
import { SpacesModule } from './modules/spaces/spaces.module'
import { ProjectsModule } from './modules/projects/projects.module'
import { ListsModule } from './modules/lists/lists.module'
import { TasksModule } from './modules/tasks/tasks.module'
import { LabelsModule } from './modules/labels/labels.module'
import { DocsModule } from './modules/docs/docs.module'
import { ChatModule } from './modules/chat/chat.module'
import { GoalsModule } from './modules/goals/goals.module'
import { SprintsModule } from './modules/sprints/sprints.module'
import { TimeEntriesModule } from './modules/time-entries/time-entries.module'
import { NotificationsModule } from './modules/notifications/notifications.module'
import { ViewsModule } from './modules/views/views.module'
import { FormsModule } from './modules/forms/forms.module'
import { AutomationsModule } from './modules/automations/automations.module'
import { AiModule } from './modules/ai/ai.module'
import { ReportsModule } from './modules/reports/reports.module'
import { SecurityModule } from './modules/security/security.module'
import { ExportModule } from './modules/export/export.module'
import { WebhooksModule } from './modules/webhooks/webhooks.module'
import { SlackModule } from './modules/integrations/slack/slack.module'
import { ClickUpImportModule } from './modules/integrations/clickup-import/clickup-import.module'
import { IntegrationConnectionsModule } from './modules/integrations/connections/integration-connections.module'
import { ProjectTemplatesModule } from './modules/project-templates/project-templates.module'
import { CustomFieldsModule } from './modules/custom-fields/custom-fields.module'
import { SearchModule } from './modules/search/search.module'
import { RealtimeModule } from './modules/realtime/realtime.module'
import { HealthModule } from './modules/health/health.module'
import { DashboardsModule } from './modules/dashboards/dashboards.module'
import { DatabaseModule } from './common/database/database.module'
import { StorageModule } from './common/storage/storage.module'
import { ClipsModule } from './modules/clips/clips.module'
import { CanvasesModule } from './modules/canvases/canvases.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        // App-local override first, then the monorepo root .env
        '.env',
        '../../.env',
      ],
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    StorageModule,
    RealtimeModule,
    SearchModule,
    HealthModule,
    UsersModule,
    AuthModule,
    OrganizationsModule,
    InvitationsModule,
    WorkspacesModule,
    FeatureFlagsModule,
    SpacesModule,
    ProjectsModule,
    ListsModule,
    TasksModule,
    LabelsModule,
    DocsModule,
    ChatModule,
    GoalsModule,
    SprintsModule,
    TimeEntriesModule,
    NotificationsModule,
    ViewsModule,
    FormsModule,
    AutomationsModule,
    AiModule,
    ReportsModule,
    SecurityModule,
    ExportModule,
    WebhooksModule,
    SlackModule,
    ClickUpImportModule,
    IntegrationConnectionsModule,
    ProjectTemplatesModule,
    CustomFieldsModule,
    DashboardsModule,
    ClipsModule,
    CanvasesModule,
  ],
})
export class AppModule {}
