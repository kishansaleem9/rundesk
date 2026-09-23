import { Module } from '@nestjs/common'
import { ProjectTemplatesService } from './project-templates.service'
import { ProjectTemplatesController } from './project-templates.controller'
import { DatabaseModule } from '../../common/database/database.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'
import { SpacesModule } from '../spaces/spaces.module'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'

@Module({
  // §V2-13 — a `space` template makes its space through the spaces service, so
  // a space born from a template gets the creator membership and the defaults
  // a hand-made one does. SpacesModule does not reach back here, so no cycle.
  imports: [DatabaseModule, SpacesModule, CustomRolesModule],
  controllers: [ProjectTemplatesController],
  providers: [ProjectTemplatesService, WorkspaceMemberGuard, WorkspaceAdminGuard],
  exports: [ProjectTemplatesService],
})
export class ProjectTemplatesModule {}
