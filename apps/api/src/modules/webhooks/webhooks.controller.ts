import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { WebhooksService } from './webhooks.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@ApiTags('webhooks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
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
  @ApiOperation({ summary: 'Create a new webhook' })
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body() body: { name: string; url: string; events: string[]; secret?: string },
  ) {
    return this.svc.create(workspaceId, user.id, body)
  }

  @Patch(':webhookId')
  update(@Param('webhookId') webhookId: string, @Body() body: any) {
    return this.svc.update(webhookId, body)
  }

  @Delete(':webhookId')
  delete(@Param('webhookId') webhookId: string) {
    return this.svc.delete(webhookId)
  }

  @Post(':webhookId/test')
  @ApiOperation({ summary: 'Send a test event to the webhook' })
  test(@Param('webhookId') webhookId: string) {
    return this.svc.testWebhook(webhookId)
  }

  @Get(':webhookId/deliveries')
  @ApiOperation({ summary: 'List recent deliveries for a webhook' })
  deliveries(@Param('webhookId') webhookId: string) {
    return this.svc.listDeliveries(webhookId)
  }
}
