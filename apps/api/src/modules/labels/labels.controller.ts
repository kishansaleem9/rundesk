import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { LabelsService } from './labels.service'

@ApiTags('labels')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class LabelsController {
  constructor(private labels: LabelsService) {}

  @Get('workspaces/:workspaceId/labels')
  @UseGuards(WorkspaceMemberGuard)
  list(@Param('workspaceId') workspaceId: string) {
    return this.labels.list(workspaceId)
  }

  @Post('workspaces/:workspaceId/labels')
  @UseGuards(WorkspaceMemberGuard)
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { name: string; color: string },
  ) {
    return this.labels.create(workspaceId, body)
  }

  @Patch('labels/:labelId')
  update(@Param('labelId') labelId: string, @Body() body: { name?: string; color?: string }) {
    return this.labels.update(labelId, body)
  }

  @Delete('labels/:labelId')
  remove(@Param('labelId') labelId: string) {
    return this.labels.delete(labelId)
  }
}
