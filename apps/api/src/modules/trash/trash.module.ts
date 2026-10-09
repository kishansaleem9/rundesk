import { Module } from '@nestjs/common'
import { TrashService } from './trash.service'
import { TrashController } from './trash.controller'
import { SecurityModule } from '../security/security.module'
import { CalendarSyncModule } from '../calendar-sync/calendar-sync.module'

@Module({
  imports: [SecurityModule, CalendarSyncModule],
  controllers: [TrashController],
  providers: [TrashService],
  exports: [TrashService],
})
export class TrashModule {}
