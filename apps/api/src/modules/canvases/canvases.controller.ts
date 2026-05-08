import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CanvasesService } from './canvases.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@ApiTags('canvases')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@Controller('workspaces/:workspaceId/canvases')
export class CanvasesController {
  constructor(private readonly svc: CanvasesService) {}

  @Get()
  @ApiOperation({ summary: 'List workspace canvases' })
  list(@Param('workspaceId') workspaceId: string, @Query('type') type?: string) {
    return this.svc.list(workspaceId, type)
  }

  @Post()
  @ApiOperation({ summary: 'Create a workspace canvas' })
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body() body: { type: string; title: string; data?: unknown },
  ) {
    return this.svc.create(workspaceId, user.id, body)
  }

  @Get(':canvasId')
  @ApiOperation({ summary: 'Get a workspace canvas' })
  get(@Param('workspaceId') workspaceId: string, @Param('canvasId') canvasId: string) {
    return this.svc.get(workspaceId, canvasId)
  }

  @Patch(':canvasId')
  @ApiOperation({ summary: 'Update a workspace canvas' })
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('canvasId') canvasId: string,
    @CurrentUser() user: any,
    @Body() body: { title?: string; data?: unknown; type?: string; expectedUpdatedAt?: string },
  ) {
    return this.svc.update(workspaceId, canvasId, user.id, body)
  }

  @Delete(':canvasId')
  @ApiOperation({ summary: 'Delete a workspace canvas' })
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('canvasId') canvasId: string,
    @CurrentUser() user: any,
  ) {
    return this.svc.remove(workspaceId, canvasId, user.id)
  }
}
