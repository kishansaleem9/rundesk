import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ClickUpImportService, type ConflictStrategy } from './clickup-import.service'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../../auth/guards/workspace-member.guard'
import { PermissionsGuard, RequirePermissions } from '../../custom-roles/permissions.guard'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'

@ApiTags('integrations:clickup-import')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@Controller('workspaces/:workspaceId/import/clickup')
export class ClickUpImportController {
  constructor(private readonly svc: ClickUpImportService) {}

  @Post('preview')
  // Asked as the import is: its duplicate count told any member or guest what
  // a private space or list held (`found-6-oct/import-previews-tell-what-private-places-hold`).
  @UseGuards(PermissionsGuard)
  @RequirePermissions('workspace.import')
  @ApiOperation({ summary: 'Preview a ClickUp CSV — rows, lists, custom fields, duplicates' })
  preview(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body() body: { csv: string; targetSpaceId?: string },
  ) {
    return this.svc.preview(workspaceId, { id: user.id, role: user.role }, { csv: body.csv ?? '', targetSpaceId: body.targetSpaceId })
  }

  @Post()
  // Importing asks `workspace.import`, an admin's by default, as ClickUp has it
  // (`found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`).
  @UseGuards(PermissionsGuard)
  @RequirePermissions('workspace.import')
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
    return this.svc.startImport(workspaceId, { id: user.id, role: user.role }, body)
  }

  @Get('jobs/:jobId')
  // The history and each job's report are asked what the imports ask: any
  // member or guest read every import's report, whose errors quote the rows a
  // private space's import refused (`found-6-oct/import-history-read-by-anyone`).
  @UseGuards(PermissionsGuard)
  @RequirePermissions('workspace.import')
  @ApiOperation({ summary: 'Poll an import job (who may import) — status, progress counts, and final report' })
  job(@Param('workspaceId') workspaceId: string, @Param('jobId') jobId: string, @CurrentUser() user: any) {
    return this.svc.readJob(workspaceId, jobId, { id: user.id, role: user.role })
  }

  @Post('jobs/:jobId/enrich')
  // Importing asks `workspace.import`, an admin's by default, as ClickUp has it
  // (`found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`).
  @UseGuards(PermissionsGuard)
  @RequirePermissions('workspace.import')
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
    return this.svc.enrichJob(workspaceId, jobId, { id: user.id, role: user.role }, {
      apiToken: body.apiToken,
      mapping: body.mapping ?? [],
    })
  }
}
