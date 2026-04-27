import { Module } from '@nestjs/common'
import { SprintsService } from './sprints.service'
import { SprintsController } from './sprints.controller'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'

@Module({
  providers: [SprintsService, WorkspaceMemberGuard],
  controllers: [SprintsController],
  exports: [SprintsService],
})
export class SprintsModule {}
