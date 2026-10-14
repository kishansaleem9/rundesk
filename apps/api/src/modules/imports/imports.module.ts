import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../common/database/database.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CustomFieldsModule } from '../custom-fields/custom-fields.module'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'
import { InvitationsModule } from '../invitations/invitations.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { PlansModule } from '../plans/plans.module'
import { SecurityModule } from '../security/security.module'
import { TenantDatabasesModule } from '../tenant-databases/tenant-databases.module'
import { ImportCleanupService } from './import-cleanup.service'
import { ImportRunnerService } from './import-runner.service'
import { ImportsController } from './imports.controller'
import { ImportsService } from './imports.service'

/**
 * Settings › Imports / Exports — the import engine: job lifecycle, the runner
 * (and its recovery sweep), and Delete-as-a-unit. The pre-engine importers
 * (`integrations/clickup-import`) share its job table and history.
 */
@Module({
  imports: [
    DatabaseModule,
    CustomFieldsModule,
    CustomRolesModule,
    InvitationsModule,
    NotificationsModule,
    PlansModule,
    SecurityModule,
    TenantDatabasesModule,
  ],
  controllers: [ImportsController],
  providers: [ImportsService, ImportRunnerService, ImportCleanupService, WorkspaceMemberGuard],
  exports: [ImportsService, ImportRunnerService],
})
export class ImportsModule {}
