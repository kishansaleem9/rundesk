import { Body, Controller, Get, Param, Post, UseGuards, ParseUUIDPipe } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { BillingService } from './billing.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'

/**
 * Workspace-scoped billing endpoints (Plan §14.1). Checkout + Portal mutate the
 * commercial subscription and are admin-gated (WorkspaceAdminGuard = workspace
 * admin / manager / super admin); the read-only status is member-gated. The
 * unauthenticated Stripe webhook lives in BillingWebhookController.
 */
@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Post(':workspaceId/billing/checkout')
  @UseGuards(WorkspaceAdminGuard)
  @ApiOperation({ summary: 'Start a Stripe Checkout session to subscribe to a tier (Plan §14.1)' })
  async checkout(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() body: { tier: string },
  ) {
    return this.billing.createCheckoutSession(workspaceId, body?.tier)
  }

  @Post(':workspaceId/billing/portal')
  @UseGuards(WorkspaceAdminGuard)
  @ApiOperation({ summary: 'Open the Stripe Billing Portal (manage/upgrade/downgrade/cancel)' })
  async portal(@Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.billing.createBillingPortalSession(workspaceId)
  }

  @Get(':workspaceId/billing')
  @UseGuards(WorkspaceMemberGuard)
  @ApiOperation({ summary: 'Billing status: configured flag, plan, subscription and recent invoices' })
  async status(@Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.billing.getBillingStatus(workspaceId)
  }
}
