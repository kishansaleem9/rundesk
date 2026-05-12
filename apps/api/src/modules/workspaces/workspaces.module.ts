import { Module } from '@nestjs/common'
import { WorkspacesService } from './workspaces.service'
import { WorkspacesController } from './workspaces.controller'
import { SecurityModule } from '../security/security.module'

@Module({
  imports: [SecurityModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesService],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
