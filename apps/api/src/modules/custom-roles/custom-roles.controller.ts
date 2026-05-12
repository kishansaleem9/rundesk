import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CustomRolesService } from './custom-roles.service'

/**
 * CRUD for the roles themselves, plus a catalog endpoint and a helper
 * for the current user to introspect their own effective permissions.
 */
@ApiTags('custom-roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/roles')
export class CustomRolesController {
  constructor(private readonly roles: CustomRolesService) {}

  @Get('catalog')
  @UseGuards(WorkspaceMemberGuard)
  @ApiOperation({ summary: 'List every permission key the API understands' })
  catalog() {
    return { permissions: this.roles.getCatalog() }
  }

  @Get('me/permissions')
  @UseGuards(WorkspaceMemberGuard)
  @ApiOperation({ summary: 'Effective permission set for the current user' })
  async myPermissions(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @CurrentUser() user: any,
  ) {
    const resolution = await this.roles.resolveForUser(workspaceId, user.id)
    if (!resolution) return { permissions: [], legacyRole: 'guest', customRoleIds: [] }
    return resolution
  }

  @Get()
  @UseGuards(WorkspaceMemberGuard)
  list(@Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.roles.list(workspaceId)
  }

  @Get(':roleId')
  @UseGuards(WorkspaceMemberGuard)
  getOne(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('roleId', new ParseUUIDPipe()) roleId: string,
  ) {
    return this.roles.getById(workspaceId, roleId)
  }

  @Get(':roleId/assignees')
  @UseGuards(WorkspaceMemberGuard)
  async assignees(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('roleId', new ParseUUIDPipe()) roleId: string,
  ) {
    return { workspaceMemberIds: await this.roles.listAssignees(workspaceId, roleId) }
  }

  @Post()
  @UseGuards(WorkspaceAdminGuard)
  create(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() body: { name: string; description?: string | null; color?: string; permissions?: string[] },
    @CurrentUser() user: any,
  ) {
    return this.roles.create(workspaceId, body, { id: user.id, email: user.email })
  }

  @Patch(':roleId')
  @UseGuards(WorkspaceAdminGuard)
  update(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('roleId', new ParseUUIDPipe()) roleId: string,
    @Body() body: { name?: string; description?: string | null; color?: string; permissions?: string[] },
    @CurrentUser() user: any,
  ) {
    return this.roles.update(workspaceId, roleId, body, { id: user.id, email: user.email })
  }

  @Delete(':roleId')
  @UseGuards(WorkspaceAdminGuard)
  async remove(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('roleId', new ParseUUIDPipe()) roleId: string,
    @CurrentUser() user: any,
  ) {
    await this.roles.remove(workspaceId, roleId, { id: user.id, email: user.email })
    return { ok: true }
  }
}

/**
 * Per-member role assignment lives at the natural URL
 * `/workspaces/:workspaceId/members/:memberId/roles`. Split out to
 * avoid the awkward `/roles/members/...` nesting.
 */
@ApiTags('custom-roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/members/:memberId/roles')
export class MemberRolesController {
  constructor(private readonly roles: CustomRolesService) {}

  @Get()
  @UseGuards(WorkspaceMemberGuard)
  async list(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('memberId', new ParseUUIDPipe()) memberId: string,
  ) {
    return this.roles.listForMember(workspaceId, memberId)
  }

  @Post(':roleId')
  @UseGuards(WorkspaceAdminGuard)
  async assign(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('memberId', new ParseUUIDPipe()) memberId: string,
    @Param('roleId', new ParseUUIDPipe()) roleId: string,
    @CurrentUser() user: any,
  ) {
    await this.roles.assign(workspaceId, memberId, roleId, { id: user.id, email: user.email })
    return { ok: true }
  }

  @Delete(':roleId')
  @UseGuards(WorkspaceAdminGuard)
  async unassign(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('memberId', new ParseUUIDPipe()) memberId: string,
    @Param('roleId', new ParseUUIDPipe()) roleId: string,
    @CurrentUser() user: any,
  ) {
    await this.roles.unassign(workspaceId, memberId, roleId, { id: user.id, email: user.email })
    return { ok: true }
  }
}
