import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { PUBLIC_ROUTE_LIMITS, RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { ClipsService } from './clips.service'

@ApiTags('clips')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/clips')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class ClipsController {
  constructor(private readonly clips: ClipsService) {}

  /**
   * The library, as its reader may see it: a guest's is the clips they
   * recorded. Every route here asks the clip rule (`clip-access.ts`) about the
   * reader `ClipsService.readerOf` reads, the one search and a task's copy read.
   */
  @Get()
  async list(@Param('workspaceId') workspaceId: string, @CurrentUser() user: { id: string }) {
    return this.clips.list(workspaceId, await this.clips.readerOf(workspaceId, user.id))
  }

  @Post('presign')
  presign(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: { id: string; email: string },
    @Body() body: { fileName: string; contentType: string; durationSeconds?: number; title?: string },
  ) {
    return this.clips.createUploadUrl(workspaceId, { id: user.id, email: user.email }, body)
  }

  /** By its recorder, or by somebody who manages the workspace; anybody else is refused, and told who may. */
  @Delete()
  async remove(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: { id: string },
    @Body() body: { storageKey: string },
  ) {
    return this.clips.remove(workspaceId, body.storageKey, await this.clips.readerOf(workspaceId, user.id))
  }

  /**
   * The clip's link, `{ token, path, audience }`: the same one every time
   * (`resume-defects/resume-7`). Anybody who may read the clip may ask: a
   * member any clip they can list, a guest the clips they recorded
   * (`found-5-oct/guests-read-and-delete-every-clip`).
   */
  @Post('link')
  @ApiOperation({ summary: 'The clip’s stable link (/clips/<token>)' })
  async link(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: { id: string },
    @Body() body: { storageKey: string },
  ) {
    return this.clips.link(workspaceId, await this.clips.readerOf(workspaceId, user.id), body?.storageKey)
  }

  @Post('share')
  async share(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: { id: string; email: string; role?: string },
    @Body()
    body: {
      storageKey: string
      mode: 'member' | 'external' | 'public'
      userId?: string
      email?: string
    },
  ) {
    return this.clips.share(workspaceId, await this.clips.readerOf(workspaceId, user.id), user.email, body)
  }
}

/**
 * WHAT A CLIP'S LINK PLAYS, for whoever opens `/clips/<token>`
 * (`resume-defects/resume-7`). No sign-in needed where the workspace allows
 * public links, as ClickUp's clips need none; the session is read when there
 * is one, because a workspace that blocks public sharing lets only its members
 * in. Signed again on every call — see `ClipsService.watch`.
 *
 * Limited per address before the session is read, so a flood is refused
 * before it costs the store a look at the object (`found-30-sep/public-routes-unthrottled`).
 */
@ApiTags('clips')
@Controller('public/clips')
@UseGuards(RateLimitGuard, OptionalJwtAuthGuard)
export class ClipsPublicController {
  constructor(private readonly clips: ClipsService) {}

  @Get(':token')
  // Opening the link asks this once: a page's budget (PUBLIC_ROUTE_LIMITS).
  @RateLimit(PUBLIC_ROUTE_LIMITS.page)
  @ApiOperation({ summary: 'Open a clip’s link: its title and a freshly signed playback URL' })
  watch(@Param('token') token: string, @CurrentUser() user: { id: string; role?: string } | null) {
    return this.clips.watch(token, user)
  }
}
