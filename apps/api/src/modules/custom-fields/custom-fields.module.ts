import { Module } from '@nestjs/common'
import { CustomFieldsService } from './custom-fields.service'
import { CustomFieldsController } from './custom-fields.controller'
import { DatabaseModule } from '../../common/database/database.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'

@Module({
  imports: [DatabaseModule],
  controllers: [CustomFieldsController],
  providers: [CustomFieldsService, WorkspaceMemberGuard],
  exports: [CustomFieldsService],
})
export class CustomFieldsModule {}
