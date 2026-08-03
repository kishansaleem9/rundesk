import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { WorkspaceGroupsService } from './workspace-groups.service'

type CurrentUserPayload = { id: string }

@ApiTags('workspace-groups')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/groups')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class WorkspaceGroupsController {
  constructor(private groups: WorkspaceGroupsService) {}

  @Get()
  list(@Param('workspaceId') workspaceId: string, @Query('search') search?: string) {
    return this.groups.list(workspaceId, { search })
  }

  @Get(':groupId')
  get(@Param('workspaceId') workspaceId: string, @Param('groupId') groupId: string) {
    return this.groups.get(workspaceId, groupId)
  }

  @Post()
  @UseGuards(WorkspaceAdminGuard)
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { name: string; description?: string; alias?: string | null; memberIds?: string[] },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.groups.create(workspaceId, user.id, body)
  }

  @Patch(':groupId')
  @UseGuards(WorkspaceAdminGuard)
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('groupId') groupId: string,
    @Body() body: { name?: string; description?: string | null; alias?: string | null },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.groups.update(workspaceId, groupId, user.id, body)
  }

  @Delete(':groupId')
  @UseGuards(WorkspaceAdminGuard)
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('groupId') groupId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.groups.remove(workspaceId, groupId, user.id)
  }

  @Post(':groupId/members')
  @UseGuards(WorkspaceAdminGuard)
  addMembers(
    @Param('workspaceId') workspaceId: string,
    @Param('groupId') groupId: string,
    @Body() body: { userIds: string[] },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.groups.addMembers(workspaceId, groupId, user.id, body.userIds ?? [])
  }

  @Put(':groupId/members')
  @UseGuards(WorkspaceAdminGuard)
  replaceMembers(
    @Param('workspaceId') workspaceId: string,
    @Param('groupId') groupId: string,
    @Body() body: { userIds: string[] },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.groups.replaceMembers(workspaceId, groupId, user.id, body.userIds ?? [])
  }

  @Delete(':groupId/members/:userId')
  @UseGuards(WorkspaceAdminGuard)
  removeMember(
    @Param('workspaceId') workspaceId: string,
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.groups.removeMember(workspaceId, groupId, user.id, userId)
  }
}
