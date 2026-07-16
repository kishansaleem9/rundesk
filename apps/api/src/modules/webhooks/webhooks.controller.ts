import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { WebhooksService } from './webhooks.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'
import { CreateWebhookDto, UpdateWebhookDto } from './dto/webhook.dto'

@ApiTags('webhooks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@Controller('workspaces/:workspaceId/webhooks')
export class WebhooksController {
  constructor(private readonly svc: WebhooksService) {}

  @Get('events')
  @ApiOperation({ summary: 'List available webhook event types' })
  events() {
    return this.svc.getAvailableEvents()
  }

  @Get()
  @ApiOperation({ summary: 'List all webhooks in a workspace' })
  list(@Param('workspaceId') workspaceId: string) {
    return this.svc.list(workspaceId)
  }

  @Post()
  @UseGuards(WorkspaceAdminGuard, PermissionsGuard)
  @RequirePermissions('webhook.manage')
  @ApiOperation({ summary: 'Create a new webhook (admin only)' })
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body() body: CreateWebhookDto,
  ) {
    return this.svc.create(workspaceId, user.id, body)
  }

  @Patch(':webhookId')
  @UseGuards(WorkspaceAdminGuard, PermissionsGuard)
  @RequirePermissions('webhook.manage')
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('webhookId') webhookId: string,
    @Body() body: UpdateWebhookDto,
  ) {
    return this.svc.update(workspaceId, webhookId, body)
  }

  @Delete(':webhookId')
  @UseGuards(WorkspaceAdminGuard, PermissionsGuard)
  @RequirePermissions('webhook.manage')
  delete(
    @Param('workspaceId') workspaceId: string,
    @Param('webhookId') webhookId: string,
  ) {
    return this.svc.delete(workspaceId, webhookId)
  }

  @Post(':webhookId/test')
  @UseGuards(WorkspaceAdminGuard, PermissionsGuard)
  @RequirePermissions('webhook.manage')
  @ApiOperation({ summary: 'Send a test event to the webhook' })
  test(
    @Param('workspaceId') workspaceId: string,
    @Param('webhookId') webhookId: string,
  ) {
    return this.svc.testWebhook(workspaceId, webhookId)
  }

  @Get(':webhookId/deliveries')
  @ApiOperation({ summary: 'List recent deliveries for a webhook' })
  deliveries(
    @Param('workspaceId') workspaceId: string,
    @Param('webhookId') webhookId: string,
  ) {
    return this.svc.listDeliveries(workspaceId, webhookId)
  }
}
