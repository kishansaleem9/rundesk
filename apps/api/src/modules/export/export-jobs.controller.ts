import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { downloadName } from '../../common/export/download-name'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'
import { ExportJobsService } from './export-jobs.service'

/**
 * §5.1 — Settings › Imports / Exports › Export items. Starting an export and
 * reading its state ask `workspace.export`, an admin's by default.
 */
@ApiTags('export')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard, PermissionsGuard)
@RequirePermissions('workspace.export')
@Controller('workspaces/:workspaceId/exports')
export class ExportJobsController {
  constructor(private readonly svc: ExportJobsService) {}

  @Post()
  @ApiOperation({ summary: 'Start a workspace CSV export (ClickUp format) of the chosen locations' })
  start(@Param('workspaceId') workspaceId: string, @CurrentUser() user: any, @Body() body: any) {
    return this.svc.start(workspaceId, { id: user.id, role: user.role }, body ?? {})
  }

  @Get(':exportId')
  @ApiOperation({ summary: 'An export’s state, and a fresh hour-long download link once it is ready' })
  status(@Param('workspaceId') workspaceId: string, @Param('exportId') exportId: string) {
    return this.svc.status(workspaceId, exportId)
  }
}

/**
 * The SIGNED download link, emailed and shown in the app. It carries its own
 * authority — an HMAC over the export and its expiry — so it opens in any
 * browser for the hour it lasts, and in none after.
 */
@ApiTags('export')
@Controller('exports')
export class ExportDownloadController {
  constructor(private readonly svc: ExportJobsService) {}

  @Get(':exportId/download')
  @ApiOperation({ summary: 'Download a finished export by its signed link (expires after one hour)' })
  async download(
    @Param('exportId') exportId: string,
    @Query('expires') expires: string,
    @Query('sig') sig: string,
    @Res() res: any,
  ) {
    const { stream, fileName } = await this.svc.download(exportId, Number(expires), String(sig ?? ''))
    res.header('Content-Type', 'text/csv; charset=utf-8')
    res.header('Content-Disposition', downloadName(fileName.replace(/\.csv$/, ''), '.csv', 'rundesk-export').disposition)
    res.header('Cache-Control', 'private, no-store')
    res.send(stream)
  }
}
