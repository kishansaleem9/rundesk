import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from './modules/auth/auth.module'
import { UsersModule } from './modules/users/users.module'
import { WorkspacesModule } from './modules/workspaces/workspaces.module'
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
import { SearchModule } from './modules/search/search.module'
import { RealtimeModule } from './modules/realtime/realtime.module'
import { HealthModule } from './modules/health/health.module'
import { DatabaseModule } from './common/database/database.module'

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
    DatabaseModule,
    RealtimeModule,
    SearchModule,
    HealthModule,
    UsersModule,
    AuthModule,
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
  ],
})
export class AppModule {}
