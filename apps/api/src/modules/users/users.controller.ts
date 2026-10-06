import { Controller, Get, Patch, Post, Put, Delete, Body, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { REFRESH_TOKEN_COOKIE } from '../auth/auth-cookies'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard'
import { AUTH_ROUTE_LIMITS } from '../../common/guards/auth-route-limits'
import { UsersService } from './users.service'
import type { CurrentUserPayload } from '../tasks/types'

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('me')
  async me(@CurrentUser() user: CurrentUserPayload) {
    const row = await this.users.findById(user.id)
    return row ? this.users.publicProfile(row) : null
  }

  @Patch('me')
  updateProfile(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { displayName?: string; bio?: string | null; timezone?: string; avatarUrl?: string | null; locale?: string; theme?: string; dateFormat?: string; timeFormat?: string; weekStart?: string; topbarHidden?: string[]; topbarPinned?: string[]; sidebarCollapsed?: boolean; panelsCollapsed?: Record<string, boolean>; highContrast?: boolean; timezoneChangeNotice?: boolean; accentColor?: string | null },
  ) {
    return this.users.updateProfile(user.id, body)
  }

  @Post('me/avatar/presign')
  presignAvatar(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { contentType: string; sizeBytes?: number },
  ) {
    return this.users.createAvatarUploadUrl(user.id, body)
  }

  /*
   * SIGN-IN'S TEN A MINUTE, PER PERSON (`found-30-sep/password-change-unthrottled`).
   * The guard is on the handler, so it runs after the class's JwtAuthGuard and
   * knows who is asking. The caller's own session is the one its refresh token
   * names: in the body for a client with no cookie, as "sign out other
   * sessions" takes it, or a browser's refresh cookie; every other is revoked.
   */
  @Post('me/change-password')
  @UseGuards(RateLimitGuard)
  @RateLimit(AUTH_ROUTE_LIMITS.passwordChange)
  @ApiOperation({ summary: 'Change the password, and sign out every other session' })
  changePassword(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { currentPassword: string; newPassword: string; currentRefreshToken?: string },
    @Req() req: { cookies?: Record<string, string | undefined> },
  ) {
    const named = typeof body?.currentRefreshToken === 'string' && body.currentRefreshToken ? body.currentRefreshToken : null
    const keep = named ?? req.cookies?.[REFRESH_TOKEN_COOKIE] ?? null
    // And the session the caller's access token names: a client naming none kept none, and was signed out by its own change.
    return this.users.changePassword(user.id, body?.currentPassword, body?.newPassword, keep, user.sid)
  }

  @Get('me/export')
  @ApiOperation({ summary: 'GDPR data export — a JSON bundle of the caller’s personal data (Plan §14.6)' })
  exportData(@CurrentUser() user: CurrentUserPayload) {
    return this.users.exportUserData(user.id)
  }

  @Delete('me')
  @ApiOperation({ summary: 'GDPR account deletion — irreversibly anonymize the caller’s account (Plan §14.6)' })
  deleteMe(@CurrentUser() user: CurrentUserPayload, @Body() body: { confirmEmail?: string }) {
    return this.users.deleteAccount(user.id, body ?? {})
  }

  // Belt-and-suspenders POST alias — some HTTP clients/proxies drop DELETE
  // bodies, and the delete flow needs the emailed confirmation in the body.
  @Post('me/delete')
  @ApiOperation({ summary: 'GDPR account deletion (POST alias with confirmation body, Plan §14.6)' })
  deleteMeViaPost(@CurrentUser() user: CurrentUserPayload, @Body() body: { confirmEmail?: string }) {
    return this.users.deleteAccount(user.id, body ?? {})
  }

  /**
   * §6 frame `087_0535` — the Notepad from Personal Tools.
   *
   * A scratch pad belongs to the person, not a workspace, so it hangs off
   * /users/me like their theme and their pinned tools rather than off a
   * workspace route that would strand a note when they switch.
   */
  @Get('me/notepad')
  @ApiOperation({ summary: 'The signed-in person’s notepad' })
  async getNotepad(@CurrentUser() user: CurrentUserPayload) {
    return this.users.getNotepad(user.id)
  }

  @Put('me/notepad')
  @ApiOperation({ summary: 'Save the notepad' })
  async saveNotepad(@CurrentUser() user: CurrentUserPayload, @Body() body: { content?: string }) {
    return this.users.saveNotepad(user.id, body?.content ?? '')
  }

}
