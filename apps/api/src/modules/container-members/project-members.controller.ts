import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { ContainerMembersService } from './container-members.service'

@ApiTags('container-members')
@ApiBearerAuth()
@Controller('projects/:projectId')
@UseGuards(JwtAuthGuard, ResourceMemberGuard)
export class ProjectMembersController {
  constructor(private members: ContainerMembersService) {}

  @Get('members')
  list(@Param('projectId') projectId: string) {
    return this.members.listProjectMembers(projectId)
  }

  /** What this person may do on the project's page, as each route would answer (`?lists=` the lists it shows). */
  @Get('capabilities')
  capabilities(@Param('projectId') projectId: string, @CurrentUser() user: any, @Query('lists') listsParam?: string) {
    return this.members.projectCapabilities(projectId, user.id, (listsParam ?? '').split(',').filter(Boolean))
  }

  @Post('members')
  add(
    @Param('projectId') projectId: string,
    @CurrentUser() user: any,
    @Body() body: { userId: string; role?: string },
  ) {
    return this.members.addProjectMember(projectId, user.id, body.userId, body.role)
  }

  @Patch('members/:userId')
  updateRole(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: any,
    @Body() body: { role: string },
  ) {
    return this.members.updateProjectMemberRole(projectId, user.id, userId, body.role)
  }

  @Delete('members/:userId')
  remove(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: any,
  ) {
    return this.members.removeProjectMember(projectId, user.id, userId)
  }

  @Patch('visibility')
  setVisibility(
    @Param('projectId') projectId: string,
    @CurrentUser() user: any,
    @Body() body: { visibility: string | null },
  ) {
    return this.members.setProjectVisibility(projectId, user.id, body.visibility)
  }
}
