import { Module } from '@nestjs/common'
import { ClickUpImportService } from './clickup-import.service'
import { ClickUpImportController } from './clickup-import.controller'
import { DatabaseModule } from '../../../common/database/database.module'
import { WorkspaceMemberGuard } from '../../auth/guards/workspace-member.guard'
import { WorkspaceAdminGuard } from '../../auth/guards/workspace-admin.guard'

@Module({
  imports: [DatabaseModule],
  controllers: [ClickUpImportController],
  providers: [ClickUpImportService, WorkspaceMemberGuard, WorkspaceAdminGuard],
  exports: [ClickUpImportService],
})
export class ClickUpImportModule {}
