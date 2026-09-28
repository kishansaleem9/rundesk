import { Module } from '@nestjs/common'
import { AnnouncementsController } from './announcements.controller'
import { AnnouncementsService } from './announcements.service'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'
import { SecurityModule } from '../security/security.module'

@Module({
  // `PermissionsGuard` resolves `announcement.manage` through CustomRolesService.
  imports: [SecurityModule, CustomRolesModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService, WorkspaceMemberGuard],
})
export class AnnouncementsModule {}
