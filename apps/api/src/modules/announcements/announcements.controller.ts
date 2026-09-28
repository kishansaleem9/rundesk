import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { AnnouncementsService } from './announcements.service'
import { CreateAnnouncementDto, UpdateAnnouncementDto } from './dto/announcement.dto'

/*
 * THE BANNER PINNED ACROSS THE WORKSPACE is published, paused, edited, deleted
 * and listed in full (paused ones, views and dismissals) by whoever holds
 * `announcement.manage`: an admin's by default, and a custom role's where one
 * grants it. `WorkspaceAdminGuard` admitted managers, while the web offered
 * these nowhere but the platform console, and no key could hand them to anyone
 * (`found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`).
 * ClickUp has no workspace banner; its nearest, a Chat post to everyone, is
 * being restricted to owners and admins with posting permissions a role will
 * grant, and nothing there is a manager's.
 *
 * THE LIVE BANNER STAYS EVERY MEMBER'S: `active`, `view` and `dismiss` ask
 * membership alone, because the workspace home and the planner's What's new
 * read it for everybody.
 */
@ApiTags('announcements')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/announcements')
@UseGuards(JwtAuthGuard)
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get()
  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)
  @RequirePermissions('announcement.manage')
  list(@Param('workspaceId') workspaceId: string) {
    return this.announcementsService.list(workspaceId)
  }

  @Get('active')
  @UseGuards(WorkspaceMemberGuard)
  listActive(@Param('workspaceId') workspaceId: string, @CurrentUser() user: { id: string }) {
    return this.announcementsService.listActive(workspaceId, user.id)
  }

  @Post()
  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)
  @RequirePermissions('announcement.manage')
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: { id: string },
    @Body() body: CreateAnnouncementDto,
  ) {
    return this.announcementsService.create(workspaceId, user.id, body)
  }

  @Patch(':announcementId')
  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)
  @RequirePermissions('announcement.manage')
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('announcementId') announcementId: string,
    @Body() body: UpdateAnnouncementDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.announcementsService.update(workspaceId, announcementId, body, user.id)
  }

  @Delete(':announcementId')
  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)
  @RequirePermissions('announcement.manage')
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('announcementId') announcementId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.announcementsService.remove(workspaceId, announcementId, user.id)
  }

  @Post(':announcementId/view')
  @UseGuards(WorkspaceMemberGuard)
  trackView(
    @Param('workspaceId') workspaceId: string,
    @Param('announcementId') announcementId: string,
  ) {
    return this.announcementsService.trackView(workspaceId, announcementId)
  }

  @Post(':announcementId/dismiss')
  @UseGuards(WorkspaceMemberGuard)
  dismiss(
    @Param('workspaceId') workspaceId: string,
    @Param('announcementId') announcementId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.announcementsService.dismiss(workspaceId, announcementId, user.id)
  }
}
