import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { SupportService } from './support.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

type Actor = { id: string; role?: string }

/**
 * Customer Support & Help Center (Plan §14.4). Ticket CRUD + the ticket-thread
 * conversation, plus super-admin management of the public status page
 * (components + incidents). Every route here requires authentication; access to
 * a specific ticket is enforced in the service (creator / workspace staff /
 * super_admin). The unauthenticated public status read lives in
 * PublicStatusController.
 */
@ApiTags('support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  // ── Tickets ─────────────────────────────────────────────────────────────────

  @Post('tickets')
  @ApiOperation({ summary: 'Create a support ticket (auto-sets SLA due dates from priority)' })
  createTicket(
    @CurrentUser() user: Actor,
    @Body() body: { workspaceId?: string; subject?: string; body?: string; priority?: string },
  ) {
    return this.support.createTicket(user, body)
  }

  @Get('tickets')
  @ApiOperation({ summary: 'List tickets visible to the caller (scope=all for super-admin/support)' })
  listTickets(
    @CurrentUser() user: Actor,
    @Query('scope') scope?: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    return this.support.listTickets(user, { scope, status, priority, workspaceId })
  }

  @Get('tickets/:id')
  @ApiOperation({ summary: 'Get a ticket with its message thread' })
  getTicket(@CurrentUser() user: Actor, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.support.getTicket(user, id)
  }

  @Post('tickets/:id/messages')
  @ApiOperation({ summary: 'Reply to a ticket (a staff reply stamps first_response_at)' })
  addMessage(
    @CurrentUser() user: Actor,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { body?: string },
  ) {
    return this.support.addMessage(user, id, body)
  }

  @Patch('tickets/:id')
  @ApiOperation({ summary: 'Update a ticket status/priority/assignee (staff only; resolving stamps resolved_at)' })
  updateTicket(
    @CurrentUser() user: Actor,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { status?: string; priority?: string; assignedToId?: string | null },
  ) {
    return this.support.updateTicket(user, id, body)
  }

  // ── Status page management (super_admin only, enforced in the service) ───────

  @Post('status/components')
  @ApiOperation({ summary: 'Create a status-page component (super admin)' })
  createComponent(
    @CurrentUser() user: Actor,
    @Body() body: { name?: string; status?: string; position?: number },
  ) {
    return this.support.createComponent(user, body)
  }

  @Patch('status/components/:id')
  @ApiOperation({ summary: 'Update a status-page component (super admin)' })
  updateComponent(
    @CurrentUser() user: Actor,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { name?: string; status?: string; position?: number },
  ) {
    return this.support.updateComponent(user, id, body)
  }

  @Delete('status/components/:id')
  @ApiOperation({ summary: 'Delete a status-page component (super admin)' })
  deleteComponent(@CurrentUser() user: Actor, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.support.deleteComponent(user, id)
  }

  @Post('status/incidents')
  @ApiOperation({ summary: 'Post a status-page incident (super admin)' })
  createIncident(
    @CurrentUser() user: Actor,
    @Body()
    body: { title?: string; body?: string; impact?: string; status?: string; componentId?: string | null },
  ) {
    return this.support.createIncident(user, body)
  }

  @Patch('status/incidents/:id')
  @ApiOperation({ summary: 'Update a status-page incident (super admin; resolving stamps resolved_at)' })
  updateIncident(
    @CurrentUser() user: Actor,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body()
    body: { title?: string; body?: string; impact?: string; status?: string; componentId?: string | null },
  ) {
    return this.support.updateIncident(user, id, body)
  }
}

/**
 * Public status page (Plan §14.4). No auth — anyone can read the current
 * component health + recent incidents. Served at GET /api/v1/status.
 */
@ApiTags('support')
@Controller('status')
export class PublicStatusController {
  constructor(private readonly support: SupportService) {}

  @Get()
  @ApiOperation({ summary: 'Public status page: components + recent incidents + overall banner' })
  getStatus() {
    return this.support.getStatusPage()
  }
}
