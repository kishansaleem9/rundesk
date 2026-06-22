import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { ProjectsService } from './projects.service'

@Controller('projects')
@UseGuards(JwtAuthGuard, ResourceMemberGuard)
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Get('space/:spaceId')
  async getProjectsBySpace(@Param('spaceId') spaceId: string) {
    return this.projectsService.getProjectsBySpace(spaceId)
  }

  @Get(':projectId')
  async getProject(@Param('projectId') projectId: string) {
    return this.projectsService.getProject(projectId)
  }

  @Post()
  async createProject(
    @CurrentUser() user: any,
    @Body() body: { spaceId: string; name: string; description?: string; color?: string; icon?: string },
  ) {
    return this.projectsService.createProject(
      body.spaceId,
      {
        name: body.name,
        description: body.description,
        color: body.color,
        icon: body.icon,
      },
      user.id,
    )
  }

  @Put(':projectId')
  async updateProject(
    @Param('projectId') projectId: string,
    @CurrentUser() user: any,
    @Body() body: Partial<{ name: string; description: string; color: string; icon: string }>,
  ) {
    return this.projectsService.updateProject(projectId, body, user.id)
  }

  @Delete(':projectId')
  async deleteProject(@Param('projectId') projectId: string, @CurrentUser() user: any) {
    await this.projectsService.deleteProject(projectId, user.id)
    return { message: 'Project archived successfully' }
  }
}
