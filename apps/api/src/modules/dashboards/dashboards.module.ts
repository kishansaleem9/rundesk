import { Module } from '@nestjs/common'
import { DashboardsService } from './dashboards.service'
import { DashboardsController } from './dashboards.controller'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'

@Module({
  // Setting and clearing the workspace default ask `dashboard.workspace_default.manage`,
  // so `PermissionsGuard` needs `CustomRolesService`.
  imports: [CustomRolesModule],
  controllers: [DashboardsController],
  providers: [DashboardsService],
  exports: [DashboardsService],
})
export class DashboardsModule {}
