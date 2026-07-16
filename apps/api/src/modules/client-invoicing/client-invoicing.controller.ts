import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ClientInvoicingService } from './client-invoicing.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

/**
 * §12.10 Client invoicing. Workspace-scoped routes for generating client
 * invoices from billable project time and walking them through their lifecycle
 * (draft → sent → paid, or void). Gated by the billing permission — the same
 * one that guards the workspace's Stripe billing surface.
 */
@ApiTags('client-invoicing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard, PermissionsGuard)
@RequirePermissions('workspace.billing')
@Controller('workspaces/:workspaceId/client-invoices')
export class ClientInvoicingController {
  constructor(private readonly invoicing: ClientInvoicingService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Generate a draft invoice from a project’s unbilled billable time' })
  generate(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: { id: string },
    @Body()
    body: {
      projectId?: string
      ratePerHourCents?: number
      currency?: string
      dueInDays?: number
      notes?: string
    },
  ) {
    return this.invoicing.generateFromProject(workspaceId, body?.projectId ?? '', {
      ratePerHourCents: body?.ratePerHourCents,
      currency: body?.currency,
      dueInDays: body?.dueInDays,
      notes: body?.notes,
      createdById: user.id,
    })
  }

  @Get()
  @ApiOperation({ summary: 'List the workspace’s client invoices' })
  list(@Param('workspaceId') workspaceId: string) {
    return this.invoicing.list(workspaceId)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a client invoice with its line items' })
  get(@Param('workspaceId') workspaceId: string, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.invoicing.get(workspaceId, id)
  }

  @Post(':id/send')
  @ApiOperation({ summary: 'Mark an invoice as sent' })
  markSent(@Param('workspaceId') workspaceId: string, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.invoicing.markSent(workspaceId, id)
  }

  @Post(':id/paid')
  @ApiOperation({ summary: 'Mark an invoice as paid' })
  markPaid(@Param('workspaceId') workspaceId: string, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.invoicing.markPaid(workspaceId, id)
  }

  @Post(':id/void')
  @ApiOperation({ summary: 'Void an invoice and release its time entries' })
  void(@Param('workspaceId') workspaceId: string, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.invoicing.void(workspaceId, id)
  }
}
