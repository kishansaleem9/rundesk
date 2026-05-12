import { Module } from '@nestjs/common'
import { CalendarSyncService } from './calendar-sync.service'
import { CalendarSyncController, IcalFeedController } from './calendar-sync.controller'

@Module({
  providers: [CalendarSyncService],
  controllers: [CalendarSyncController, IcalFeedController],
  exports: [CalendarSyncService],
})
export class CalendarSyncModule {}
