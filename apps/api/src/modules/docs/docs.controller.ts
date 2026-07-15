import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Res, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { DocsService } from './docs.service'
import type { CurrentUserPayload } from '../tasks/types'

/**
 * Anonymous public-share endpoint. Lives at the root path so the slug is
 * stable and shareable as a clean URL. No auth guard so /d/<slug> works
 * for any visitor with the link.
 */
@ApiTags('docs')
@Controller()
export class DocsPublicController {
  constructor(private docs: DocsService) {}

  @Get('public/docs/:slug')
  getPublic(@Param('slug') slug: string) {
    return this.docs.getByPublicShare(slug)
  }
}

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

  // ─── Doc templates ─────────────────────────────────────────────────────────
  @Get('workspaces/:workspaceId/doc-templates')
  @UseGuards(WorkspaceMemberGuard)
  listTemplates(@Param('workspaceId') workspaceId: string) {
    return this.docs.listDocTemplates(workspaceId)
  }

  @Post('workspaces/:workspaceId/doc-templates')
  @UseGuards(WorkspaceMemberGuard)
  saveTemplate(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { docId: string; name: string; description?: string },
  ) {
    return this.docs.saveDocAsTemplate(workspaceId, user.id, body)
  }

  @Post('workspaces/:workspaceId/doc-templates/:templateId/create-doc')
  @UseGuards(WorkspaceMemberGuard)
  createFromTemplate(
    @Param('workspaceId') workspaceId: string,
    @Param('templateId') templateId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { spaceId?: string | null; title?: string },
  ) {
    return this.docs.createDocFromTemplate(workspaceId, user.id, templateId, body)
  }

  @Delete('workspaces/:workspaceId/doc-templates/:templateId')
  @UseGuards(WorkspaceMemberGuard)
  deleteTemplate(@Param('workspaceId') workspaceId: string, @Param('templateId') templateId: string) {
    return this.docs.deleteDocTemplate(workspaceId, templateId)
  }

  @Get('docs/:docId')
  get(@Param('docId') docId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.docs.getForUser(docId, user.id)
  }

  @Get('docs/:docId/export')
  async exportDoc(
    @Param('docId') docId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Res() res: any,
    @Query('format') format?: string,
  ) {
    if (format === 'pdf') {
      const { fileName, pdf } = await this.docs.exportDocPdf(docId, user.id)
      res.header('Content-Type', 'application/pdf')
      res.header('Content-Disposition', `attachment; filename="${fileName}"`)
      res.send(pdf)
      return
    }
    const { fileName, markdown } = await this.docs.exportDocMarkdown(docId, user.id)
    res.header('Content-Type', 'text/markdown; charset=utf-8')
    res.header('Content-Disposition', `attachment; filename="${fileName}"`)
    res.send(markdown)
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

  // ─── Public share ──────────────────────────────────────────────────────────

  @Post('docs/:docId/share')
  enableShare(@Param('docId') docId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.docs.enablePublicShare(docId, user.id)
  }

  @Delete('docs/:docId/share')
  disableShare(@Param('docId') docId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.docs.disablePublicShare(docId, user.id)
  }

  // ─── Version history ───────────────────────────────────────────────────────

  @Get('docs/:docId/revisions')
  listRevisions(@Param('docId') docId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.docs.listRevisions(docId, user.id)
  }

  @Get('docs/:docId/revisions/:revisionId')
  getRevision(
    @Param('docId') docId: string,
    @Param('revisionId') revisionId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.docs.getRevision(docId, revisionId, user.id)
  }

  @Post('docs/:docId/revisions/:revisionId/restore')
  restoreRevision(
    @Param('docId') docId: string,
    @Param('revisionId') revisionId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.docs.restoreRevision(docId, revisionId, user.id)
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
