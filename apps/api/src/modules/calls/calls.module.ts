import { Module } from '@nestjs/common'
import { CallsService } from './calls.service'
import { CallsController } from './calls.controller'
import { RealtimeModule } from '../realtime/realtime.module'
import { MeetingsModule } from '../meetings/meetings.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'

@Module({
  // MeetingsModule so a call that ends leaves a meeting record behind rather
  // than a second, parallel history of its own.
  imports: [RealtimeModule, MeetingsModule],
  providers: [CallsService, WorkspaceMemberGuard],
  controllers: [CallsController],
  exports: [CallsService],
})
export class CallsModule {}
