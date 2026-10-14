import { Module } from '@nestjs/common'
import { ExportService } from './export.service'
import { ExportController } from './export.controller'
import { ExportJobsService } from './export-jobs.service'
import { ExportDownloadController, ExportJobsController } from './export-jobs.controller'
import { DatabaseModule } from '../../common/database/database.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { SecurityModule } from '../security/security.module'
import { TenantDatabasesModule } from '../tenant-databases/tenant-databases.module'
import { WorkspacesModule } from '../workspaces/workspaces.module'

@Module({
  // §A4.1 — the roster CSV reuses WorkspacesService.listMembers so the export and
  // the People screen can never drift apart.
  // Settings › Imports / Exports — the export JOBS (§5.1) announce a ready file
  // through notifications, and recover on each organisation's own database.
  imports: [DatabaseModule, SecurityModule, WorkspacesModule, CustomRolesModule, NotificationsModule, TenantDatabasesModule],
  controllers: [ExportController, ExportJobsController, ExportDownloadController],
  providers: [ExportService, ExportJobsService, WorkspaceMemberGuard],
})
export class ExportModule {}
