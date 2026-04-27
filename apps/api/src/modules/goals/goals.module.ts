import { Module } from '@nestjs/common'
import { GoalsService } from './goals.service'
import { GoalsController } from './goals.controller'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'

@Module({
  providers: [GoalsService, WorkspaceMemberGuard],
  controllers: [GoalsController],
  exports: [GoalsService],
})
export class GoalsModule {}
