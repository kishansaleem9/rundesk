import { Module } from '@nestjs/common'
import { AnnouncementsController } from './announcements.controller'
import { AnnouncementsService } from './announcements.service'
import { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'
import { SecurityModule } from '../security/security.module'

@Module({
  imports: [SecurityModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService, WorkspaceAdminGuard],
})
export class AnnouncementsModule {}
