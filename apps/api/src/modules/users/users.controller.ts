import { Controller, Get, Patch, Post, Put, Delete, Body, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
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

  @Post('me/change-password')
  changePassword(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    return this.users.changePassword(user.id, body.currentPassword, body.newPassword)
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
