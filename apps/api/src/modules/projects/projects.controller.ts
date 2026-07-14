import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { ProjectsService } from './projects.service'

@Controller('projects')
@UseGuards(JwtAuthGuard, ResourceMemberGuard, PermissionsGuard)
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Get('space/:spaceId')
  async getProjectsBySpace(@Param('spaceId') spaceId: string, @CurrentUser() user: any) {
    return this.projectsService.getProjectsBySpace(spaceId, user.id)
  }

  @Get(':projectId')
  async getProject(@Param('projectId') projectId: string) {
    return this.projectsService.getProject(projectId)
  }

  @Post()
  @RequirePermissions('project.create')
  async createProject(
    @CurrentUser() user: any,
    @Body() body: { spaceId: string; name: string; description?: string; color?: string; icon?: string; folderId?: string },
  ) {
    return this.projectsService.createProject(
      body.spaceId,
      {
        name: body.name,
        description: body.description,
        color: body.color,
        icon: body.icon,
        folderId: body.folderId,
      },
      user.id,
    )
  }

  @Put(':projectId')
  async updateProject(
    @Param('projectId') projectId: string,
    @CurrentUser() user: any,
    @Body() body: Partial<{ name: string; description: string; color: string; icon: string; folderId: string | null }>,
  ) {
    return this.projectsService.updateProject(projectId, body, user.id)
  }

  @Delete(':projectId')
  async deleteProject(@Param('projectId') projectId: string, @CurrentUser() user: any) {
    await this.projectsService.deleteProject(projectId, user.id)
    return { message: 'Project archived successfully' }
  }
}
