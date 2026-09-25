import { Controller, Get, Ip, Param, Res, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ExportService } from './export.service'
import { WorkspacesService } from '../workspaces/workspaces.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@ApiTags('export')
@ApiBearerAuth()
// The whole workspace's data and its people ask `workspace.export`, an admin's by default, as
// ClickUp has it; `WorkspaceAdminGuard` admitted managers
// (`found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`).
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard, PermissionsGuard)
@RequirePermissions('workspace.export')
@Controller('workspaces/:workspaceId/export')
export class ExportController {
  constructor(
    private readonly svc: ExportService,
    private readonly workspaces: WorkspacesService,
  ) {}

  @Get('json')
  @ApiOperation({ summary: 'Export all workspace data as JSON' })
  async exportJson(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Ip() ip: string,
    @Res() res: any,
  ) {
    const data = await this.svc.exportWorkspace(workspaceId, { id: user.id, role: user.role })
    const json = JSON.stringify(data, null, 2)
    res.header('Content-Type', 'application/json')
    res.header('Content-Disposition', `attachment; filename="rundesk-export-${workspaceId}.json"`)
    await this.svc.logExport(
      workspaceId,
      user.id,
      'json',
      'full',
      {
        tasks: data.tasks.length,
        spaces: data.spaces.length,
        projects: data.projects.length,
        lists: data.lists.length,
        members: data.members.length,
      },
      ip,
    )
    res.send(json)
  }

  @Get('csv/tasks')
  @ApiOperation({ summary: 'Export tasks as CSV' })
  async exportTasksCsv(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Ip() ip: string,
    @Res() res: any,
  ) {
    const data = await this.svc.exportWorkspace(workspaceId, { id: user.id, role: user.role })
    const csv = this.svc.exportToCsv(data.tasks as any[])
    res.header('Content-Type', 'text/csv')
    res.header('Content-Disposition', `attachment; filename="rundesk-tasks-${workspaceId}.csv"`)
    await this.svc.logExport(
      workspaceId,
      user.id,
      'csv',
      'tasks',
      {
        tasks: (data.tasks as any[]).length,
      },
      ip,
    )
    res.send(csv)
  }

  @Get('csv/members')
  @ApiOperation({ summary: 'Export the People roster as CSV (§A4.1)' })
  async exportMembersCsv(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Ip() ip: string,
    @Res() res: any,
  ) {
    const members = await this.workspaces.listMembers(workspaceId)
    const csv = this.svc.membersToCsv(members)
    res.header('Content-Type', 'text/csv')
    res.header('Content-Disposition', `attachment; filename="rundesk-members-${workspaceId}.csv"`)
    await this.svc.logExport(workspaceId, user.id, 'csv', 'members', { members: members.length }, ip)
    res.send(csv)
  }
}
