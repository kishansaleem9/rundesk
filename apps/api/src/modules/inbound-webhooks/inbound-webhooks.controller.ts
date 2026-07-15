import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { InboundWebhooksService } from './inbound-webhooks.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { CurrentUserPayload } from '../tasks/types'

@ApiTags('inbound-webhooks')
@ApiBearerAuth()
@Controller('lists/:listId/inbound-webhooks')
@UseGuards(JwtAuthGuard, ResourceMemberGuard)
export class InboundWebhooksController {
  constructor(private readonly hooks: InboundWebhooksService) {}

  @Get()
  list(@Param('listId') listId: string) {
    return this.hooks.listForList(listId)
  }

  @Post()
  create(
    @Param('listId') listId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { name?: string },
  ) {
    return this.hooks.create(listId, body?.name ?? '', user.id)
  }

  @Delete(':id')
  remove(@Param('listId') listId: string, @Param('id') id: string) {
    return this.hooks.remove(id, listId)
  }
}

// Public, unauthenticated receiver — external systems POST here with the token.
@ApiTags('inbound-webhooks')
@Controller('inbound/webhook')
export class InboundWebhookReceiverController {
  constructor(private readonly hooks: InboundWebhooksService) {}

  @Post(':token')
  receive(
    @Param('token') token: string,
    @Body() body: { title?: string; description?: string; priority?: string; dueDate?: string },
  ) {
    return this.hooks.receive(token, body ?? {})
  }
}
