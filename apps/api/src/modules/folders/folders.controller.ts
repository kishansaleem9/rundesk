import { Body, Controller, Delete, Get, Ip, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { FoldersService } from './folders.service'

@ApiTags('folders')
@ApiBearerAuth()
@Controller('spaces/:spaceId/folders')
@UseGuards(JwtAuthGuard, ResourceMemberGuard, PermissionsGuard)
export class FoldersController {
  constructor(private folders: FoldersService) {}

  @Get()
  list(@Param('spaceId') spaceId: string, @CurrentUser() user: any) {
    return this.folders.listBySpace(spaceId, { id: user.id, role: user.role })
  }

  @Post()
  @RequirePermissions('space.create')
  create(
    @Param('spaceId') spaceId: string,
    @CurrentUser() user: any,
    @Body() body: { name: string; color?: string },
  ) {
    return this.folders.create(spaceId, body, user.id)
  }

  @Patch(':folderId')
  @RequirePermissions('space.create')
  update(
    @Param('spaceId') spaceId: string,
    @Param('folderId') folderId: string,
    @Body() body: { name?: string; color?: string; position?: number; visibility?: 'public' | 'private' },
  ) {
    return this.folders.update(spaceId, folderId, body)
  }

  @Delete(':folderId')
  @RequirePermissions('space.create')
  remove(
    @Param('spaceId') spaceId: string,
    @Param('folderId') folderId: string,
    @CurrentUser() user: any,
    @Ip() ip: string,
  ) {
    return this.folders.remove(spaceId, folderId, user.id, ip)
  }
}
