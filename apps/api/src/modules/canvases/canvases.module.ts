import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../common/database/database.module'
import { CanvasesController } from './canvases.controller'
import { CanvasesService } from './canvases.service'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'

@Module({
  imports: [DatabaseModule],
  controllers: [CanvasesController],
  providers: [CanvasesService, WorkspaceMemberGuard],
  exports: [CanvasesService],
})
export class CanvasesModule {}
