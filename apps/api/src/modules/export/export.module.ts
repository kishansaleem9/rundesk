import { Module } from '@nestjs/common'
import { ExportService } from './export.service'
import { ExportController } from './export.controller'
import { DatabaseModule } from '../../common/database/database.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'
import { SecurityModule } from '../security/security.module'
import { WorkspacesModule } from '../workspaces/workspaces.module'

@Module({
  // §A4.1 — the roster CSV reuses WorkspacesService.listMembers so the export and
  // the People screen can never drift apart.
  imports: [DatabaseModule, SecurityModule, WorkspacesModule],
  controllers: [ExportController],
  providers: [ExportService, WorkspaceMemberGuard, WorkspaceAdminGuard],
})
export class ExportModule {}
