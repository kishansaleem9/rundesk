import { Controller, Get, Patch, Post, Body, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
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
    @Body() body: { displayName?: string; bio?: string | null; timezone?: string; avatarUrl?: string | null; locale?: string },
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
}
