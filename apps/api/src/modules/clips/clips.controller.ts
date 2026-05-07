import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { ClipsService } from './clips.service'

@ApiTags('clips')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/clips')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class ClipsController {
  constructor(private readonly clips: ClipsService) {}

  @Get()
  list(@Param('workspaceId') workspaceId: string) {
    return this.clips.list(workspaceId)
  }

  @Post('presign')
  presign(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: { email: string },
    @Body() body: { fileName: string; contentType: string; durationSeconds?: number; title?: string },
  ) {
    return this.clips.createUploadUrl(workspaceId, user.email, body)
  }

  @Delete()
  remove(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { storageKey: string },
  ) {
    return this.clips.remove(workspaceId, body.storageKey)
  }

  @Post('share')
  share(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: { id: string; email: string; role?: string },
    @Body()
    body: {
      storageKey: string
      mode: 'member' | 'external' | 'public'
      userId?: string
      email?: string
      expiresInMinutes?: number
    },
  ) {
    return this.clips.share(workspaceId, user.id, user.email, body)
  }
}

