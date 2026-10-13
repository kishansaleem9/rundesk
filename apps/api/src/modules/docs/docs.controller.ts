import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Res, UseGuards, BadRequestException } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard'
import { PUBLIC_ROUTE_LIMITS, RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard'
import { FeatureFlag } from '../../common/decorators/feature-flag.decorator'
import { FLAGS } from '@rundesk/feature-flags'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { DocsService, DOC_SCOPES, DOC_IMPORT_ACCEPTS, docFileKind, type DocScope } from './docs.service'
import { unknownDocUpdateFields } from './doc-update-fields'
import type { CurrentUserPayload } from '../tasks/types'

/**
 * Anonymous public-share endpoint. Lives at the root path so the slug is
 * stable and shareable as a clean URL. No auth guard so /d/<slug> works
 * for any visitor with the link — and a limit per address, so one address
 * cannot flood it (`found-30-sep/public-routes-unthrottled`).
 */
@ApiTags('docs')
@Controller()
@UseGuards(RateLimitGuard)
export class DocsPublicController {
  constructor(private docs: DocsService) {}

  @Get('public/docs/:slug')
  // Opening the link asks this once: a page's budget (PUBLIC_ROUTE_LIMITS).
  @RateLimit(PUBLIC_ROUTE_LIMITS.page)
  getPublic(@Param('slug') slug: string) {
    return this.docs.getByPublicShare(slug)
  }
}

@ApiTags('docs')
@ApiBearerAuth()
@Controller()
// Backend feature-flag enforcement for Docs (DOCS is default-enabled → no change
// for existing workspaces; disabling it 404s the authed docs API). The public
// share controller above is intentionally NOT gated. FeatureFlagGuard runs after
// JwtAuthGuard so the user/workspace context is available.
@UseGuards(JwtAuthGuard, FeatureFlagGuard)
@FeatureFlag(FLAGS.DOCS)
export class DocsController {
  constructor(private docs: DocsService) {}

  @Get('workspaces/:workspaceId/docs')
  @UseGuards(WorkspaceMemberGuard)
  list(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('spaceId') spaceId?: string,
    @Query('parentDocId') parentDocId?: string,
    @Query('scope') scope?: string,
  ) {
    return this.docs.list(workspaceId, {
      spaceId: spaceId === 'null' ? null : spaceId,
      parentDocId: parentDocId === 'null' ? null : parentDocId,
      scope: (DOC_SCOPES as readonly string[]).includes(scope ?? '') ? (scope as DocScope) : 'all',
      userId: user.id,
    })
  }

  // Bucket totals for the docs hub rail (A5.6).
  @Get('workspaces/:workspaceId/docs/scope-counts')
  @UseGuards(WorkspaceMemberGuard)
  scopeCounts(@Param('workspaceId') workspaceId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.docs.scopeCounts(workspaceId, user.id)
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

  /**
   * §V2-10 — the other end of a task↔doc link.
   *
   * `[06:15]` "acha, is document ka yeh task hai". The task side has existed
   * since relationships shipped; the doc side was never read, so linking from a
   * task and then opening the doc showed no sign of it.
   */
  @Get('docs/:docId/tasks')
  linkedTasks(@Param('docId') docId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.docs.listLinkedTasks(docId, user.id, user.role)
  }

  @Get('docs/:docId/export')
  async exportDoc(
    @Param('docId') docId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Res() res: any,
    @Query('format') format?: string,
  ) {
    // Named by `downloadName`, the whole title in `filename*`; the page saves under it.
    if (format === 'pdf') {
      const { disposition, pdf } = await this.docs.exportDocPdf(docId, user.id)
      res.header('Content-Type', 'application/pdf')
      res.header('Content-Disposition', disposition)
      res.send(pdf)
      return
    }
    const { disposition, markdown } = await this.docs.exportDocMarkdown(docId, user.id)
    res.header('Content-Type', 'text/markdown; charset=utf-8')
    res.header('Content-Disposition', disposition)
    res.send(markdown)
  }

  /**
   * §V2-S13 frame `12:05` — Imports › **Document files**.
   *
   * Two ways in. A file uploaded to the store and named by its key
   * (`fileKey`, `import-files.ts`) is read as what its name says: Word
   * (.docx), HTML or Markdown and text — ClickUp's Docs import reads the first
   * three (`commit-log/log-601eacc-2`), and a .docx is a zip that does not
   * survive being sent as text. Markdown or text sent AS TEXT (`markdown`) is
   * read as it always was. A name of any other kind is refused in the words
   * that say which kinds work.
   */
  @Post('workspaces/:workspaceId/docs/import')
  // WorkspaceMemberGuard, exactly as the `create` endpoint above carries it.
  // Without it any authenticated user could import a doc into ANY workspace by
  // id: the class guards prove WHO you are and that Docs are enabled, neither
  // of which says you belong to the workspace named in the path. This was
  // missing when the endpoint was first written and was found by reading the
  // sibling route rather than by any test — a write that lands in the wrong
  // workspace succeeds, so nothing fails to notice.
  @UseGuards(WorkspaceMemberGuard)
  importDoc(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { fileName?: string; markdown?: string; fileKey?: string; spaceId?: string | null },
  ) {
    const name = body?.fileName ?? ''
    if (body?.fileKey !== undefined) {
      return this.docs.importDocFile(workspaceId, user.id, { fileKey: body.fileKey, fileName: name, spaceId: body?.spaceId ?? null })
    }
    if (name && !/\.(md|markdown|txt)$/i.test(name)) {
      throw new BadRequestException(
        `Markdown and plain text are sent as text; ${docFileKind(name) ? 'upload this file and send its key' : `"${name}" is none of the kinds read`}. ${DOC_IMPORT_ACCEPTS}`,
      )
    }
    return this.docs.importDocFromMarkdown(workspaceId, user.id, {
      fileName: name,
      markdown: body?.markdown ?? '',
      spaceId: body?.spaceId ?? null,
    })
  }

  /**
   * Imports › **Confluence**: a space's HTML export, uploaded to the store
   * (`import-files.ts`), made into one Doc for the space with its pages inside
   * it (`DocsService.importConfluence`, `commit-log/log-601eacc-2`).
   */
  @Post('workspaces/:workspaceId/docs/import/confluence')
  @UseGuards(WorkspaceMemberGuard)
  importConfluence(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { fileKey?: string; spaceId?: string | null },
  ) {
    return this.docs.importConfluence(workspaceId, user.id, { fileKey: body?.fileKey, spaceId: body?.spaceId ?? null })
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
    // Refused BY NAME rather than dropped: a client sending `publicShareId`
    // is told where public links are made, instead of getting a 200 and no
    // link. See doc-update-fields.ts for what this route used to let through.
    const unknown = unknownDocUpdateFields(body)
    if (unknown.length > 0) {
      throw new BadRequestException(
        `These fields cannot be changed here: ${unknown.join(', ')}.` +
          (unknown.includes('publicShareId') || unknown.includes('publicShareEnabledAt')
            ? ' A public link is made with POST /docs/:docId/share.'
            : '') +
          (unknown.includes('workspaceId') ? ' A doc cannot be moved to another workspace.' : ''),
      )
    }
    return this.docs.update(docId, user.id, body)
  }

  /** What the caller may do to the doc — the checks its routes ask. */
  @Get('docs/:docId/capabilities')
  capabilities(@Param('docId') docId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.docs.capabilities(docId, user.id)
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
