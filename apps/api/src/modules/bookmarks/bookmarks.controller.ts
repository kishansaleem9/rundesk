import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { BookmarksService } from './bookmarks.service'

/** §G01-9 — the Overview's Bookmarks card. */
@ApiTags('bookmarks')
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/bookmarks')
export class BookmarksController {
  constructor(private readonly bookmarks: BookmarksService) {}

  @Get()
  @ApiOperation({ summary: 'Your bookmarks in this workspace' })
  list(@Param('workspaceId') workspaceId: string, @CurrentUser() user: { id: string }) {
    return this.bookmarks.list(workspaceId, user.id)
  }

  @Post()
  @ApiOperation({ summary: 'Save a Rundesk item or any URL from around the web' })
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: { id: string },
    @Body() body: { title?: string; url?: string },
  ) {
    return this.bookmarks.create(workspaceId, user.id, body)
  }

  @Delete(':bookmarkId')
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('bookmarkId') bookmarkId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.bookmarks.remove(workspaceId, user.id, bookmarkId)
  }
}
