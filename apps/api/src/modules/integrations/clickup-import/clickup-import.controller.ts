import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ClickUpImportService, type ConflictStrategy } from './clickup-import.service'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../../auth/guards/workspace-member.guard'
import { WorkspaceAdminGuard } from '../../auth/guards/workspace-admin.guard'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'

@ApiTags('integrations:clickup-import')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@Controller('workspaces/:workspaceId/import/clickup')
export class ClickUpImportController {
  constructor(private readonly svc: ClickUpImportService) {}

  @Post('preview')
  @ApiOperation({ summary: 'Preview a ClickUp CSV — rows, lists, custom fields, duplicates' })
  preview(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { csv: string; targetSpaceId?: string },
  ) {
    return this.svc.preview(workspaceId, { csv: body.csv ?? '', targetSpaceId: body.targetSpaceId })
  }

  @Post()
  @UseGuards(WorkspaceAdminGuard)
  @ApiOperation({
    summary:
      'Start a ClickUp CSV import (admin only) — returns a job id to poll. Supply apiToken to ALSO import comments + attachments via the ClickUp API.',
  })
  run(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body()
    body: {
      csv: string
      targetSpaceId?: string
      targetProjectName?: string
      strategy?: ConflictStrategy
      /** Optional: also pull comments + attachments the CSV cannot carry. */
      apiToken?: string
    },
  ) {
    return this.svc.startImport(workspaceId, user.id, body)
  }

  @Get('jobs/:jobId')
  @ApiOperation({ summary: 'Poll an import job — status, progress counts, and final report' })
  job(@Param('workspaceId') workspaceId: string, @Param('jobId') jobId: string) {
    return this.svc.getJob(workspaceId, jobId)
  }

  @Post('jobs/:jobId/enrich')
  @UseGuards(WorkspaceAdminGuard)
  @ApiOperation({
    summary:
      'Import ClickUp comments + attachments for an already-imported job (admin only). Body: { apiToken, mapping: [{ clickupTaskId, taskId }] }.',
  })
  enrich(
    @Param('workspaceId') workspaceId: string,
    @Param('jobId') jobId: string,
    @CurrentUser() user: any,
    @Body()
    body: {
      apiToken: string
      mapping?: Array<{ clickupTaskId: string; taskId: string }>
    },
  ) {
    return this.svc.enrichJob(workspaceId, jobId, user.id, {
      apiToken: body.apiToken,
      mapping: body.mapping ?? [],
    })
  }
}
