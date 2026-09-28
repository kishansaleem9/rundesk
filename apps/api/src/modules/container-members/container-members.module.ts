import { Module } from '@nestjs/common'
import { ContainerMembersService } from './container-members.service'
import { SpaceMembersController } from './space-members.controller'
import { ProjectMembersController } from './project-members.controller'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'

@Module({
  // CustomRolesModule: a project page's capabilities ask the delete keys its routes ask.
  imports: [CustomRolesModule],
  controllers: [SpaceMembersController, ProjectMembersController],
  providers: [ContainerMembersService],
  exports: [ContainerMembersService],
})
export class ContainerMembersModule {}
