import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { LabelsService } from './labels.service'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CreateLabelDto } from './dto/label.dto'

@ApiTags('labels')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, ResourceMemberGuard)
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
    @CurrentUser() user: { id: string },
    @Body() body: CreateLabelDto,
  ) {
    return this.labels.create(workspaceId, body, user.id)
  }

  @Patch('labels/:labelId')
  update(@Param('labelId') labelId: string, @CurrentUser() user: { id: string }, @Body() body: { name?: string; color?: string }) {
    return this.labels.update(labelId, body, user.id)
  }

  @Delete('labels/:labelId')
  remove(@Param('labelId') labelId: string, @CurrentUser() user: { id: string }) {
    return this.labels.delete(labelId, user.id)
  }
}
