import { Body, Controller, Get, Param, Post, UseGuards, ParseUUIDPipe } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { BillingService } from './billing.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'
import { CustomRolesService } from '../custom-roles/custom-roles.service'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

/**
 * Workspace-scoped billing endpoints (Plan §14.1). Checkout and the portal
 * change the commercial subscription, and ask `workspace.billing` — "view
 * invoices, change plan, manage payment method", an admin's by default.
 * `WorkspaceAdminGuard` had admitted managers and refused the grant, and the
 * status gave every member, guests too, the invoices with their Stripe links
 * (`found-25-sep/billing-open-to-managers-and-every-member`). The status's plan
 * stays every member's, since the web gates features by it. The
 * unauthenticated Stripe webhook lives in BillingWebhookController.
 */
@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly roles: CustomRolesService,
  ) {}

  @Post(':workspaceId/billing/checkout')
  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)
  @RequirePermissions('workspace.billing')
  @ApiOperation({ summary: 'Start a Stripe Checkout session to subscribe to a tier (Plan §14.1)' })
  async checkout(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() body: { tier: string },
  ) {
    return this.billing.createCheckoutSession(workspaceId, body?.tier)
  }

  @Post(':workspaceId/billing/portal')
  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)
  @RequirePermissions('workspace.billing')
  @ApiOperation({ summary: 'Open the Stripe Billing Portal (manage/upgrade/downgrade/cancel)' })
  async portal(@Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.billing.createBillingPortalSession(workspaceId)
  }

  @Get(':workspaceId/billing')
  @UseGuards(WorkspaceMemberGuard)
  @ApiOperation({ summary: 'Billing status: configured flag, plan, subscription and recent invoices' })
  async status(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @CurrentUser() user: { id: string; role?: string | null },
  ) {
    const accounts = user.role === 'super_admin' || (await this.roles.hasPermission(workspaceId, user.id, 'workspace.billing'))
    return this.billing.getBillingStatus(workspaceId, { accounts })
  }
}
