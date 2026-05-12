import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
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
  @UseGuards(WorkspaceMemberGuard)
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
  @UseGuards(WorkspaceMemberGuard)
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
  get(@Param('docId') docId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.docs.getForUser(docId, user.id)
  }

  @Patch('docs/:docId')
  update(
    @Param('docId') docId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: {
      title?: string
      icon?: string | null
      coverImageUrl?: string | null
      content?: Record<string, unknown>
      parentDocId?: string | null
      spaceId?: string | null
      position?: number
      isArchived?: boolean
      expectedUpdatedAt?: string
    },
  ) {
    return this.docs.update(docId, user.id, body)
  }

  @Delete('docs/:docId')
  remove(@Param('docId') docId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.docs.deleteForUser(docId, user.id)
  }

  // ─── Comments ──────────────────────────────────────────────────────────────

  @Get('docs/:docId/comments')
  listComments(
    @Param('docId') docId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('includeResolved') includeResolved?: string,
  ) {
    return this.docs.listComments(docId, user.id, {
      includeResolved: includeResolved !== 'false',
    })
  }

  @Post('docs/:docId/comments')
  createComment(
    @Param('docId') docId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { body: string; parentCommentId?: string | null; selection?: { from: number; to: number; quote?: string } | null },
  ) {
    return this.docs.createComment(docId, user.id, body)
  }

  @Patch('docs/comments/:commentId')
  updateComment(
    @Param('commentId') commentId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { body?: string },
  ) {
    return this.docs.updateComment(commentId, user.id, body)
  }

  @Post('docs/comments/:commentId/resolve')
  resolveComment(
    @Param('commentId') commentId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { resolved?: boolean },
  ) {
    return this.docs.setCommentResolution(commentId, user.id, body.resolved !== false)
  }

  @Delete('docs/comments/:commentId')
  removeComment(@Param('commentId') commentId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.docs.deleteComment(commentId, user.id)
  }
}
