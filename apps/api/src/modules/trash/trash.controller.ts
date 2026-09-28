import { Controller, Get, Post, Delete, Param, Query, Ip, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { TrashService, TRASH_TYPES, TRASH_RETENTION_DAYS, type TrashType } from './trash.service'

/**
 * §13.4 Workspace Trash — one place to see everything that was deleted
 * (spaces, folders, projects, lists, tasks, docs) and either restore it or
 * remove it for good. Membership is enforced by the guard; the service further
 * narrows a non-admin to the items they deleted themselves.
 */
@ApiTags('trash')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@Controller('workspaces/:workspaceId/trash')
export class TrashController {
  constructor(private readonly trash: TrashService) {}

  /** Comma-separated query lists ("task,folder") → validated array. */
  private parseTypes(raw?: string): TrashType[] | undefined {
    if (!raw) return undefined
    const parsed = raw.split(',').map((s) => s.trim()).filter(Boolean)
      .filter((s): s is TrashType => (TRASH_TYPES as readonly string[]).includes(s))
    return parsed.length ? parsed : undefined
  }

  @Get()
  @ApiOperation({ summary: 'List everything in this workspace’s trash' })
  async list(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Query('types') types?: string,
    @Query('deletedBy') deletedBy?: string,
    @Query('search') search?: string,
  ) {
    const items = await this.trash.list(workspaceId, user, {
      types: this.parseTypes(types),
      deletedByIds: deletedBy ? deletedBy.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      search,
    })
    return { items, retentionDays: TRASH_RETENTION_DAYS, types: TRASH_TYPES }
  }

  @Get('deleters')
  @ApiOperation({ summary: 'Distinct people who deleted something (for the "Deleted by" filter)' })
  async deleters(@Param('workspaceId') workspaceId: string, @CurrentUser() user: any) {
    return this.trash.deleters(workspaceId, user)
  }

  @Post(':type/:id/restore')
  @ApiOperation({ summary: 'Restore a trashed item (and any archived ancestors)' })
  async restore(
    @Param('workspaceId') workspaceId: string,
    @Param('type') type: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Ip() ip: string,
  ) {
    return this.trash.restore(workspaceId, type, id, user, ip)
  }

  @Delete(':type/:id')
  @ApiOperation({ summary: 'Delete a trashed item forever (a workspace admin only)' })
  async deleteForever(
    @Param('workspaceId') workspaceId: string,
    @Param('type') type: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Ip() ip: string,
  ) {
    return this.trash.deleteForever(workspaceId, type, id, user, ip)
  }

  @Delete()
  @ApiOperation({ summary: 'Empty the trash (a workspace admin only)' })
  async clearAll(@Param('workspaceId') workspaceId: string, @CurrentUser() user: any, @Ip() ip: string) {
    return this.trash.clearAll(workspaceId, user, ip)
  }
}
