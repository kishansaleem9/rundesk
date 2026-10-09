import { Module } from '@nestjs/common'
import { CalendarSyncService } from './calendar-sync.service'
import { CalendarAccountsService } from './calendar-accounts.service'
import { CalendarSyncRulesService } from './calendar-sync-rules.service'
import { CalendarSyncController, IcalFeedController } from './calendar-sync.controller'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'

@Module({
  // The pull asks `integrations.manage`, which `PermissionsGuard` resolves.
  imports: [CustomRolesModule],
  providers: [CalendarSyncService, CalendarAccountsService, CalendarSyncRulesService],
  controllers: [CalendarSyncController, IcalFeedController],
  exports: [CalendarSyncService, CalendarAccountsService, CalendarSyncRulesService],
})
export class CalendarSyncModule {}
