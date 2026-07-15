import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { FavoritesService } from './favorites.service'
import type { CurrentUserPayload } from '../tasks/types'

@ApiTags('favorites')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/favorites')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class FavoritesController {
  constructor(private favorites: FavoritesService) {}

  @Get()
  list(@Param('workspaceId') workspaceId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.favorites.list(workspaceId, user.id)
  }

  @Post('toggle')
  toggle(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { entityType: string; entityId: string },
  ) {
    return this.favorites.toggle(workspaceId, user.id, body.entityType, body.entityId)
  }

  @Delete()
  remove(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
  ) {
    return this.favorites.remove(workspaceId, user.id, entityType, entityId)
  }
}
