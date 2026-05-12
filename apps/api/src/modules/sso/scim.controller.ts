import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { ScimService } from './scim.service'

type CurrentUserPayload = { id: string; email: string }

// ─── SCIM token management (workspace admin, JWT-protected) ─────────────────

@ApiTags('scim-admin')
@Controller('workspaces/:workspaceId/scim/tokens')
@UseGuards(JwtAuthGuard, WorkspaceAdminGuard)
export class ScimAdminController {
  constructor(private scim: ScimService) {}

  @Get()
  list(@Param('workspaceId') workspaceId: string) {
    return this.scim.listTokens(workspaceId)
  }

  @Post()
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { name: string; expiresAt?: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null
    return this.scim.createToken(workspaceId, user.id, { name: body.name, expiresAt })
  }

  @Delete(':tokenId')
  revoke(
    @Param('workspaceId') workspaceId: string,
    @Param('tokenId') tokenId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.scim.revokeToken(workspaceId, tokenId, user.id)
  }
}

// ─── SCIM 2.0 protocol surface (bearer-token-protected) ─────────────────────
//
// Note: SCIM clients (Okta, Azure AD, etc.) use long-lived bearer tokens we
// issue in the admin UI, NOT the workspace JWT. Each method extracts the
// token from the Authorization header and asks the service to resolve it to
// a workspaceId.

@ApiTags('scim')
@Controller('scim/v2')
export class ScimController {
  constructor(private scim: ScimService) {}

  @Get('ServiceProviderConfig')
  serviceProviderConfig() {
    return this.scim.serviceProviderConfig()
  }

  @Get('ResourceTypes')
  resourceTypes() {
    return this.scim.resourceTypes()
  }

  @Get('Schemas')
  schemas() {
    return this.scim.schemas()
  }

  @Get('Users')
  async listUsers(
    @Headers('authorization') authHeader: string | undefined,
    @Query('startIndex') startIndex?: string,
    @Query('count') count?: string,
    @Query('filter') filter?: string,
  ) {
    const workspaceId = await this.scim.authenticate(this.extractBearer(authHeader))
    return this.scim.listUsers(workspaceId, {
      startIndex: startIndex ? Number(startIndex) : undefined,
      count: count ? Number(count) : undefined,
      filter,
    })
  }

  @Get('Users/:id')
  async getUser(
    @Headers('authorization') authHeader: string | undefined,
    @Param('id') id: string,
  ) {
    const workspaceId = await this.scim.authenticate(this.extractBearer(authHeader))
    return this.scim.getUser(workspaceId, id)
  }

  @Post('Users')
  @HttpCode(201)
  async createUser(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: any,
    @Res({ passthrough: true }) res: any,
  ) {
    const workspaceId = await this.scim.authenticate(this.extractBearer(authHeader))
    const created = await this.scim.createUser(workspaceId, null, body)
    res.code?.(201)
    return created
  }

  @Put('Users/:id')
  async replaceUser(
    @Headers('authorization') authHeader: string | undefined,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const workspaceId = await this.scim.authenticate(this.extractBearer(authHeader))
    return this.scim.replaceUser(workspaceId, id, null, body)
  }

  @Patch('Users/:id')
  async patchUser(
    @Headers('authorization') authHeader: string | undefined,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const workspaceId = await this.scim.authenticate(this.extractBearer(authHeader))
    return this.scim.patchUser(workspaceId, id, null, body)
  }

  @Delete('Users/:id')
  @HttpCode(204)
  async deleteUser(
    @Headers('authorization') authHeader: string | undefined,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: any,
  ) {
    const workspaceId = await this.scim.authenticate(this.extractBearer(authHeader))
    await this.scim.deleteUser(workspaceId, id, null)
    res.code?.(204)
    return
  }

  // ─── SCIM 2.0 Groups ──────────────────────────────────────────────────────

  @Get('Groups')
  async listGroups(
    @Headers('authorization') authHeader: string | undefined,
    @Query('startIndex') startIndex?: string,
    @Query('count') count?: string,
    @Query('filter') filter?: string,
  ) {
    const workspaceId = await this.scim.authenticate(this.extractBearer(authHeader))
    return this.scim.listGroups(workspaceId, {
      startIndex: startIndex ? Number(startIndex) : undefined,
      count: count ? Number(count) : undefined,
      filter,
    })
  }

  @Get('Groups/:id')
  async getGroup(
    @Headers('authorization') authHeader: string | undefined,
    @Param('id') id: string,
  ) {
    const workspaceId = await this.scim.authenticate(this.extractBearer(authHeader))
    return this.scim.getGroup(workspaceId, id)
  }

  @Post('Groups')
  @HttpCode(201)
  async createGroup(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: any,
    @Res({ passthrough: true }) res: any,
  ) {
    const workspaceId = await this.scim.authenticate(this.extractBearer(authHeader))
    const created = await this.scim.createGroup(workspaceId, null, body)
    res.code?.(201)
    return created
  }

  @Put('Groups/:id')
  async replaceGroup(
    @Headers('authorization') authHeader: string | undefined,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const workspaceId = await this.scim.authenticate(this.extractBearer(authHeader))
    return this.scim.replaceGroup(workspaceId, id, null, body)
  }

  @Patch('Groups/:id')
  async patchGroup(
    @Headers('authorization') authHeader: string | undefined,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const workspaceId = await this.scim.authenticate(this.extractBearer(authHeader))
    return this.scim.patchGroup(workspaceId, id, null, body)
  }

  @Delete('Groups/:id')
  @HttpCode(204)
  async deleteGroup(
    @Headers('authorization') authHeader: string | undefined,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: any,
  ) {
    const workspaceId = await this.scim.authenticate(this.extractBearer(authHeader))
    await this.scim.deleteGroup(workspaceId, id, null)
    res.code?.(204)
    return
  }

  private extractBearer(headerValue?: string): string | undefined {
    if (!headerValue) return undefined
    const match = headerValue.match(/^Bearer\s+(.+)$/i)
    return match?.[1]
  }
}
