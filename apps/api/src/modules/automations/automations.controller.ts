import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AutomationsService } from './automations.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@ApiTags('automations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/automations')
export class AutomationsController {
  constructor(private readonly svc: AutomationsService) {}

  @Get()
  @ApiOperation({ summary: 'List all automations in a workspace' })
  list(@Param('workspaceId') workspaceId: string) {
    return this.svc.list(workspaceId)
  }

  @Post()
  @ApiOperation({ summary: 'Create an automation rule' })
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body()
    body: {
      name: string
      trigger: { type: string; filters?: Record<string, string | string[] | undefined> }
      actions: Array<{ type: string; params: Record<string, string | string[] | undefined> }>
    },
  ) {
    return this.svc.create(workspaceId, user.id, body)
  }

  @Get(':automationId')
  getOne(@Param('automationId') automationId: string) {
    return this.svc.getOne(automationId)
  }

  @Patch(':automationId')
  update(@Param('automationId') automationId: string, @Body() body: any) {
    return this.svc.update(automationId, body)
  }

  @Delete(':automationId')
  remove(@Param('automationId') automationId: string) {
    return this.svc.remove(automationId)
  }

  @Get(':automationId/runs')
  listRuns(@Param('automationId') automationId: string) {
    return this.svc.listRuns(automationId)
  }
}
