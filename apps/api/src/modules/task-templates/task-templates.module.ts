import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../common/database/database.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'
import { TasksModule } from '../tasks/tasks.module'
import { SecurityModule } from '../security/security.module'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'
import { CustomFieldsModule } from '../custom-fields/custom-fields.module'
import { TaskTemplatesService } from './task-templates.service'
import { TaskTemplatesController } from './task-templates.controller'

@Module({
  // CustomFieldsModule: every value a template or a duplicate writes onto a
  // task passes the field route's own rules (`CustomFieldsService.checkValue`).
  imports: [DatabaseModule, TasksModule, SecurityModule, CustomRolesModule, CustomFieldsModule],
  controllers: [TaskTemplatesController],
  providers: [TaskTemplatesService, WorkspaceMemberGuard, WorkspaceAdminGuard],
  exports: [TaskTemplatesService],
})
export class TaskTemplatesModule {}
