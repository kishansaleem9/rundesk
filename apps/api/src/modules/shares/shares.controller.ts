import { Body, Controller, Delete, Get, Ip, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { SharesService, SHARE_LEVELS, SHARE_TYPES } from './shares.service'

/**
 * Share & Permissions for every object type — space, folder, project, list,
 * task and doc all use the same routes, so one panel in the UI serves them all.
 * Membership/permission checks live in the service (a guest may never share).
 */
@ApiTags('shares')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('shares/:objectType/:objectId')
export class SharesController {
  constructor(private shares: SharesService) {}

  @Get()
  @ApiOperation({ summary: 'Who this object is shared with, plus the caller’s own level' })
  async list(
    @Param('objectType') objectType: string,
    @Param('objectId') objectId: string,
    @CurrentUser() user: any,
  ) {
    const type = this.shares.assertType(objectType)
    // The caller's level is the one sharing reads — what the space gives them
    // counts, not only a share of their own (`sharing-asks-the-maker-not-the-level`).
    const [items, may] = await Promise.all([
      this.shares.list(type, objectId, user),
      this.shares.canShare(type, objectId, user),
    ])
    return { items, myLevel: may.level, canShare: may.allowed, levels: SHARE_LEVELS, types: SHARE_TYPES }
  }

  @Post()
  @ApiOperation({ summary: 'Share with a workspace member (userId) or an outsider (email)' })
  async share(
    @Param('objectType') objectType: string,
    @Param('objectId') objectId: string,
    @CurrentUser() user: any,
    @Ip() ip: string,
    @Body() body: { userId?: string; email?: string; level?: string },
  ) {
    return this.shares.share(this.shares.assertType(objectType), objectId, user, body, ip)
  }

  @Patch(':shareId')
  @ApiOperation({ summary: 'Change one person’s permission level' })
  async updateLevel(
    @Param('objectType') objectType: string,
    @Param('objectId') objectId: string,
    @Param('shareId') shareId: string,
    @CurrentUser() user: any,
    @Ip() ip: string,
    @Body() body: { level: string },
  ) {
    return this.shares.updateLevel(this.shares.assertType(objectType), objectId, shareId, user, body.level, ip)
  }

  /**
   * §G10 [12:16–12:20] — ask the people who can grant it.
   *
   * Deliberately NOT under the permission check the other routes share: the
   * whole point is that the caller cannot see this object. It needs only a
   * workspace membership, which the service establishes by looking the object
   * up inside `workspaceId`.
   */
  @Post('request')
  @ApiOperation({ summary: 'Ask whoever can grant it for access to this object' })
  async request(
    @Param('objectType') objectType: string,
    @Param('objectId') objectId: string,
    @Body() body: { workspaceId: string },
    @CurrentUser() user: any,
  ) {
    return this.shares.requestAccess(
      body.workspaceId,
      this.shares.assertType(objectType),
      objectId,
      { id: user.id, name: user.displayName, email: user.email },
    )
  }

  @Delete(':shareId')
  @ApiOperation({ summary: 'Revoke access' })
  async revoke(
    @Param('objectType') objectType: string,
    @Param('objectId') objectId: string,
    @Param('shareId') shareId: string,
    @CurrentUser() user: any,
    @Ip() ip: string,
  ) {
    return this.shares.revoke(this.shares.assertType(objectType), objectId, shareId, user, ip)
  }
}
