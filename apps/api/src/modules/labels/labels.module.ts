import { Module } from '@nestjs/common'
import { LabelsService } from './labels.service'
import { LabelsController } from './labels.controller'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'

@Module({
  providers: [LabelsService, WorkspaceMemberGuard],
  controllers: [LabelsController],
  exports: [LabelsService],
})
export class LabelsModule {}
