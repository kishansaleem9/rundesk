import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ClientsService } from './clients.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { CurrentUserPayload } from '../tasks/types'

@ApiTags('clients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@Controller('workspaces/:workspaceId/clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  list(@Param('workspaceId') workspaceId: string) {
    return this.clients.list(workspaceId)
  }

  @Post()
  @UseGuards(WorkspaceAdminGuard)
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { name: string; contactEmail?: string },
  ) {
    return this.clients.create(workspaceId, body.name, body.contactEmail, user.id)
  }

  @Delete(':clientId')
  @UseGuards(WorkspaceAdminGuard)
  remove(@Param('workspaceId') workspaceId: string, @Param('clientId') clientId: string) {
    return this.clients.remove(clientId, workspaceId)
  }
}
