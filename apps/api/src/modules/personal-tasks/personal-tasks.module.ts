import { Module } from '@nestjs/common'
import { PersonalTasksService } from './personal-tasks.service'
import { PersonalTasksController } from './personal-tasks.controller'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { TasksModule } from '../tasks/tasks.module'

@Module({
  // Home's Personal List is the person's Personal List: its tasks are made and changed as every task is.
  imports: [TasksModule],
  providers: [PersonalTasksService, WorkspaceMemberGuard],
  controllers: [PersonalTasksController],
  exports: [PersonalTasksService],
})
export class PersonalTasksModule {}
