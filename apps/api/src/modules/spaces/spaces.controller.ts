import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { SpacesService } from './spaces.service'

@Controller('spaces')
@UseGuards(JwtAuthGuard, ResourceMemberGuard, PermissionsGuard)
export class SpacesController {
  constructor(private spacesService: SpacesService) {}

  @Get('workspace/:workspaceId')
  async getSpacesByWorkspace(@Param('workspaceId') workspaceId: string) {
    return this.spacesService.getSpacesByWorkspace(workspaceId)
  }

  @Get(':spaceId')
  async getSpace(@Param('spaceId') spaceId: string) {
    return this.spacesService.getSpace(spaceId)
  }

  @Post()
  @RequirePermissions('space.create')
  async createSpace(
    @CurrentUser() user: any,
    @Body() body: { workspaceId: string; name: string; description?: string; color?: string; icon?: string },
  ) {
    return this.spacesService.createSpace(
      body.workspaceId,
      {
        name: body.name,
        description: body.description,
        color: body.color,
        icon: body.icon,
      },
      user.id,
    )
  }

  @Put(':spaceId')
  async updateSpace(
    @Param('spaceId') spaceId: string,
    @CurrentUser() user: any,
    @Body() body: Partial<{ name: string; description: string; color: string; icon: string }>,
  ) {
    return this.spacesService.updateSpace(spaceId, body, user.id)
  }

  @Delete(':spaceId')
  async deleteSpace(@Param('spaceId') spaceId: string, @CurrentUser() user: any) {
    await this.spacesService.deleteSpace(spaceId, user.id)
    return { message: 'Space archived successfully' }
  }
}
