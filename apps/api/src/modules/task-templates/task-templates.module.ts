import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../common/database/database.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'
import { TasksModule } from '../tasks/tasks.module'
import { SecurityModule } from '../security/security.module'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'
import { TaskTemplatesService } from './task-templates.service'
import { TaskTemplatesController } from './task-templates.controller'

@Module({
  imports: [DatabaseModule, TasksModule, SecurityModule, CustomRolesModule],
  controllers: [TaskTemplatesController],
  providers: [TaskTemplatesService, WorkspaceMemberGuard, WorkspaceAdminGuard],
  exports: [TaskTemplatesService],
})
export class TaskTemplatesModule {}
