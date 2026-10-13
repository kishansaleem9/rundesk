import { Module } from '@nestjs/common'
import { DocsService } from './docs.service'
import { DocsController, DocsPublicController } from './docs.controller'
import { RealtimeModule } from '../realtime/realtime.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { RateLimitGuard } from '../../common/guards/rate-limit.guard'
import { ImportFilesModule } from '../integrations/clickup-import/import-files.module'

@Module({
  // ImportFilesModule: a Word or HTML file, or a Confluence export, is uploaded to the store and read from it.
  imports: [RealtimeModule, NotificationsModule, ImportFilesModule],
  providers: [DocsService, WorkspaceMemberGuard, RateLimitGuard],
  controllers: [DocsController, DocsPublicController],
  exports: [DocsService],
})
export class DocsModule {}
