import { Module } from '@nestjs/common'
import { ProjectTemplatesService } from './project-templates.service'
import { ProjectTemplatesController } from './project-templates.controller'
import { DatabaseModule } from '../../common/database/database.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'

@Module({
  imports: [DatabaseModule],
  controllers: [ProjectTemplatesController],
  providers: [ProjectTemplatesService, WorkspaceMemberGuard, WorkspaceAdminGuard],
  exports: [ProjectTemplatesService],
})
export class ProjectTemplatesModule {}
