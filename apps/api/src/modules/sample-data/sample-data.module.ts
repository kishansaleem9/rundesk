import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../common/database/database.module'
import { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'
import { SecurityModule } from '../security/security.module'
import { SampleDataService } from './sample-data.service'
import { SampleDataController } from './sample-data.controller'

@Module({
  imports: [DatabaseModule, SecurityModule],
  controllers: [SampleDataController],
  providers: [SampleDataService, WorkspaceAdminGuard],
  exports: [SampleDataService],
})
export class SampleDataModule {}
