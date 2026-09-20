import { Module } from '@nestjs/common'
import { WorkspaceGroupsService } from './workspace-groups.service'
import { WorkspaceGroupsController, TeamsHubController } from './workspace-groups.controller'
import { SecurityModule } from '../security/security.module'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [SecurityModule, AuthModule],
  controllers: [WorkspaceGroupsController, TeamsHubController],
  providers: [WorkspaceGroupsService],
  exports: [WorkspaceGroupsService],
})
export class WorkspaceGroupsModule {}
