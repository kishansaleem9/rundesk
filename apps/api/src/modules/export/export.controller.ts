import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ExportService } from './export.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'

@ApiTags('export')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/export')
export class ExportController {
  constructor(private readonly svc: ExportService) {}

  @Get('json')
  @ApiOperation({ summary: 'Export all workspace data as JSON' })
  async exportJson(@Param('workspaceId') workspaceId: string, @Res() res: any) {
    const data = await this.svc.exportWorkspace(workspaceId)
    const json = JSON.stringify(data, null, 2)
    res.header('Content-Type', 'application/json')
    res.header('Content-Disposition', `attachment; filename="rundesk-export-${workspaceId}.json"`)
    res.send(json)
  }

  @Get('csv/tasks')
  @ApiOperation({ summary: 'Export tasks as CSV' })
  async exportTasksCsv(@Param('workspaceId') workspaceId: string, @Res() res: any) {
    const data = await this.svc.exportWorkspace(workspaceId)
    const csv = this.svc.exportToCsv(data.tasks as any[])
    res.header('Content-Type', 'text/csv')
    res.header('Content-Disposition', `attachment; filename="rundesk-tasks-${workspaceId}.csv"`)
    res.send(csv)
  }
}
