import { Module } from '@nestjs/common'
import { DocsService } from './docs.service'
import { DocsController } from './docs.controller'
import { RealtimeModule } from '../realtime/realtime.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'

@Module({
  imports: [RealtimeModule, NotificationsModule],
  providers: [DocsService, WorkspaceMemberGuard],
  controllers: [DocsController],
  exports: [DocsService],
})
export class DocsModule {}
