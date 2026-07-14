import { Module } from '@nestjs/common'
import { ProjectsService } from './projects.service'
import { ProjectsController } from './projects.controller'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'

@Module({
  imports: [CustomRolesModule],
  providers: [ProjectsService],
  controllers: [ProjectsController],
  exports: [ProjectsService],
})
export class ProjectsModule {}
