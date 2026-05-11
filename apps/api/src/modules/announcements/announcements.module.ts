import { Module } from '@nestjs/common'
import { AnnouncementsController } from './announcements.controller'
import { AnnouncementsService } from './announcements.service'
import { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'

@Module({
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService, WorkspaceAdminGuard],
})
export class AnnouncementsModule {}
