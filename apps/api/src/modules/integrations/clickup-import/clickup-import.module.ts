import { Module } from '@nestjs/common'
import { ClickUpImportService } from './clickup-import.service'
import { ClickUpImportController } from './clickup-import.controller'
import { SpreadsheetImportService } from './spreadsheet-import.service'
import { SpreadsheetImportController } from './spreadsheet-import.controller'
import { DatabaseModule } from '../../../common/database/database.module'
import { StorageModule } from '../../../common/storage/storage.module'
import { WorkspaceMemberGuard } from '../../auth/guards/workspace-member.guard'
import { CustomRolesModule } from '../../custom-roles/custom-roles.module'

@Module({
  // StorageModule (R2Service) is global, but imported explicitly so the ClickUp
  // API enrichment path can re-upload attachment bytes even in isolated wiring.
  imports: [DatabaseModule, StorageModule, CustomRolesModule],
  // §V2-S13 frame `12:08` — the generic spreadsheet importer rides in the same
  // module because it shares the job table, the poller and the progress shape.
  controllers: [ClickUpImportController, SpreadsheetImportController],
  providers: [ClickUpImportService, SpreadsheetImportService, WorkspaceMemberGuard],
  exports: [ClickUpImportService, SpreadsheetImportService],
})
export class ClickUpImportModule {}
