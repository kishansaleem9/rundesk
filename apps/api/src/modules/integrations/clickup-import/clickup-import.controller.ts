import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ClickUpImportService } from './clickup-import.service'
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
  @ApiOperation({ summary: 'Preview a ClickUp CSV — counts rows, lists, sample tasks' })
  preview(@Body() body: { csv: string }) {
    return this.svc.preview(body.csv ?? '')
  }

  @Post()
  @UseGuards(WorkspaceAdminGuard)
  @ApiOperation({ summary: 'Run a ClickUp CSV import (admin only)' })
  run(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body() body: { csv: string; targetSpaceId?: string; targetProjectName?: string },
  ) {
    return this.svc.importCsv(workspaceId, user.id, body)
  }
}
