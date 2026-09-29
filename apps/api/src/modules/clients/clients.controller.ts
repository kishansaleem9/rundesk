import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ClientsService } from './clients.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { CurrentUserPayload } from '../tasks/types'

/*
 * A workspace's clients — the names a project's time is billed to — are made,
 * changed and deleted by whoever holds `client.manage`, a manager's and an admin's by
 * default and grantable to a member by a custom role. `WorkspaceAdminGuard`
 * admitted managers and no key could hand either to anybody
 * (`found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`).
 * ClickUp has no clients; its closest library, the Custom Field Manager, is the
 * owners' and admins' and whoever a custom role grants Manage Custom Fields.
 */
@ApiTags('clients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId/clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  list(@Param('workspaceId') workspaceId: string, @Req() req: { workspaceMember?: { role?: string } }) {
    // Every project page reads the list for its picker, so every member keeps it. A guest
    // reads only what is shared with them, and the workspace's client book, with each
    // client's contact address, is not.
    if (req.workspaceMember?.role === 'guest') throw new ForbiddenException('The workspace’s clients are not a guest’s to read')
    return this.clients.list(workspaceId)
  }

  @Post()
  @RequirePermissions('client.manage')
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { name: string; contactEmail?: string },
  ) {
    return this.clients.create(workspaceId, body.name, body.contactEmail, user.id)
  }

  // A client's name and contact email (`found-28-sep/clients-cannot-be-edited`):
  // the address an invoice prints could be set only by the API's create.
  @Patch(':clientId')
  @RequirePermissions('client.manage')
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('clientId') clientId: string,
    @Body() body: { name?: unknown; contactEmail?: unknown },
  ) {
    return this.clients.update(clientId, workspaceId, body ?? {})
  }

  @Delete(':clientId')
  @RequirePermissions('client.manage')
  remove(@Param('workspaceId') workspaceId: string, @Param('clientId') clientId: string) {
    return this.clients.remove(clientId, workspaceId)
  }
}
