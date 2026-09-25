import { Module } from '@nestjs/common'
import { CalendarSyncService } from './calendar-sync.service'
import { CalendarAccountsService } from './calendar-accounts.service'
import { CalendarSyncController, IcalFeedController } from './calendar-sync.controller'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'

@Module({
  // The pull asks `integrations.manage`, which `PermissionsGuard` resolves.
  imports: [CustomRolesModule],
  providers: [CalendarSyncService, CalendarAccountsService],
  controllers: [CalendarSyncController, IcalFeedController],
  exports: [CalendarSyncService, CalendarAccountsService],
})
export class CalendarSyncModule {}
