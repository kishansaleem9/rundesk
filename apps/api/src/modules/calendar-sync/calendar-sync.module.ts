import { Module } from '@nestjs/common'
import { CalendarSyncService } from './calendar-sync.service'
import { CalendarAccountsService } from './calendar-accounts.service'
import { CalendarSyncController, IcalFeedController } from './calendar-sync.controller'

@Module({
  providers: [CalendarSyncService, CalendarAccountsService],
  controllers: [CalendarSyncController, IcalFeedController],
  exports: [CalendarSyncService, CalendarAccountsService],
})
export class CalendarSyncModule {}
