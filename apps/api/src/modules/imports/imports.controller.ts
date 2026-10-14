import { Body, Controller, Delete, Get, Param, Post, Put, Query, Res, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { downloadName } from '../../common/export/download-name'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'
import { ImportsService } from './imports.service'

/**
 * Settings › Imports / Exports — the import engine's routes (§9.7). Every one
 * asks `workspace.import`, the history and the reports included.
 */
@ApiTags('imports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard, PermissionsGuard)
@RequirePermissions('workspace.import')
@Controller('workspaces/:workspaceId/imports')
export class ImportsController {
  constructor(private readonly svc: ImportsService) {}

  private actor(user: { id: string; role?: string | null }) {
    return { id: user.id, role: user.role ?? null }
  }

  @Get()
  @ApiOperation({ summary: 'Import history: every import and export of the workspace, newest first' })
  list(@Param('workspaceId') workspaceId: string, @CurrentUser() user: any, @Query('limit') limit?: string) {
    return this.svc.list(workspaceId, this.actor(user), { limit: limit ? Number(limit) : undefined })
  }

  @Get('mapping-memory')
  @ApiOperation({ summary: 'The field this workspace chose for each header before (§2.4 historical mapping)' })
  memory(@Param('workspaceId') workspaceId: string, @CurrentUser() user: any) {
    return this.svc.mappingMemory(workspaceId, this.actor(user))
  }

  @Post()
  @ApiOperation({ summary: 'Begin an import (a draft): source, destination, date format and delimiter' })
  create(@Param('workspaceId') workspaceId: string, @CurrentUser() user: any, @Body() body: any) {
    return this.svc.create(workspaceId, this.actor(user), body ?? {})
  }

  @Post(':jobId/upload')
  @ApiOperation({ summary: 'Upload one chunk of reviewed rows' })
  upload(@Param('workspaceId') workspaceId: string, @Param('jobId') jobId: string, @CurrentUser() user: any, @Body() body: any) {
    return this.svc.upload(workspaceId, jobId, this.actor(user), body ?? {})
  }

  @Get(':jobId/preview')
  @ApiOperation({ summary: 'What the mapping screens need of the destination: fields, statuses, task types, members' })
  preview(@Param('workspaceId') workspaceId: string, @Param('jobId') jobId: string, @CurrentUser() user: any) {
    return this.svc.preview(workspaceId, jobId, this.actor(user))
  }

  @Put(':jobId/mapping')
  @ApiOperation({ summary: 'Save the grid columns, value maps and people to invite' })
  mapping(@Param('workspaceId') workspaceId: string, @Param('jobId') jobId: string, @CurrentUser() user: any, @Body() body: any) {
    return this.svc.saveMapping(workspaceId, jobId, this.actor(user), body ?? {})
  }

  @Post(':jobId/start')
  @ApiOperation({ summary: 'Queue the import (Import Queued); it runs in the background' })
  start(@Param('workspaceId') workspaceId: string, @Param('jobId') jobId: string, @CurrentUser() user: any) {
    return this.svc.start(workspaceId, jobId, this.actor(user))
  }

  @Post(':jobId/cancel')
  @ApiOperation({ summary: 'Cancel a queued or running import; what it made stays and is listed' })
  cancel(@Param('workspaceId') workspaceId: string, @Param('jobId') jobId: string, @CurrentUser() user: any) {
    return this.svc.cancel(workspaceId, jobId, this.actor(user))
  }

  @Delete(':jobId')
  @ApiOperation({ summary: 'Delete an import made in the last 10 days: everything it created goes to Trash' })
  remove(@Param('workspaceId') workspaceId: string, @Param('jobId') jobId: string, @CurrentUser() user: any) {
    return this.svc.remove(workspaceId, jobId, this.actor(user))
  }

  @Get(':jobId/errors.csv')
  @ApiOperation({ summary: 'Every refused row and dropped cell, as CSV' })
  async errors(@Param('workspaceId') workspaceId: string, @Param('jobId') jobId: string, @CurrentUser() user: any, @Res() res: any) {
    const csv = await this.svc.errorsCsv(workspaceId, jobId, this.actor(user))
    res.header('Content-Type', 'text/csv; charset=utf-8')
    res.header('Content-Disposition', downloadName('import-errors', '.csv', 'import-errors').disposition)
    res.send('﻿' + csv)
  }

  @Get(':jobId/file')
  @ApiOperation({ summary: 'Download the rows as they were imported' })
  async file(@Param('workspaceId') workspaceId: string, @Param('jobId') jobId: string, @CurrentUser() user: any, @Res() res: any) {
    const { name, csv } = await this.svc.sourceFile(workspaceId, jobId, this.actor(user))
    res.header('Content-Type', 'text/csv; charset=utf-8')
    res.header('Content-Disposition', downloadName(name.replace(/\.csv$/, ''), '.csv', 'import').disposition)
    res.send('﻿' + csv)
  }

  @Get(':jobId')
  @ApiOperation({ summary: 'View details: the report, its items, users, errors and settings' })
  report(@Param('workspaceId') workspaceId: string, @Param('jobId') jobId: string, @CurrentUser() user: any, @Query('q') q?: string) {
    return this.svc.report(workspaceId, jobId, this.actor(user), { q })
  }
}
