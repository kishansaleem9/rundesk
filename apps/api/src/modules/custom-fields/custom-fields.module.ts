import { Module } from '@nestjs/common'
import { CustomFieldsService } from './custom-fields.service'
import { CustomFieldsController } from './custom-fields.controller'
import { DatabaseModule } from '../../common/database/database.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { AutomationsModule } from '../automations/automations.module'

@Module({
  // AutomationsModule: a Button's press runs its automations (`ledger-rows/row-719`).
  // It imports nothing that imports this module, so there is no cycle.
  imports: [DatabaseModule, AutomationsModule],
  controllers: [CustomFieldsController],
  providers: [CustomFieldsService, WorkspaceMemberGuard],
  exports: [CustomFieldsService],
})
export class CustomFieldsModule {}
