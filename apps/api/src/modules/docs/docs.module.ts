import { Module } from '@nestjs/common'
import { DocsService } from './docs.service'
import { DocsController, DocsPublicController } from './docs.controller'
import { RealtimeModule } from '../realtime/realtime.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'

@Module({
  imports: [RealtimeModule, NotificationsModule],
  providers: [DocsService, WorkspaceMemberGuard],
  controllers: [DocsController, DocsPublicController],
  exports: [DocsService],
})
export class DocsModule {}
