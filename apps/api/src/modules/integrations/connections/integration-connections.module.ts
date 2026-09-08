import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../../common/database/database.module'
import { IntegrationConnectionsController } from './integration-connections.controller'
import { IntegrationConnectionsService } from './integration-connections.service'
import { WorkspaceMemberGuard } from '../../auth/guards/workspace-member.guard'
import { WorkspaceAdminGuard } from '../../auth/guards/workspace-admin.guard'
import { SecurityModule } from '../../security/security.module'
import { CustomRolesModule } from '../../custom-roles/custom-roles.module'
import { NotificationsModule } from '../../notifications/notifications.module'
import { CalendarSyncModule } from '../../calendar-sync/calendar-sync.module'

@Module({
  // §V2-14 — a calendar grant is also recorded as the connecting person's own
  // account, so the callback needs CalendarAccountsService.
  imports: [DatabaseModule, SecurityModule, CustomRolesModule, NotificationsModule, CalendarSyncModule],
  controllers: [IntegrationConnectionsController],
  providers: [IntegrationConnectionsService, WorkspaceMemberGuard, WorkspaceAdminGuard],
  exports: [IntegrationConnectionsService],
})
export class IntegrationConnectionsModule {}
