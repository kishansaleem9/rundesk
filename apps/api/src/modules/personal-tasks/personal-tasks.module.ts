import { Module } from '@nestjs/common'
import { PersonalTasksService } from './personal-tasks.service'
import { PersonalTasksController } from './personal-tasks.controller'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'

@Module({
  providers: [PersonalTasksService, WorkspaceMemberGuard],
  controllers: [PersonalTasksController],
  exports: [PersonalTasksService],
})
export class PersonalTasksModule {}
