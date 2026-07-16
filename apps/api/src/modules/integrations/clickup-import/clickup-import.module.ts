import { Module } from '@nestjs/common'
import { ClickUpImportService } from './clickup-import.service'
import { ClickUpImportController } from './clickup-import.controller'
import { DatabaseModule } from '../../../common/database/database.module'
import { StorageModule } from '../../../common/storage/storage.module'
import { WorkspaceMemberGuard } from '../../auth/guards/workspace-member.guard'
import { WorkspaceAdminGuard } from '../../auth/guards/workspace-admin.guard'

@Module({
  // StorageModule (R2Service) is global, but imported explicitly so the ClickUp
  // API enrichment path can re-upload attachment bytes even in isolated wiring.
  imports: [DatabaseModule, StorageModule],
  controllers: [ClickUpImportController],
  providers: [ClickUpImportService, WorkspaceMemberGuard, WorkspaceAdminGuard],
  exports: [ClickUpImportService],
})
export class ClickUpImportModule {}
