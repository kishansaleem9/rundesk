import { Module } from '@nestjs/common'
import { TimeOffService } from './time-off.service'
import { TimeOffController } from './time-off.controller'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'

@Module({
  providers: [TimeOffService, WorkspaceMemberGuard],
  controllers: [TimeOffController],
  exports: [TimeOffService],
})
export class TimeOffModule {}
