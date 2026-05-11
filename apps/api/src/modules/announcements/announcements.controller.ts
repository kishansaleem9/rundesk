import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { AnnouncementsService } from './announcements.service'

@ApiTags('announcements')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/announcements')
@UseGuards(JwtAuthGuard)
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get()
  @UseGuards(WorkspaceAdminGuard)
  list(@Param('workspaceId') workspaceId: string) {
    return this.announcementsService.list(workspaceId)
  }

  @Get('active')
  @UseGuards(WorkspaceMemberGuard)
  listActive(@Param('workspaceId') workspaceId: string, @CurrentUser() user: { id: string }) {
    return this.announcementsService.listActive(workspaceId, user.id)
  }

  @Post()
  @UseGuards(WorkspaceAdminGuard)
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: { id: string },
    @Body() body: { title: string; body?: string; tone?: 'info' | 'celebrate' | 'warn'; expiresAt?: string | null; isActive?: boolean },
  ) {
    return this.announcementsService.create(workspaceId, user.id, body)
  }

  @Patch(':announcementId')
  @UseGuards(WorkspaceAdminGuard)
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('announcementId') announcementId: string,
    @Body() body: Partial<{ title: string; body: string; tone: 'info' | 'celebrate' | 'warn'; isActive: boolean; expiresAt: string | null }>,
  ) {
    return this.announcementsService.update(workspaceId, announcementId, body)
  }

  @Delete(':announcementId')
  @UseGuards(WorkspaceAdminGuard)
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('announcementId') announcementId: string,
  ) {
    return this.announcementsService.remove(workspaceId, announcementId)
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
