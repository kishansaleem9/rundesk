import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  SpreadsheetImportService,
  SHEET_SOURCE,
  type SheetConflictStrategy,
} from './spreadsheet-import.service'
import type { ColumnMapping, SheetDelimiter } from './spreadsheet-import.util'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../../auth/guards/workspace-member.guard'
import { PermissionsGuard, RequirePermissions } from '../../custom-roles/permissions.guard'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'

/**
 * §V2-S13 frame `12:08` — Create › Imports ›.
 *
 * The generic spreadsheet importer. `GET sources` is the single catalogue the
 * picker draws from, including the four rows of the frame this build does NOT
 * cover and the reason for each, so the UI cannot invent a tile the server
 * cannot serve.
 */
@ApiTags('integrations:spreadsheet-import')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@Controller('workspaces/:workspaceId/import/spreadsheet')
export class SpreadsheetImportController {
  constructor(private readonly svc: SpreadsheetImportService) {}

  @Get('sources')
  @ApiOperation({ summary: 'The column presets, the sources with no preset and why, and the accepted file types' })
  sources() {
    return this.svc.sources()
  }

  @Post('preview')
  @ApiOperation({ summary: 'Parse without writing — headers, delimiter, suggested mapping, sample, and the rows that would be REJECTED' })
  preview(
    @Param('workspaceId') workspaceId: string,
    @Body()
    body: {
      content: string
      delimiter?: SheetDelimiter
      preset?: string
      mapping?: ColumnMapping
      defaultListName?: string
    },
  ) {
    return this.svc.previewSheet(workspaceId, {
      content: body.content ?? '',
      delimiter: body.delimiter,
      preset: body.preset,
      mapping: body.mapping,
      defaultListName: body.defaultListName,
    })
  }

  @Post()
  // Importing asks `workspace.import`, an admin's by default, as ClickUp has it
  // (`found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`).
  @UseGuards(PermissionsGuard)
  @RequirePermissions('workspace.import')
  @ApiOperation({ summary: 'Start a spreadsheet import (admin only) — returns a job id to poll' })
  run(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body()
    body: {
      content: string
      delimiter?: SheetDelimiter
      preset?: string
      mapping?: ColumnMapping
      targetSpaceId?: string
      targetProjectName?: string
      strategy?: SheetConflictStrategy
      defaultListName?: string
    },
  ) {
    return this.svc.startSheetImport(workspaceId, user.id, body)
  }

  @Get('jobs')
  @ApiOperation({ summary: 'Import history. `source` filters on the job row — spreadsheet runs, not ClickUp ones.' })
  jobs(
    @Param('workspaceId') workspaceId: string,
    @Query('source') source?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.listJobs(workspaceId, {
      // Default to this importer's own runs; `source=all` opts out of the filter.
      source: source === 'all' ? undefined : (source ?? SHEET_SOURCE),
      limit: limit ? Number(limit) : undefined,
    })
  }

  @Get('jobs/:jobId')
  @ApiOperation({ summary: 'Poll one import job — progress, per-outcome counts, rejected rows and why' })
  job(@Param('workspaceId') workspaceId: string, @Param('jobId') jobId: string) {
    return this.svc.getJob(workspaceId, jobId)
  }
}
