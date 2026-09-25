import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../common/database/database.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'
import { SecurityModule } from '../security/security.module'
import { SampleDataService } from './sample-data.service'
import { SampleDataController } from './sample-data.controller'

@Module({
  imports: [DatabaseModule, SecurityModule, CustomRolesModule],
  controllers: [SampleDataController],
  providers: [SampleDataService, WorkspaceMemberGuard],
  exports: [SampleDataService],
})
export class SampleDataModule {}
