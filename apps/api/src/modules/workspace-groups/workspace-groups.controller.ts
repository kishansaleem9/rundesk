import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { WorkspaceGroupsService, type GroupCreateInput, type GroupUpdateInput } from './workspace-groups.service'

type CurrentUserPayload = { id: string }

/**
 * WHAT A PERSON MAY SET ON A GROUP FROM HERE: its name, description, handle and
 * first members. Not its `externalId` — that is the IdP's key, which SCIM
 * resolves groups by (`findByIdOrExternal`) and sets through its own path
 * (`scim.service.ts`). Passing the body whole let whoever manages groups set or
 * overwrite it, so a SCIM call could be pointed at another group, or an
 * IdP-synced group detached from its IdP.
 */
export function groupCreateInput(body: unknown): GroupCreateInput {
  const b = (body ?? {}) as Record<string, unknown>
  return {
    name: b.name as string,
    description: b.description as string | null | undefined,
    alias: b.alias as string | null | undefined,
    memberIds: b.memberIds as string[] | undefined,
  }
}

/** A rename's fields, as `groupCreateInput`: never the SCIM `externalId`. */
export function groupUpdateInput(body: unknown): GroupUpdateInput {
  const b = (body ?? {}) as Record<string, unknown>
  const patch: GroupUpdateInput = {}
  if (b.name !== undefined) patch.name = b.name as string
  if (b.description !== undefined) patch.description = b.description as string | null
  if (b.alias !== undefined) patch.alias = b.alias as string | null
  return patch
}

/**
 * Reading the groups is every member's: chat's @team picker, the Teams page and
 * My Teams read them, and a group holds people, not content — a directory like
 * `GET /members`. Making, renaming and deleting a group and setting its members
 * ask `groups.manage`, an admin's by default and grantable by a custom role, as
 * ClickUp has it ("Only Workspace owners and admins can create a Team"). The
 * admin guard these stood behind admitted managers, and no key could hand them
 * to anyone (`found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`).
 */
@ApiTags('workspace-groups')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/groups')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class WorkspaceGroupsController {
  constructor(private groups: WorkspaceGroupsService) {}

  @Get()
  list(@Param('workspaceId') workspaceId: string, @Query('search') search?: string) {
    return this.groups.list(workspaceId, { search })
  }

  @Get(':groupId')
  get(@Param('workspaceId') workspaceId: string, @Param('groupId') groupId: string) {
    return this.groups.get(workspaceId, groupId)
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('groups.manage')
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { name: string; description?: string; alias?: string | null; memberIds?: string[] },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.groups.create(workspaceId, user.id, groupCreateInput(body))
  }

  @Patch(':groupId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('groups.manage')
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('groupId') groupId: string,
    @Body() body: { name?: string; description?: string | null; alias?: string | null },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.groups.update(workspaceId, groupId, user.id, groupUpdateInput(body))
  }

  @Delete(':groupId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('groups.manage')
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('groupId') groupId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.groups.remove(workspaceId, groupId, user.id)
  }

  @Post(':groupId/members')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('groups.manage')
  addMembers(
    @Param('workspaceId') workspaceId: string,
    @Param('groupId') groupId: string,
    @Body() body: { userIds: string[] },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.groups.addMembers(workspaceId, groupId, user.id, body.userIds ?? [])
  }

  @Put(':groupId/members')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('groups.manage')
  replaceMembers(
    @Param('workspaceId') workspaceId: string,
    @Param('groupId') groupId: string,
    @Body() body: { userIds: string[] },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.groups.replaceMembers(workspaceId, groupId, user.id, body.userIds ?? [])
  }

  @Delete(':groupId/members/:userId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('groups.manage')
  removeMember(
    @Param('workspaceId') workspaceId: string,
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.groups.removeMember(workspaceId, groupId, user.id, userId)
  }
}

/**
 * §V2-12 — the Teams Hub itself, as opposed to one team.
 *
 * A separate controller under `/workspaces/:id/teams` rather than more routes
 * on `/groups`, because none of this is about a group: the person cards at
 * frame `21:00` are per MEMBER, and half the people on that screen are in no
 * team at all. Hanging them off `/groups/:groupId/...` would have forced the
 * page to invent a group id it does not have.
 *
 * `WorkspaceMemberGuard`, not admin — the entire point of §V2-12 was that
 * looking at your own organisation stopped requiring admin rights. The one
 * write here does its own permission check (yours, or an admin's), because
 * "only admins" and "yours or an admin's" are different rules and a guard
 * cannot express the second.
 */
@ApiTags('workspace-groups')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/teams')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class TeamsHubController {
  constructor(private groups: WorkspaceGroupsService) {}

  /** Everyone in the workspace, with the work each of them actually has open. */
  @Get('work-preview')
  workPreview(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload & { role?: string | null },
    @Query('perPerson') perPerson?: string,
  ) {
    // The viewer, so the cards show only what THEY may see — see workPreview.
    return this.groups.workPreview(workspaceId, {
      perPerson: perPerson ? Number(perPerson) : undefined,
      actorId: user.id,
      globalRole: user.role,
    })
  }

  /** The line under the name on a person card. */
  @Put('people/:userId/title')
  setJobTitle(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string,
    @Body() body: { jobTitle?: string | null },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.groups.setJobTitle(workspaceId, user.id, userId, body?.jobTitle ?? null)
  }
}
