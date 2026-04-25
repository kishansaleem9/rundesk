import { Module } from '@nestjs/common'
import { TasksService } from './tasks.service'
import { TasksController } from './tasks.controller'
import { TaskCommentsController } from './comments.controller'
import { TaskChecklistsController } from './checklists.controller'
import { TaskActivityController } from './activity.controller'
import { TaskDependenciesController } from './dependencies.controller'
import { TaskTimeEntriesController, TimeEntriesController } from './time-entries.controller'
import { RealtimeModule } from '../realtime/realtime.module'

@Module({
  imports: [RealtimeModule],
  providers: [TasksService],
  controllers: [
    TasksController,
    TaskCommentsController,
    TaskChecklistsController,
    TaskActivityController,
    TaskDependenciesController,
    TaskTimeEntriesController,
    TimeEntriesController,
  ],
  exports: [TasksService],
})
export class TasksModule {}
