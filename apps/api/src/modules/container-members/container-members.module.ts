import { Module } from '@nestjs/common'
import { ContainerMembersService } from './container-members.service'
import { SpaceMembersController } from './space-members.controller'
import { ProjectMembersController } from './project-members.controller'

@Module({
  controllers: [SpaceMembersController, ProjectMembersController],
  providers: [ContainerMembersService],
  exports: [ContainerMembersService],
})
export class ContainerMembersModule {}
