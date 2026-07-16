import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZapierService } from './zapier.service'
import { ZapierApiKeyGuard, ZapierCtx, type ZapierContext } from './zapier-api-key.guard'
import { zapierAppManifest } from './zapier-app-manifest'

/**
 * Zapier REST-Hooks contract (Plan §12.4). Every route is authenticated by a
 * workspace API key ({@link ZapierApiKeyGuard}) — the key resolves both the
 * caller and the workspace, which is why these routes carry no `:workspaceId`.
 */
@ApiTags('zapier')
@ApiBearerAuth()
@UseGuards(ZapierApiKeyGuard)
@Controller('zapier')
export class ZapierController {
  constructor(private readonly svc: ZapierService) {}

  @Get('auth/test')
  @ApiOperation({ summary: 'Zapier auth connection test — returns the authenticated workspace & user' })
  authTest(@ZapierCtx() ctx: ZapierContext) {
    return this.svc.authTest(ctx.workspaceId, ctx.userId)
  }

  @Post('subscribe')
  @ApiOperation({ summary: 'REST Hook subscribe — create an outbound webhook to a Zapier target URL' })
  subscribe(@ZapierCtx() ctx: ZapierContext, @Body() body: { event: string; targetUrl: string }) {
    return this.svc.subscribe(ctx.workspaceId, ctx.userId, body)
  }

  @Delete('subscribe/:id')
  @ApiOperation({ summary: 'REST Hook unsubscribe — delete the webhook subscription (workspace-scoped)' })
  unsubscribe(@ZapierCtx() ctx: ZapierContext, @Param('id') id: string) {
    return this.svc.unsubscribe(ctx.workspaceId, id)
  }

  @Get('triggers/:event/sample')
  @ApiOperation({ summary: 'Perform-list / sample data for a trigger — recent real, workspace-scoped items' })
  sample(@ZapierCtx() ctx: ZapierContext, @Param('event') event: string) {
    return this.svc.sample(ctx.workspaceId, event)
  }

  @Get('app-manifest')
  @ApiOperation({ summary: 'Static Zapier app definition (auth, triggers, subscribe/unsubscribe/list URLs)' })
  manifest() {
    return zapierAppManifest
  }
}
