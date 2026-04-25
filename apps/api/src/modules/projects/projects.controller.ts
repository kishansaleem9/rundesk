import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { ProjectsService } from './projects.service'

@Controller('projects')
@UseGuards(JwtAuthGuard)
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
    return this.projectsService.createProject(body.spaceId, {
      name: body.name,
      description: body.description,
      color: body.color,
      icon: body.icon,
    })
  }

  @Put(':projectId')
  async updateProject(
    @Param('projectId') projectId: string,
    @Body() body: Partial<{ name: string; description: string; color: string; icon: string }>,
  ) {
    return this.projectsService.updateProject(projectId, body)
  }

  @Delete(':projectId')
  async deleteProject(@Param('projectId') projectId: string) {
    await this.projectsService.deleteProject(projectId)
    return { message: 'Project archived successfully' }
  }
}
