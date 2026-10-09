import { Module } from '@nestjs/common'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CoverPhotosController } from './cover-photos.controller'

@Module({
  providers: [WorkspaceMemberGuard],
  controllers: [CoverPhotosController],
})
export class CoverPhotosModule {}
