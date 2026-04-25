import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { DocsService } from './docs.service'
import type { CurrentUserPayload } from '../tasks/types'

@ApiTags('docs')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class DocsController {
  constructor(private docs: DocsService) {}

  @Get('workspaces/:workspaceId/docs')
  list(
    @Param('workspaceId') workspaceId: string,
    @Query('spaceId') spaceId?: string,
    @Query('parentDocId') parentDocId?: string,
  ) {
    return this.docs.list(workspaceId, {
      spaceId: spaceId === 'null' ? null : spaceId,
      parentDocId: parentDocId === 'null' ? null : parentDocId,
    })
  }

  @Post('workspaces/:workspaceId/docs')
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { spaceId?: string | null; parentDocId?: string | null; title?: string; icon?: string },
  ) {
    return this.docs.create({
      workspaceId,
      spaceId: body.spaceId,
      parentDocId: body.parentDocId,
      title: body.title,
      icon: body.icon,
      createdById: user.id,
    })
  }

  @Get('docs/:docId')
  get(@Param('docId') docId: string) {
    return this.docs.get(docId)
  }

  @Patch('docs/:docId')
  update(
    @Param('docId') docId: string,
    @Body() body: {
      title?: string
      icon?: string | null
      coverImageUrl?: string | null
      content?: Record<string, unknown>
      parentDocId?: string | null
      spaceId?: string | null
      position?: number
      isArchived?: boolean
    },
  ) {
    return this.docs.update(docId, body)
  }

  @Delete('docs/:docId')
  remove(@Param('docId') docId: string) {
    return this.docs.delete(docId)
  }
}
